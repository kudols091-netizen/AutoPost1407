import { app } from 'electron'
import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'

export interface ImportedMedia {
  localFilePath: string
  mimeType: string
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
}

export function importMedia(data: Buffer, originalName: string, mimeType: string): ImportedMedia {
  const mediaDir = join(app.getPath('userData'), 'media')
  mkdirSync(mediaDir, { recursive: true })

  const ext = extname(originalName) || EXT_BY_MIME[mimeType] || ''
  const localFilePath = join(mediaDir, `${randomUUID()}${ext}`)
  writeFileSync(localFilePath, data)

  return { localFilePath, mimeType }
}
