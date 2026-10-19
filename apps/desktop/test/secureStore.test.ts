import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpmsoft-secure-store-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpDir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf-8'),
    decryptString: (buffer: Buffer) => {
      const text = buffer.toString('utf-8')
      if (!text.startsWith('enc:')) {
        throw new Error('decrypt failed')
      }
      return text.slice('enc:'.length)
    }
  }
}))

import { saveSecret, loadSecret, clearSecret } from '../src/main/secureStore'

describe('secureStore', () => {
  const storeFile = path.join(tmpDir, 'secure-store.json')
  const corruptFile = `${storeFile}.corrupt`
  const tmpFile = `${storeFile}.tmp`

  beforeEach(() => {
    fs.rmSync(storeFile, { force: true })
    fs.rmSync(corruptFile, { force: true })
    fs.rmSync(tmpFile, { force: true })
  })

  it('returns undefined for a key that was never saved', () => {
    expect(loadSecret('missing-key')).toBeUndefined()
  })

  it('round-trips a saved secret', () => {
    saveSecret('my-key', 'super-secret-value')
    expect(loadSecret('my-key')).toBe('super-secret-value')
  })

  it('removes a secret on clear', () => {
    saveSecret('my-key', 'value')
    clearSecret('my-key')
    expect(loadSecret('my-key')).toBeUndefined()
  })

  it('treats a corrupt store file as missing and renames it', () => {
    fs.writeFileSync(storeFile, '{not json', 'utf-8')
    expect(() => loadSecret('my-key')).not.toThrow()
    expect(loadSecret('my-key')).toBeUndefined()
    expect(fs.existsSync(corruptFile)).toBe(true)

    saveSecret('my-key', 'fresh-value')
    expect(loadSecret('my-key')).toBe('fresh-value')
  })

  it('treats an undecryptable value as missing', () => {
    const plain = Buffer.from('plain-text', 'utf-8').toString('base64')
    fs.writeFileSync(storeFile, JSON.stringify({ 'my-key': plain }), 'utf-8')
    expect(() => loadSecret('my-key')).not.toThrow()
    expect(loadSecret('my-key')).toBeUndefined()
  })

  it('does not create the store file when clearing a missing key', () => {
    clearSecret('nope')
    expect(fs.existsSync(storeFile)).toBe(false)
  })

  it('leaves no temporary file after saving', () => {
    saveSecret('my-key', 'value')
    expect(fs.existsSync(tmpFile)).toBe(false)
  })
})
