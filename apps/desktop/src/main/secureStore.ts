import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'secure-store.json')
}

function readStoreFile(): Record<string, string> {
  const storePath = getStorePath()
  if (!fs.existsSync(storePath)) {
    return {}
  }
  return JSON.parse(fs.readFileSync(storePath, 'utf-8')) as Record<string, string>
}

function writeStoreFile(data: Record<string, string>): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(data), 'utf-8')
}

/**
 * Generic OS-keychain-backed secret store (via Electron's `safeStorage`).
 * Encrypted values are persisted as base64 in a JSON file under the app's
 * `userData` directory — `safeStorage` only encrypts/decrypts buffers, it
 * does not persist them, so the file I/O is our responsibility.
 */
export function saveSecret(key: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Безопасное хранилище ОС недоступно на этой машине')
  }
  const encrypted = safeStorage.encryptString(value).toString('base64')
  const data = readStoreFile()
  data[key] = encrypted
  writeStoreFile(data)
}

export function loadSecret(key: string): string | undefined {
  const data = readStoreFile()
  const encrypted = data[key]
  if (!encrypted) {
    return undefined
  }
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

export function clearSecret(key: string): void {
  const data = readStoreFile()
  delete data[key]
  writeStoreFile(data)
}
