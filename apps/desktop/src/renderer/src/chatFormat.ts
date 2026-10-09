import type { AgentEvent } from '@bpmsoft-agent/agent-runtime'

export type ChatRole = 'user' | 'agent-text' | 'agent-tool' | 'agent-result' | 'agent-other'

/** Exit code from a Bash tool result like "Exit code 1\n…", or undefined. */
export function shellExitCode(text: string): number | undefined {
  const match = /^Exit code (\d+)/.exec(text.trimStart())
  return match ? Number(match[1]) : undefined
}

export type EntryLevel = 'info' | 'warn' | 'error'

export interface ChatEntry {
  id: string
  role: ChatRole
  content: string
  /** Raw details (tool input, SDK message) shown collapsed under the entry. */
  details?: string
  /** Creation time, ms since epoch. */
  ts?: number
  /** Severity: warn for tool errors, error for failed turns. */
  level?: EntryLevel
}

/** Last segment of a path, e.g. the project folder name. */
export function projectName(rawPath: string): string {
  const parts = rawPath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? rawPath
}

/** Local time as HH:MM:SS. */
export function formatClockTime(ts: number): string {
  const date = new Date(ts)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string' ? (item as { text: string }).text : ''))
      .join('\n')
  }
  return JSON.stringify(content)
}

/** Tool results carried by an SDK user message: text and whether the tool failed. */
export function toolResults(raw: unknown): Array<{ text: string; isError: boolean }> {
  const message = field(raw, 'message')
  const content = field(message, 'content')
  if (field(raw, 'type') !== 'user' || !Array.isArray(content)) {
    return []
  }
  return content
    .filter((block) => field(block, 'type') === 'tool_result')
    .map((block) => ({ text: contentText(field(block, 'content')), isError: field(block, 'is_error') === true }))
}

/**
 * Shortens an absolute path for display: the part after `/Pkg/`, knowledge
 * files as `знания: <file>`, otherwise the last two segments.
 */
export function shortPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string' || rawPath === '') {
    return ''
  }
  const normalized = rawPath.replace(/\\/g, '/')
  const pkgIndex = normalized.indexOf('/Pkg/')
  if (pkgIndex !== -1) {
    return normalized.slice(pkgIndex + '/Pkg/'.length)
  }
  const knowledgeIndex = normalized.indexOf('/knowledge/')
  if (knowledgeIndex !== -1) {
    return `знания: ${normalized.slice(knowledgeIndex + '/knowledge/'.length)}`
  }
  const appMarkers = ['/BPMSoft.Configuration/', '/Logs/', '/ResourcesCore/', '/Resources/', '/conf/']
  for (const marker of appMarkers) {
    const index = normalized.indexOf(marker)
    if (index !== -1) {
      return normalized.slice(index + 1)
    }
    const markerWithoutSlash = marker.slice(0, -1)
    const indexNoSlash = normalized.indexOf(markerWithoutSlash)
    if (indexNoSlash !== -1) {
      return normalized.slice(indexNoSlash + 1)
    }
  }
  const parts = normalized.split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

function field(input: unknown, key: string): unknown {
  return input && typeof input === 'object' ? (input as Record<string, unknown>)[key] : undefined
}

/** Short human-readable description of a tool call, in Russian. */
export function describeToolCall(name: string, input: unknown): string {
  const description = field(input, 'description')
  switch (name) {
    case 'Read':
      return `Читает файл ${shortPath(field(input, 'file_path'))}`
    case 'Write':
      return `Создаёт файл ${shortPath(field(input, 'file_path'))}`
    case 'Edit':
    case 'MultiEdit':
      return `Изменяет файл ${shortPath(field(input, 'file_path'))}`
    case 'Delete':
      return `Удаляет файл ${shortPath(field(input, 'file_path'))}`
    case 'Glob':
      return `Ищет файлы по шаблону ${String(field(input, 'pattern') ?? '')}`
    case 'Grep': {
      const where = shortPath(field(input, 'path'))
      return `Ищет «${String(field(input, 'pattern') ?? '')}»${where ? ` в ${where}` : ''}`
    }
    case 'LS':
      return `Смотрит папку ${shortPath(field(input, 'path'))}`
    case 'Bash':
      return typeof description === 'string' && description
        ? `Выполняет команду: ${description}`
        : 'Выполняет команду'
    case 'TodoWrite':
      return 'Обновляет план работы'
    case 'Task':
    case 'Agent':
      return typeof description === 'string' && description
        ? `Запускает помощника: ${description}`
        : 'Запускает помощника'
    case 'WebSearch':
      return `Ищет в интернете: ${String(field(input, 'query') ?? '')}`
    case 'WebFetch':
      return `Открывает страницу ${String(field(input, 'url') ?? '')}`
    default:
      return `Использует инструмент ${name}`
  }
}

/** Command or file the user should see before approving a tool call. */
export function permissionSubject(name: string, input: unknown): string | undefined {
  if (name === 'Bash') {
    const command = field(input, 'command')
    return typeof command === 'string' ? command : undefined
  }
  const filePath = field(input, 'file_path') ?? field(input, 'notebook_path')
  return typeof filePath === 'string' ? filePath : undefined
}

let nextGeneratedId = 0

export function newEntryId(): string {
  nextGeneratedId += 1
  return `e${nextGeneratedId}`
}

