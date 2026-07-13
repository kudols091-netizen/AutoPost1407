import { shell } from 'electron'
import { getMetaAppConfig } from '../config/metaApp'
import { encryptToken } from '../security/safeStorage'
import { upsertPage, listPages } from '../db/repositories/pagesRepo'
import { addSystemLog } from '../db/repositories/systemLogsRepo'
import { startLoopbackAuth } from './loopbackServer'
import {
  buildAuthorizeUrl,
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchManagedPages
} from './tokenExchange'

/** Opens the system browser for Facebook Login for Business, then stores connected Pages. */
export async function connectFacebookPages(): Promise<Awaited<ReturnType<typeof listPages>>> {
  const { appId } = getMetaAppConfig()
  const auth = await startLoopbackAuth()

  const authorizeUrl = buildAuthorizeUrl({
    redirectUri: auth.redirectUri,
    state: auth.state,
    appId
  })

  await shell.openExternal(authorizeUrl)

  const code = await auth.waitForCode()
  const shortLivedToken = await exchangeCodeForUserToken(code, auth.redirectUri)
  const longLivedToken = await exchangeForLongLivedUserToken(shortLivedToken)
  const pages = await fetchManagedPages(longLivedToken)

  for (const page of pages) {
    await upsertPage({
      fbPageId: page.id,
      name: page.name,
      category: page.category ?? null,
      pictureUrl: page.picture?.data?.url ?? null,
      accessTokenEnc: encryptToken(page.access_token)
    })
  }

  await addSystemLog({
    level: 'info',
    category: 'oauth',
    message: `Đã kết nối ${pages.length} Page qua Facebook Login`
  })

  return listPages()
}
