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
    decryptString: (buffer: Buffer) => buffer.toString('utf-8').replace(/^enc:/, '')
  }
}))

import { saveSecret, loadSecret, clearSecret } from '../src/main/secureStore'

describe('secureStore', () => {
  const storeFile = path.join(tmpDir, 'secure-store.json')

  beforeEach(() => {
    if (fs.existsSync(storeFile)) {
      fs.rmSync(storeFile)
    }
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
})
