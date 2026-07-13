import 'dotenv/config'

export const GRAPH_API_VERSION = 'v25.0'
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export interface MetaAppConfig {
  appId: string
  appSecret: string
}

export class MetaAppNotConfiguredError extends Error {
  constructor() {
    super(
      'META_APP_ID / META_APP_SECRET are not set. Copy .env.example to .env and fill in your Meta App credentials from developers.facebook.com/apps.'
    )
    this.name = 'MetaAppNotConfiguredError'
  }
}

export function getMetaAppConfig(): MetaAppConfig {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET

  if (!appId || !appSecret) {
    throw new MetaAppNotConfiguredError()
  }

  return { appId, appSecret }
}
