import FormData from 'form-data'
import { graphGet, graphPost, graphPostMultipart } from './client'

export interface FbPageDetails {
  id: string
  name: string
  about?: string
  picture: { data: { url: string } }
}

export async function fetchPageDetails(pageFbId: string, token: string): Promise<FbPageDetails> {
  return graphGet<FbPageDetails>(`/${pageFbId}`, {
    access_token: token,
    fields: 'id,name,about,picture{url}'
  })
}

export async function updatePageInfo(
  pageFbId: string,
  token: string,
  patch: { name?: string; about?: string }
): Promise<void> {
  await graphPost<{ success: boolean }>(`/${pageFbId}`, { ...patch, access_token: token })
}

export async function updatePagePicture(
  pageFbId: string,
  token: string,
  pictureUrl: string
): Promise<void> {
  await graphPost<{ success: boolean }>(`/${pageFbId}/picture`, {
    url: pictureUrl,
    access_token: token
  })
}

export async function uploadPagePicture(
  pageFbId: string,
  token: string,
  imageBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<void> {
  const form = new FormData()
  form.append('source', imageBuffer, { filename: fileName, contentType: mimeType })
  form.append('access_token', token)
  await graphPostMultipart<{ success: boolean }>(`/${pageFbId}/picture`, form)
}

/**
 * Kept as a plain array (matches the convention in graph/insights.ts) since Meta
 * periodically renames/deprecates Page Insights metrics.
 */
export const PAGE_INSIGHT_METRICS = ['page_impressions_unique']

export interface PageSnapshotData {
  followerCount: number
  pageReach: number | null
}

interface PageFollowerResponse {
  followers_count?: number
}

interface PageInsightsResponse {
  data: Array<{ name: string; values: Array<{ value: number }> }>
}

/**
 * Fetches current follower count and (if the page/permission allows it) reach.
 * `pageReach` is null on any Insights failure rather than throwing, since not every
 * connected Page has the permission/feature required for page-level Insights.
 */
export async function fetchPageFollowerAndReach(pageFbId: string, token: string): Promise<PageSnapshotData> {
  const followerRes = await graphGet<PageFollowerResponse>(`/${pageFbId}`, {
    access_token: token,
    fields: 'followers_count'
  })

  let pageReach: number | null = null
  try {
    const insightsRes = await graphGet<PageInsightsResponse>(`/${pageFbId}/insights`, {
      access_token: token,
      metric: PAGE_INSIGHT_METRICS.join(','),
      period: 'day'
    })
    const latest = insightsRes.data[0]?.values.at(-1)
    if (latest) pageReach = latest.value
  } catch (err) {
    console.error(`[page-snapshot] reach fetch failed for ${pageFbId}`, err)
  }

  return { followerCount: followerRes.followers_count ?? 0, pageReach }
}
