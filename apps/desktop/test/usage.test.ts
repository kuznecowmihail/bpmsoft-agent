import { describe, it, expect } from 'vitest'
import { formatTokens, formatUsage } from '../src/shared/usage'
import { agentEventToLog } from '../src/renderer/src/chatFormat'

describe('formatTokens', () => {
  it('shows small numbers as is', () => {
    expect(formatTokens(950)).toBe('950')
  })

  it('shows thousands rounded with "тыс."', () => {
    expect(formatTokens(452694)).toBe('453 тыс.')
  })

  it('shows millions with one decimal and a comma', () => {
    expect(formatTokens(1250000)).toBe('1,3 млн')
  })
})

describe('formatUsage', () => {
  it('omits the cache part when there are no cache reads', () => {
    expect(formatUsage({ inputTokens: 453000, outputTokens: 8000, cacheReadTokens: 0, cacheWriteTokens: 0 }))
      .toBe('токены: вход 453 тыс. · выход 8 тыс.')
  })

  it('includes the cache part when there are cache reads', () => {
    expect(formatUsage({ inputTokens: 453000, outputTokens: 8000, cacheReadTokens: 333000, cacheWriteTokens: 0 }))
      .toBe('токены: вход 453 тыс. · кэш 333 тыс. · выход 8 тыс.')
  })

  it('includes the cache-write part when there are cache writes', () => {
    expect(formatUsage({ inputTokens: 22, outputTokens: 4000, cacheReadTokens: 580000, cacheWriteTokens: 30000 }))
      .toBe('токены: вход 22 · кэш 580 тыс. · запись в кэш 30 тыс. · выход 4 тыс.')
  })
})

describe('agentEventToLog with usage', () => {
  it('shows tokens of a result', () => {
    const log = agentEventToLog({
      type: 'result',
      success: true,
      durationMs: 5000,
      usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 }
    })
    expect(log.message).toContain('токены:')
  })
})
