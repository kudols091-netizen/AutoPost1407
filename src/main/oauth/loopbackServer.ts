import https, { type Server } from 'https'
import { randomBytes } from 'crypto'
import { getOrCreateLocalCert } from './localCert'

/**
 * Fixed on purpose: Meta validates the OAuth redirect_uri against the app's registered
 * "Valid OAuth Redirect URIs" list, so it must be the same URI every run, not an
 * ephemeral port. Register `https://127.0.0.1:${OAUTH_CALLBACK_PORT}/callback` in the
 * Meta App Dashboard under Facebook Login > Settings (Meta requires HTTPS for every
 * redirect URI, including loopback ones — see localCert.ts).
 */
export const OAUTH_CALLBACK_PORT = 53682

interface LoopbackAuth {
  redirectUri: string
  state: string
  /** Resolves with the authorization code once Meta redirects back, or rejects on error/timeout. */
  waitForCode: () => Promise<string>
  close: () => void
}

const SUCCESS_HTML = `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:3rem">
<h2>AutoPost connected.</h2><p>You can close this window and return to the app.</p></body></html>`

const FAILURE_HTML = (message: string): string =>
  `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:3rem">
<h2>Connection failed</h2><p>${message}</p><p>You can close this window and try again in AutoPost.</p></body></html>`

interface ActiveSession {
  server: Server
  cancel: () => void
}

// Only one loopback session can bind OAUTH_CALLBACK_PORT at a time. If the user clicks
// "Connect" again while a prior attempt is still waiting (e.g. they closed the browser
// tab without finishing login), cancel and close that one first instead of failing with
// EADDRINUSE.
let activeSession: ActiveSession | null = null

async function closeActiveSession(): Promise<void> {
  if (!activeSession) return
  const session = activeSession
  activeSession = null
  session.cancel()
  await new Promise<void>((resolve) => session.server.close(() => resolve()))
}

export async function startLoopbackAuth(timeoutMs = 5 * 60 * 1000): Promise<LoopbackAuth> {
  await closeActiveSession()

  const state = randomBytes(16).toString('hex')
  const { key, cert } = await getOrCreateLocalCert()

  return new Promise((resolveServer, rejectServer) => {
    let resolveCode: (code: string) => void
    let rejectCode: (err: Error) => void
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res
      rejectCode = rej
    })

    const timer = setTimeout(() => {
      rejectCode(new Error('Timed out waiting for Facebook to redirect back to AutoPost.'))
      if (activeSession?.server === server) activeSession = null
      server.close()
    }, timeoutMs)

    const server: Server = https.createServer({ key, cert }, (req, res) => {
      const url = new URL(req.url ?? '/', 'https://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }

      const returnedState = url.searchParams.get('state')
      const code = url.searchParams.get('code')
      const errorDescription = url.searchParams.get('error_description')

      clearTimeout(timer)
      if (activeSession?.server === server) activeSession = null

      if (errorDescription) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(FAILURE_HTML(errorDescription))
        rejectCode(new Error(errorDescription))
        return
      }

      if (returnedState !== state || !code) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(FAILURE_HTML('Invalid response.'))
        rejectCode(new Error('OAuth state mismatch or missing code.'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_HTML)
      resolveCode(code)
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (activeSession?.server === server) activeSession = null
      if (err.code === 'EADDRINUSE') {
        rejectServer(
          new Error(
            `Port ${OAUTH_CALLBACK_PORT} is already in use by another program (not AutoPost). Close it and try again.`
          )
        )
        return
      }
      rejectServer(err)
    })

    server.listen(OAUTH_CALLBACK_PORT, '127.0.0.1', () => {
      activeSession = {
        server,
        cancel: () => rejectCode(new Error('Cancelled: a new connection attempt was started.'))
      }

      resolveServer({
        redirectUri: `https://127.0.0.1:${OAUTH_CALLBACK_PORT}/callback`,
        state,
        waitForCode: () =>
          codePromise.finally(() => {
            clearTimeout(timer)
            if (activeSession?.server === server) activeSession = null
            server.close()
          }),
        close: () => {
          if (activeSession?.server === server) activeSession = null
          server.close()
        }
      })
    })
  })
}
