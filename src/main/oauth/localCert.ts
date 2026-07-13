import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import selfsigned from 'selfsigned'

export interface LocalCert {
  key: string
  cert: string
}

/**
 * Meta requires HTTPS for every OAuth redirect_uri, including loopback ones — plain
 * http://127.0.0.1 is rejected outright. Generates (and caches) a self-signed cert for
 * 127.0.0.1 so the local callback server can speak HTTPS. The browser will show a
 * one-time certificate warning on each OAuth connect; that's expected for a local,
 * non-public loopback endpoint.
 */
export async function getOrCreateLocalCert(): Promise<LocalCert> {
  const certDir = join(app.getPath('userData'), 'oauth-cert')
  const keyPath = join(certDir, 'key.pem')
  const certPath = join(certDir, 'cert.pem')

  if (existsSync(keyPath) && existsSync(certPath)) {
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') }
  }

  const notAfterDate = new Date()
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 10)

  const pems = await selfsigned.generate([{ name: 'commonName', value: '127.0.0.1' }], {
    notAfterDate,
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 7, ip: '127.0.0.1' },
          { type: 2, value: 'localhost' }
        ]
      }
    ]
  })

  mkdirSync(certDir, { recursive: true })
  writeFileSync(keyPath, pems.private)
  writeFileSync(certPath, pems.cert)

  return { key: pems.private, cert: pems.cert }
}
