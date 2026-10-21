/** Token count for the chat: "950", "453 тыс.", "1,3 млн". */
export function formatTokens(n: number): string {
  if (n < 1000) {
    return String(n)
  }
  if (n < 1_000_000) {
    return `${Math.round(n / 1000)} тыс.`
  }
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')} млн`
}

/**
 * "токены: вход 453 тыс. · кэш 333 тыс. · запись в кэш 12 тыс. · выход 8 тыс.".
 * The cache part is omitted when there are no cache reads, the cache-write part when there are no cache writes.
 */
export function formatUsage(u: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }): string {
  const parts = [`вход ${formatTokens(u.inputTokens)}`]
  if (u.cacheReadTokens > 0) {
    parts.push(`кэш ${formatTokens(u.cacheReadTokens)}`)
  }
  if (u.cacheWriteTokens > 0) {
    parts.push(`запись в кэш ${formatTokens(u.cacheWriteTokens)}`)
  }
  parts.push(`выход ${formatTokens(u.outputTokens)}`)
  return `токены: ${parts.join(' · ')}`
}
