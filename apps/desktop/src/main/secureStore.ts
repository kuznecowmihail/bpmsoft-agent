import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'secure-store.json')
}

/**
 * Secrets of this run. They are always kept here; the encrypted file is written in addition when the OS can encrypt.
 * On Linux without a secret service (gnome-keyring, KWallet) Electron cannot protect anything on disk, so the memory
 * copy is the only one and the secrets are gone when the app closes.
 */
const memory = new Map<string, string>()

function readStoreFile(): Record<string, string> {
  try {
    const storePath = getStorePath()
    if (!fs.existsSync(storePath)) {
      return {}
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {}
  } catch {
    // an unreadable file holds nothing usable: the user enters the keys again instead of the app failing to start
    return {}
  }
}

function writeStoreFile(data: Record<string, string>): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(data), 'utf-8')
}

/**
 * True when the OS can encrypt secrets for the disk. On Linux Electron falls back to a hardcoded key ("basic_text",
 * effectively plain text) when there is no secret service: that does not count as protected.
 */
export function canPersistSecrets(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return false
    }
    const backend = (safeStorage as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend?.()
    return backend !== 'basic_text' && backend !== 'unknown'
  } catch {
    return false
  }
}

/**
 * Generic OS-keychain-backed secret store (via Electron's `safeStorage`: Keychain on macOS, DPAPI on Windows,
 * libsecret/KWallet on Linux). Encrypted values are persisted as base64 in a JSON file under the app's
 * `userData` directory — `safeStorage` only encrypts/decrypts buffers, it
 * does not persist them, so the file I/O is our responsibility.
 * Never throws because the OS store is missing or its data cannot be decrypted: the secret stays available for this run.
 */
export function saveSecret(key: string, value: string): void {
  memory.set(key, value)
  if (!canPersistSecrets()) {
    return
  }
  try {
    const data = readStoreFile()
    data[key] = safeStorage.encryptString(value).toString('base64')
    writeStoreFile(data)
  } catch (error) {
    console.error('Не удалось сохранить секрет в хранилище ОС:', error)
  }
}

export function loadSecret(key: string): string | undefined {
  const cached = memory.get(key)
  if (cached !== undefined) {
    return cached
  }
  const encrypted = readStoreFile()[key]
  if (!encrypted || !canPersistSecrets()) {
    return undefined
  }
  try {
    const value = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    memory.set(key, value)
    return value
  } catch (error) {
    // the OS key changed (new Windows profile key, reset keychain, another Linux secret service): the user enters the secret again
    console.error('Не удалось прочитать секрет из хранилища ОС:', error)
    return undefined
  }
}

export function clearSecret(key: string): void {
  memory.delete(key)
  try {
    const data = readStoreFile()
    if (key in data) {
      delete data[key]
      writeStoreFile(data)
    }
  } catch (error) {
    console.error('Не удалось удалить секрет из хранилища ОС:', error)
  }
}
