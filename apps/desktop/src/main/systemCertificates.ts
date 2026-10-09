import * as tls from 'tls'

interface TlsCaApi {
  getCACertificates?: (type: 'default' | 'system' | 'bundled' | 'extra') => string[]
  setDefaultCACertificates?: (certs: string[]) => void
}

/**
 * Adds the OS certificate store to Node's default trusted CAs, so HTTPS requests from
 * the main process (Cursor SDK fetch) work behind corporate proxies/VPNs that re-sign
 * TLS with their own root certificate trusted by macOS. Returns how many system
 * certificates were added (0 when the Node API is unavailable or fails).
 */
export function trustSystemCertificates(api: TlsCaApi = tls as unknown as TlsCaApi): number {
  if (!api.getCACertificates || !api.setDefaultCACertificates) {
    return 0
  }
  try {
    const defaults = api.getCACertificates('default')
    const system = api.getCACertificates('system')
    const merged = Array.from(new Set([...defaults, ...system]))
    api.setDefaultCACertificates(merged)
    return merged.length - defaults.length
  } catch (error) {
    console.error('Не удалось подключить системные сертификаты:', error)
    return 0
  }
}