/** Maps an agent event to a chat entry. Service events become `agent-other` (hidden unless debug is on). */
export function mapAgentEventToEntry(event: AgentEvent): ChatEntry {
  const id = newEntryId()
  const ts = Date.now()
  if (event.type === 'text') {
    return { id, ts, role: 'agent-text', content: event.text }
  }
  if (event.type === 'tool_use') {
    return {
      id,
      ts,
      role: 'agent-tool',
      content: describeToolCall(event.name, event.input),
      details: JSON.stringify(event.input, null, 2)
    }
  }
  if (event.type === 'result') {
    const seconds = Math.max(1, Math.round(event.durationMs / 1000))
    return {
      id,
      ts,
      role: 'agent-result',
      level: event.success ? 'info' : 'error',
      content: event.success ? `Готово за ${seconds} с` : `Агент остановился с ошибкой (${seconds} с)`
    }
  }
  if (event.type === 'system_init') {
    return { id, ts, role: 'agent-other', content: `Сессия запущена, модель: ${event.model}` }
  }
  const failed = toolResults(event.type === 'other' ? event.raw : undefined).find((result) => result.isError)
  if (failed) {
    const code = shellExitCode(failed.text)
    if (code !== undefined && !failed.text.includes('hook error')) {
      return { id, ts, role: 'agent-tool', content: `Команда завершилась с кодом ${code}`, details: failed.text }
    }
    return { id, ts, role: 'agent-tool', level: 'warn', content: `Ошибка: ${oneLine(failed.text, 160)}`, details: failed.text }
  }
  return { id, ts, role: 'agent-other', content: 'Служебное событие', details: JSON.stringify(event.raw, null, 2) }
}

export type LogLevel = EntryLevel

export interface LogEvent {
  id: string
  ts: number
  level: LogLevel
  source: string
  message: string
  details?: string
}

export function newLogEvent(level: LogLevel, source: string, message: string, details?: string): LogEvent {
  return { id: newEntryId(), ts: Date.now(), level, source, message, details }
}

const LOG_DETAILS_LIMIT = 4000

function clip(text: string): string {
  return text.length > LOG_DETAILS_LIMIT ? `${text.slice(0, LOG_DETAILS_LIMIT)}\n… [обрезано, всего ${text.length} символов]` : text
}

/** Maps an agent event to a developer-console record for the logs panel. */
export function agentEventToLog(event: AgentEvent): LogEvent {
  if (event.type === 'text') {
    return newLogEvent('info', 'agent', oneLine(event.text, 200), event.text.length > 200 ? event.text : undefined)
  }
  if (event.type === 'tool_use') {
    return newLogEvent('info', 'tool', describeToolCall(event.name, event.input), clip(JSON.stringify(event.input, null, 2)))
  }
  if (event.type === 'result') {
    const parts = [`Ход завершён ${event.success ? 'успешно' : 'с ошибкой'} за ${(event.durationMs / 1000).toFixed(1)} с`]
    if (event.totalCostUsd != null) {
      parts.push(`$${event.totalCostUsd.toFixed(3)}`)
    }
    if (event.numTurns != null) {
      parts.push(`шагов: ${event.numTurns}`)
    }
    return newLogEvent(event.success ? 'info' : 'error', 'turn', parts.join(' · '))
  }
  if (event.type === 'system_init') {
    return newLogEvent('info', 'system', `Сессия запущена · модель ${event.model}`)
  }
  const results = toolResults(event.raw)
  if (results.length > 0) {
    const failed = results.find((result) => result.isError)
    if (failed) {
      const code = shellExitCode(failed.text)
      if (code !== undefined && !failed.text.includes('hook error')) {
        return newLogEvent('info', 'tool', `Команда завершилась с кодом ${code}`, clip(failed.text))
      }
      return newLogEvent('warn', 'tool', `Ошибка инструмента: ${oneLine(failed.text, 200)}`, clip(failed.text))
    }
    return newLogEvent('info', 'tool', 'Результат инструмента', clip(results.map((result) => result.text).join('\n')))
  }
  const rawType = field(event.raw, 'type')
  return newLogEvent('info', 'system', `Служебное событие${typeof rawType === 'string' ? `: ${rawType}` : ''}`, clip(JSON.stringify(event.raw, null, 2) ?? ''))
}

export type ChatBlock =
  | { kind: 'user'; entry: ChatEntry }
  | { kind: 'text'; entry: ChatEntry; showAvatar: boolean }
  | { kind: 'activity'; id: string; items: ChatEntry[] }
  | { kind: 'result'; entry: ChatEntry }

/** Groups visible entries for the feed: consecutive tool/service entries form one collapsible activity block. */
export function buildBlocks(entries: ChatEntry[]): ChatBlock[] {
  const blocks: ChatBlock[] = []
  let avatarShown = false
  for (const entry of entries) {
    if (entry.role === 'user') {
      blocks.push({ kind: 'user', entry })
      avatarShown = false
    } else if (entry.role === 'agent-text') {
      blocks.push({ kind: 'text', entry, showAvatar: !avatarShown })
      avatarShown = true
    } else if (entry.role === 'agent-result') {
      blocks.push({ kind: 'result', entry })
    } else {
      const last = blocks[blocks.length - 1]
      if (last && last.kind === 'activity') {
        last.items.push(entry)
      } else {
        blocks.push({ kind: 'activity', id: entry.id, items: [entry] })
      }
    }
  }
  return blocks
}

/** Whether an entry is shown in the feed. */
export function isEntryVisible(entry: ChatEntry, showDebug: boolean): boolean {
  return showDebug || entry.role !== 'agent-other'
}
