/** Only web links leave the app (to the system browser); file:, smb:, custom app schemes and the like are ignored. */
export function isExternalWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
