import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'secure-store.json')
}

/** Reads the store file; a corrupt file is renamed to `.corrupt` and treated as empty. */
function readStoreFile(): Record<string, string> {
  const storePath = getStorePath()
  if (!fs.existsSync(storePath)) {
    return {}
  }
  let text: string
  try {
    text = fs.readFileSync(storePath, 'utf-8')
  } catch {
    console.error('secure-store.json не читается — ключи недоступны')
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    parsed = undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('secure-store.json повреждён — ключи нужно ввести заново')
    try {
      fs.renameSync(storePath, `${storePath}.corrupt`)
    } catch {
      // ignored: the app must start anyway
    }
    return {}
  }
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key] = value
    }
  }
  return result
}

/** Atomic write: a temp file, then a rename. */
function writeStoreFile(data: Record<string, string>): void {
  const storePath = getStorePath()
  const tmpPath = `${storePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 })
  fs.renameSync(tmpPath, storePath)
}

/**
 * Generic OS-keychain-backed secret store (via Electron's `safeStorage`).
 * Encrypted values are persisted as base64 in a JSON file under the app's
 * `userData` directory — `safeStorage` only encrypts/decrypts buffers, it
 * does not persist them, so the file I/O is our responsibility.
 * Corrupt files and undecryptable values are treated as missing.
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

/** Returns the secret, or undefined when it is missing or cannot be decrypted. */
export function loadSecret(key: string): string | undefined {
  const data = readStoreFile()
  const encrypted = data[key]
  if (!encrypted) {
    return undefined
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    console.error(`Не удалось расшифровать ${key} — введите его заново`)
    return undefined
  }
}

/** Removes a secret; the file is not rewritten when the key is absent. */
export function clearSecret(key: string): void {
  const data = readStoreFile()
  if (!Object.prototype.hasOwnProperty.call(data, key)) {
    return
  }
  delete data[key]
  writeStoreFile(data)
}
