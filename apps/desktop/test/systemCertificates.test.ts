import { describe, it, expect, vi } from 'vitest'
import { trustSystemCertificates } from '../src/main/systemCertificates'

describe('systemCertificates', () => {
  it('merges default+system without duplicates and passes them to setDefaultCACertificates', () => {
    const setDefaultCACertificates = vi.fn()
    const api = {
      getCACertificates: (type: string) => {
        if (type === 'default') return ['cert1', 'cert2', 'cert3']
        if (type === 'system') return ['cert2', 'cert3', 'cert4', 'cert5']
        return []
      },
      setDefaultCACertificates
    }

    const added = trustSystemCertificates(api)

    expect(setDefaultCACertificates).toHaveBeenCalledWith(['cert1', 'cert2', 'cert3', 'cert4', 'cert5'])
    expect(added).toBe(2)
  })

  it('returns the number of added certs', () => {
    const api = {
      getCACertificates: (type: string) => {
        if (type === 'default') return ['a', 'b']
        if (type === 'system') return ['b', 'c', 'd']
        return []
      },
      setDefaultCACertificates: vi.fn()
    }

    const added = trustSystemCertificates(api)

    expect(added).toBe(2)
  })

  it('returns 0 when getCACertificates is missing', () => {
    const api = {
      setDefaultCACertificates: vi.fn()
    }

    const added = trustSystemCertificates(api as any)

    expect(added).toBe(0)
  })

  it('returns 0 when setDefaultCACertificates is missing', () => {
    const api = {
      getCACertificates: () => ['cert1']
    }

    const added = trustSystemCertificates(api as any)

    expect(added).toBe(0)
  })

  it('returns 0 and does not throw when getCACertificates throws', () => {
    const setDefaultCACertificates = vi.fn()
    const api = {
      getCACertificates: () => {
        throw new Error('Simulated error')
      },
      setDefaultCACertificates
    }

    const added = trustSystemCertificates(api)

    expect(added).toBe(0)
    expect(setDefaultCACertificates).not.toHaveBeenCalled()
  })
})
