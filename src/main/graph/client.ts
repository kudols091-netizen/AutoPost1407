import axios, { isAxiosError } from 'axios'
import PQueue from 'p-queue'
import type FormData from 'form-data'
import { GRAPH_API_BASE } from '../config/metaApp'

interface GraphErrorPayload {
  message: string
  type: string
  code: number
  error_subcode?: number
  fbtrace_id?: string
}

export class GraphApiError extends Error {
  code: number
  subcode?: number
  fbtraceId?: string

  constructor(payload: GraphErrorPayload) {
    super(payload.message)
    this.name = 'GraphApiError'
    this.code = payload.code
    this.subcode = payload.error_subcode
    this.fbtraceId = payload.fbtrace_id
  }

  /** OAuthException: token invalid/expired/revoked — Page needs to be reconnected. */
  get isAuthError(): boolean {
    return this.code === 190
  }

  /** Business Use Case rate limiting. */
  get isRateLimited(): boolean {
    return this.code === 4 || this.code === 17 || this.code === 32 || this.code === 613
  }
}

const http = axios.create({ baseURL: GRAPH_API_BASE, timeout: 30_000 })

// Meta's Business Use Case rate limiting is per Page/app — a small shared concurrency cap
// with light spacing avoids bursts across bulk multi-page scheduling operations.
const queue = new PQueue({ concurrency: 4, interval: 1000, intervalCap: 8 })

function toGraphError(err: unknown): GraphApiError | unknown {
  if (isAxiosError(err) && err.response?.data?.error) {
    return new GraphApiError(err.response.data.error as GraphErrorPayload)
  }
  return err
}

async function withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn()
  } catch (rawErr) {
    const err = toGraphError(rawErr)
    if (err instanceof GraphApiError && err.isRateLimited && attempt < 3) {
      const backoffMs = 2 ** attempt * 1000
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
      return withRetry(fn, attempt + 1)
    }
    throw err
  }
}

export function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  return queue.add(() =>
    withRetry(async () => {
      const res = await http.get<T>(path, { params })
      return res.data
    })
  ) as Promise<T>
}

export function graphPost<T>(path: string, params: Record<string, unknown>): Promise<T> {
  return queue.add(() =>
    withRetry(async () => {
      const res = await http.post<T>(path, null, { params })
      return res.data
    })
  ) as Promise<T>
}

export function graphPostMultipart<T>(path: string, form: FormData): Promise<T> {
  return queue.add(() =>
    withRetry(async () => {
      const res = await http.post<T>(path, form, { headers: form.getHeaders() })
      return res.data
    })
  ) as Promise<T>
}

export function graphDelete<T>(path: string, params: Record<string, string>): Promise<T> {
  return queue.add(() =>
    withRetry(async () => {
      const res = await http.delete<T>(path, { params })
      return res.data
    })
  ) as Promise<T>
}
