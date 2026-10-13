import { describe, it, expect } from 'vitest'
import { isExternalWebUrl } from '../src/main/urlPolicy'

describe('isExternalWebUrl', () => {
  it('accepts https and http links', () => {
    expect(isExternalWebUrl('https://example.com/path?q=1')).toBe(true)
    expect(isExternalWebUrl('http://example.com')).toBe(true)
  })

  it('rejects non-web schemes and malformed urls', () => {
    expect(isExternalWebUrl('file:///etc/passwd')).toBe(false)
    expect(isExternalWebUrl('smb://host/share')).toBe(false)
    expect(isExternalWebUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalWebUrl('mailto:a@b.c')).toBe(false)
    expect(isExternalWebUrl('not a url')).toBe(false)
  })
})
