import type { AgentEvent } from '@bpmsoft-agent/agent-runtime'
import type { AgentProvider, ChatModelRef, CursorModelParam, ParsedChatLog } from '../shared/types'

const UNTITLED = 'Без названия'
const TITLE_MAX = 80

export function chatTitle(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!firstLine) {
    return UNTITLED
  }
  const collapsed = firstLine.replace(/\s+/g, ' ')
  return collapsed.length > TITLE_MAX ? collapsed.slice(0, TITLE_MAX) + '…' : collapsed
}

function readModel(value: unknown): ChatModelRef | null {
  if (value === null || typeof value !== 'object') {
    return null
  }
  const m = value as Record<string, unknown>
  const ref: ChatModelRef = {
    id: typeof m.id === 'string' ? m.id : null,
    effort: typeof m.effort === 'string' ? m.effort : null
  }
  if (Array.isArray(m.params)) {
    ref.params = m.params as CursorModelParam[]
  }
  return ref
}

function readProvider(value: unknown): AgentProvider | null {
  return value === 'claude' || value === 'cursor' ? value : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Parses a chat .jsonl log. Bad lines (e.g. a truncated last line) are skipped; unknown kinds are ignored. */
export function parseChatLog(text: string): ParsedChatLog {
  const result: ParsedChatLog = {
    projectPath: null,
    readRoot: null,
    startedAt: null,
    title: UNTITLED,
    provider: null,
    model: null,
    sessionId: null,
    lastTurnInterrupted: false,
    lastTurnStopped: false,
    updatedAt: null,
    items: []
  }
  let titleSet = false
  let turnOpen = false

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') {
      continue
    }
    let record: Record<string, unknown>
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }
    if (record === null || typeof record !== 'object') {
      continue
    }
    const ts = typeof record.ts === 'string' ? record.ts : ''

    switch (record.kind) {
      case 'chat_start':
        result.projectPath = readString(record.projectPath)
        result.readRoot = readString(record.readRoot)
        result.startedAt = ts
        break
      case 'user_message': {
        const userText = typeof record.text === 'string' ? record.text : ''
        result.items.push({ kind: 'user', ts, text: userText })
        if (!titleSet) {
          result.title = chatTitle(userText)
          titleSet = true
        }
        const provider = readProvider(record.provider)
        if (provider) {
          result.provider = provider
        }
        const model = readModel(record.model)
        if (model) {
          result.model = model
        }
        result.updatedAt = ts
        turnOpen = true
        break
      }
      case 'agent_event': {
        if (record.event === null || typeof record.event !== 'object') {
          break
        }
        const event = record.event as AgentEvent
        result.items.push({ kind: 'agent', ts, event })
        const sid = (event as { sessionId?: unknown }).sessionId
        if ((event.type === 'system_init' || event.type === 'result') && typeof sid === 'string') {
          result.sessionId = sid
        }
        break
      }
      case 'turn_end': {
        const sid = readString(record.sessionId)
        if (sid) {
          result.sessionId = sid
        }
        result.lastTurnStopped = record.stopped === true
        result.updatedAt = ts
        turnOpen = false
        break
      }
    }
  }

  result.lastTurnInterrupted = turnOpen
  return result
}
