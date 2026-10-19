import { describe, it, expect } from 'vitest'
import { parseChatLog, chatTitle } from '../src/main/chatReplay'

const records: Array<Record<string, unknown>> = [
  { ts: '2026-10-19T12:01:24.363Z', kind: 'chat_start', projectPath: '/p/Pkg', readRoot: '/p' },
  {
    ts: '2026-10-19T12:01:25.000Z',
    kind: 'user_message',
    text: 'опиши',
    afterStop: false,
    resume: null,
    provider: 'claude',
    model: { id: null, effort: null },
    dbAccess: true,
    crmActions: true,
    crmBrowser: true
  },
  {
    ts: '2026-10-19T12:01:26.000Z',
    kind: 'agent_event',
    event: { type: 'system_init', model: 'm', mcpServers: [], sessionId: 'sid-1' }
  },
  { ts: '2026-10-19T12:01:27.000Z', kind: 'agent_event', event: { type: 'text', text: 'hi' } },
  { ts: '2026-10-19T12:01:28.000Z', kind: 'turn_end', elapsedMs: 10, sessionId: 'sid-1', stopped: false }
]

function toJsonl(items: Array<Record<string, unknown>>, eol = '\n'): string {
  return items.map((r) => JSON.stringify(r)).join(eol) + eol
}

describe('parseChatLog', () => {
  it('parses items in order', () => {
    const parsed = parseChatLog(toJsonl(records))
    expect(parsed.items.map((i) => i.kind)).toEqual(['user', 'agent', 'agent'])
    expect(parsed.items[0]).toMatchObject({ kind: 'user', text: 'опиши' })
  })

  it('takes session id from system_init and turn_end', () => {
    const parsed = parseChatLog(toJsonl(records))
    expect(parsed.sessionId).toBe('sid-1')
  })

  it('skips a truncated last line', () => {
    const text = toJsonl(records) + '{"ts":"x","kind":"agent_ev'
    const parsed = parseChatLog(text)
    const clean = parseChatLog(toJsonl(records))
    expect(parsed.items).toEqual(clean.items)
    expect(parsed.sessionId).toBe('sid-1')
  })

  it('marks interrupted turn', () => {
    const withoutEnd = records.filter((r) => r.kind !== 'turn_end')
    expect(parseChatLog(toJsonl(withoutEnd)).lastTurnInterrupted).toBe(true)
    expect(parseChatLog(toJsonl(records)).lastTurnInterrupted).toBe(false)
  })

  it('marks stopped turn', () => {
    const stopped = records.map((r) => (r.kind === 'turn_end' ? { ...r, stopped: true } : r))
    expect(parseChatLog(toJsonl(stopped)).lastTurnStopped).toBe(true)
  })

  it('handles CRLF', () => {
    const lf = parseChatLog(toJsonl(records))
    const crlf = parseChatLog(toJsonl(records, '\r\n'))
    expect(crlf).toEqual(lf)
  })
})

describe('chatTitle', () => {
  it('takes the first non-empty line with collapsed spaces', () => {
    expect(chatTitle('  опиши\nвсё')).toBe('опиши')
  })

  it('truncates long titles to 80 characters with an ellipsis', () => {
    const title = chatTitle('x'.repeat(100))
    expect(title).toBe('x'.repeat(80) + '…')
  })

  it('returns a placeholder for empty text', () => {
    expect(chatTitle('')).toBe('Без названия')
  })
})
