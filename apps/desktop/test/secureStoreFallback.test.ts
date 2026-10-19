import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpmsoft-secure-store-fallback-'))

// Behaviour of the OS store, switched per test
const os_ = vi.hoisted(() => ({ available: true, backend: 'gnome_libsecret' as string | undefined, decryptFails: false }))

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
  safeStorage: {
    isEncryptionAvailable: () => os_.available,
    getSelectedStorageBackend: () => os_.backend,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf-8'),
    decryptString: (buffer: Buffer) => {
      if (os_.decryptFails) throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString')
      return buffer.toString('utf-8').replace(/^enc:/, '')
    }
  }
}))

import { saveSecret, loadSecret, clearSecret, canPersistSecrets } from '../src/main/secureStore'

describe('secureStore without a usable OS store', () => {
  const storeFile = path.join(tmpDir, 'secure-store.json')

  beforeEach(() => {
    os_.available = true
    os_.backend = 'gnome_libsecret'
    os_.decryptFails = false
    clearSecret('k')
    if (fs.existsSync(storeFile)) fs.rmSync(storeFile)
  })

  it('keeps the secret for this run and writes nothing when encryption is unavailable', () => {
    os_.available = false
    saveSecret('k', 'v')
    expect(loadSecret('k')).toBe('v')
    expect(fs.existsSync(storeFile)).toBe(false)
    expect(canPersistSecrets()).toBe(false)
  })

  it('does not count the Linux basic_text backend (hardcoded key) as protected', () => {
    os_.backend = 'basic_text'
    saveSecret('k', 'v')
    expect(canPersistSecrets()).toBe(false)
    expect(fs.existsSync(storeFile)).toBe(false)
    expect(loadSecret('k')).toBe('v')
  })

  it('writes the encrypted value when the OS store works', () => {
    saveSecret('k', 'v')
    expect(canPersistSecrets()).toBe(true)
    expect(JSON.parse(fs.readFileSync(storeFile, 'utf-8')).k).toBe(Buffer.from('enc:v').toString('base64'))
  })

  it('returns undefined instead of throwing when the stored value cannot be decrypted', () => {
    fs.writeFileSync(storeFile, JSON.stringify({ k: Buffer.from('enc:old').toString('base64') }))
    os_.decryptFails = true
    expect(() => loadSecret('k')).not.toThrow()
    expect(loadSecret('k')).toBeUndefined()
  })

  it('ignores a corrupt store file', () => {
    fs.writeFileSync(storeFile, '{not json')
    expect(loadSecret('k')).toBeUndefined()
    expect(() => saveSecret('k', 'v')).not.toThrow()
    expect(loadSecret('k')).toBe('v')
  })

  it('clears the secret from memory and from the file', () => {
    saveSecret('k', 'v')
    clearSecret('k')
    expect(loadSecret('k')).toBeUndefined()
    expect(JSON.parse(fs.readFileSync(storeFile, 'utf-8')).k).toBeUndefined()
  })
})
