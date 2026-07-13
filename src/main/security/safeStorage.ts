import { safeStorage } from 'electron'

export class EncryptionUnavailableError extends Error {
  constructor() {
    super(
      'OS-level credential encryption is unavailable on this machine, so Page access tokens cannot be stored securely.'
    )
    this.name = 'EncryptionUnavailableError'
  }
}

export function encryptToken(plainText: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new EncryptionUnavailableError()
  }
  return safeStorage.encryptString(plainText)
}

export function decryptToken(encrypted: Buffer): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new EncryptionUnavailableError()
  }
  return safeStorage.decryptString(encrypted)
}
