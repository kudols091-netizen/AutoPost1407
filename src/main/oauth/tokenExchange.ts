import { graphGet } from '../graph/client'
import { getMetaAppConfig } from '../config/metaApp'

interface AccessTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

export interface ManagedPage {
  id: string
  name: string
  category: string
  access_token: string
  picture?: { data?: { url?: string } }
}

interface ManagedPagesResponse {
  data: ManagedPage[]
}

export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string
): Promise<string> {
  const { appId, appSecret } = getMetaAppConfig()
  const res = await graphGet<AccessTokenResponse>('/oauth/access_token', {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code
  })
  return res.access_token
}

/** Long-lived User tokens last ~60 days; Page tokens derived from them are effectively non-expiring. */
export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<string> {
  const { appId, appSecret } = getMetaAppConfig()
  const res = await graphGet<AccessTokenResponse>('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken
  })
  return res.access_token
}

export async function fetchManagedPages(userAccessToken: string): Promise<ManagedPage[]> {
  const res = await graphGet<ManagedPagesResponse>('/me/accounts', {
    access_token: userAccessToken,
    fields: 'id,name,category,access_token,picture{url}'
  })
  return res.data
}

export function buildAuthorizeUrl(params: {
  redirectUri: string
  state: string
  appId: string
}): string {
  const scopes = [
    'pages_show_list',
    'pages_manage_posts',
    'pages_read_engagement',
    'read_insights'
  ].join(',')

  const url = new URL('https://www.facebook.com/v25.0/dialog/oauth')
  url.searchParams.set('client_id', params.appId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  url.searchParams.set('scope', scopes)
  url.searchParams.set('response_type', 'code')
  return url.toString()
}
