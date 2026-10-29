import type { AgentEvent } from '@bpmsoft-agent/agent-runtime'
import { formatUsage } from '../../shared/usage'
import type { ChatReplayItem } from '../../shared/types'

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
  const appMarkers = ['/BPMSoft.Configuration/', '/Logs/', '/Resources/', '/conf/']
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
  const bare = name.startsWith('mcp__app__') ? name.slice('mcp__app__'.length) : name
  if (name === 'crm_db_query' || name.endsWith('__crm_db_query')) {
    return 'Запрос к БД CRM'
  }
  if (name === 'crm_update_from_fs' || name.endsWith('__crm_update_from_fs')) {
    return 'Обновляет CRM из файловой системы'
  }
  if (name === 'crm_compile' || name.endsWith('__crm_compile')) {
    return 'Компилирует и перезапускает CRM'
  }
  if (name === 'crm_action') {
    return 'Действие в CRM'
  }
  if (name === 'git_action') {
    return 'Действие с git'
  }
  if (bare === 'git_branch_status' || name.endsWith('__git_branch_status')) {
    return 'Смотрит ветки git'
  }
  if (bare === 'git_switch_branch' || name.endsWith('__git_switch_branch')) {
    return `Переключает ветку git на ${String(field(input, 'branch') ?? '')}`.trim()
  }
  if (bare === 'git_create_mr' || name.endsWith('__git_create_mr')) {
    return 'Создаёт ветку и MR'
  }
  if (name === 'tracker_action') {
    return 'Действие в Jira'
  }
  if (bare === 'jira_get_issue' || name.endsWith('__jira_get_issue')) {
    return `Читает задачу Jira ${String(field(input, 'key') ?? '')}`.trim()
  }
  if (bare === 'jira_add_comment' || name.endsWith('__jira_add_comment')) {
    return `Пишет комментарий в Jira ${String(field(input, 'key') ?? '')}`.trim()
  }
  if (bare === 'confluence_get_page' || name.endsWith('__confluence_get_page')) {
    return 'Читает страницу Confluence'
  }
  if (bare === 'pkg_lint') {
    return 'Проверяет изменённые схемы (pkg_lint)'
  }
  switch (bare) {
    case 'crm_browser_open': {
      const path = field(input, 'path')
      return `Открывает страницу CRM${typeof path === 'string' && path ? ' ' + path : ''}`
    }
    case 'crm_browser_screenshot':
      return 'Делает снимок страницы CRM'
    case 'crm_browser_text':
      return 'Читает текст страницы CRM'
    case 'crm_browser_console':
      return 'Смотрит консоль браузера CRM'
    case 'crm_browser_network':
      return 'Смотрит сетевые запросы CRM'
    case 'crm_browser_click':
      return `Нажимает в CRM ${String(field(input, 'selector') ?? field(input, 'text') ?? '')}`.trim()
    case 'crm_request': {
      const method = field(input, 'method')
      const path = field(input, 'path')
      return `REST-запрос к CRM ${typeof method === 'string' ? method.toUpperCase() : ''} ${typeof path === 'string' ? path : ''}`.replace(/\s+/g, ' ').trim()
    }
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
  if (name === 'crm_db_query' || name.endsWith('__crm_db_query')) {
    const sql = field(input, 'sql')
    return typeof sql === 'string' ? sql : undefined
  }
  if (name === 'crm_action' || name === 'crm_browser_click' || name === 'git_action' || name === 'tracker_action') {
    const action = field(input, 'action')
    return typeof action === 'string' ? action : undefined
  }
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

/**
 * Cost of one turn. Claude reports total_cost_usd cumulatively over the session; this gives the cost of one turn.
 * A total below the previous one means the session restarted, so the total itself is the turn cost.
 */
export function turnCostUsd(total: number | undefined, previousTotal: number | undefined): number | undefined {
  if (total === undefined) {
    return undefined
  }
  if (previousTotal === undefined || total < previousTotal) {
    return total
  }
  return total - previousTotal
}

/** "$0.30 · токены: вход 10 · выход 6 тыс. · шагов: 5" — only the parts that are known for the turn. */
export function formatTurnStats(
  event: { totalCostUsd?: number; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }; numTurns?: number },
  costUsd: number | undefined
): string {
  const parts: string[] = []
  if (costUsd != null) {
    parts.push(`$${costUsd.toFixed(2)}`)
  }
  if (event.usage) {
    parts.push(formatUsage(event.usage))
  }
  if (event.numTurns != null) {
    parts.push(`шагов: ${event.numTurns}`)
  }
  return parts.join(' · ')
}

/** Maps an agent event to a chat entry. Service events become `agent-other` (hidden unless debug is on). */
/** Service Cursor SDK messages (raw.type "cursor_sdk"): shown only in the log panel, not in the chat. */
export function isDiagnosticEvent(event: AgentEvent): boolean {
  return event.type === 'other' && field(event.raw, 'type') === 'cursor_sdk'
}

export function mapAgentEventToEntry(event: AgentEvent, previousCostUsd?: number): ChatEntry {
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
    const stats = formatTurnStats(event, turnCostUsd(event.totalCostUsd, previousCostUsd))
    const suffix = stats ? ` · ${stats}` : ''
    if (event.stopped) {
      return {
        id,
        ts,
        role: 'agent-result',
        level: 'warn',
        content: `Остановлено пользователем (${seconds} с)${suffix}. Если шло обновление или компиляция CRM, на стенде они могут ещё выполняться.`
      }
    }
    return {
      id,
      ts,
      role: 'agent-result',
      level: event.success ? 'info' : 'error',
      content: event.success ? `Готово за ${seconds} с${suffix}` : `Агент остановился с ошибкой (${seconds} с)${suffix}`
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

/** Chat replay items (from the chat log) → feed entries, in order, keeping the original timestamps. */
export function replayToEntries(items: ChatReplayItem[]): ChatEntry[] {
  let lastCost: number | undefined
  return items.map((item) => {
    const parsed = Date.parse(item.ts)
    const ts = Number.isNaN(parsed) ? Date.now() : parsed
    if (item.kind === 'user') {
      return { id: newEntryId(), ts, role: 'user', content: item.text }
    }
    const entry = { ...mapAgentEventToEntry(item.event, lastCost), ts }
    if (item.event.type === 'result' && item.event.totalCostUsd != null) {
      lastCost = item.event.totalCostUsd
    }
    return entry
  })
}

/** Cumulative total_cost_usd of the last agent result in the chat log that has one, or undefined. */
export function lastTotalCostUsd(items: ChatReplayItem[]): number | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind === 'agent' && item.event.type === 'result' && item.event.totalCostUsd != null) {
      return item.event.totalCostUsd
    }
  }
  return undefined
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
    const seconds = (event.durationMs / 1000).toFixed(1)
    const parts = [
      event.stopped
        ? `Ход остановлен пользователем за ${seconds} с`
        : `Ход завершён ${event.success ? 'успешно' : 'с ошибкой'} за ${seconds} с`
    ]
    if (event.totalCostUsd != null) {
      parts.push(`сессия $${event.totalCostUsd.toFixed(3)}`)
    }
    if (event.usage) {
      parts.push(formatUsage(event.usage))
    }
    if (event.numTurns != null) {
      parts.push(`шагов: ${event.numTurns}`)
    }
    if (event.stopped) {
      return newLogEvent('warn', 'turn', parts.join(' · '))
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

export interface ChoiceQuestion {
  text: string
  multi: boolean
  options: { text: string; preselected: boolean }[]
}

/** Default confirm question shown when a plan arrives without a <choices> block. */
export const PLAN_CONFIRM_QUESTIONS: ChoiceQuestion[] = [
  { text: 'Подтверждаете план?', multi: false, options: [{ text: 'Делай', preselected: false }, { text: 'Нужны правки', preselected: false }] }
]

/** A plan message: acceptance criteria in «Дано … То» form (AC-n and DoD-n), no <choices> block, not a final report with knowledge notes. */
export function isPlanWithoutChoices(text: string): boolean {
  if (/<choices>/.test(text) || /наблюдения для базы знаний/i.test(text)) {
    return false
  }
  const lines = text.split('\n')
  const hasAc = lines.some((line) => /\bAC-\d+/.test(line) && /Дано/.test(line))
  const hasDod = lines.some((line) => /\bDoD-\d+/.test(line))
  return hasAc && hasDod
}

export interface ParsedChoices {
  before: string
  questions: ChoiceQuestion[]
  after: string
}

/**
 * Finds the LAST <choices>…</choices> block; returns null if none or if it has no questions.
 * before/after = text outside the block, trimmed.
 */
export function parseChoices(text: string): ParsedChoices | null {
  const regex = /<choices>\s*([\s\S]*?)\s*<\/choices>/g
  let lastMatch: RegExpExecArray | null = null

  while (true) {
    const match = regex.exec(text)
    if (!match) break
    lastMatch = match
  }

  if (!lastMatch) return null

  const blockStart = lastMatch.index
  const blockEnd = lastMatch.index + lastMatch[0].length
  const blockContent = lastMatch[1]

  const before = text.slice(0, blockStart).trim()
  const after = text.slice(blockEnd).trim()

  const lines = blockContent.split('\n')
  const questions: ChoiceQuestion[] = []
  let currentQuestion: ChoiceQuestion | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    if (trimmed.startsWith('? ')) {
      if (currentQuestion) {
        questions.push(currentQuestion)
      }
      currentQuestion = {
        text: trimmed.slice(2),
        multi: false,
        options: []
      }
    } else if (trimmed.startsWith('?* ')) {
      if (currentQuestion) {
        questions.push(currentQuestion)
      }
      currentQuestion = {
        text: trimmed.slice(3),
        multi: true,
        options: []
      }
    } else if (trimmed.startsWith('- ')) {
      if (currentQuestion) {
        currentQuestion.options.push({
          text: trimmed.slice(2),
          preselected: false
        })
      }
    } else if (trimmed.startsWith('* ')) {
      if (currentQuestion) {
        currentQuestion.options.push({
          text: trimmed.slice(2),
          preselected: true
        })
      }
    } else {
      if (currentQuestion) {
        currentQuestion.text += ' ' + trimmed
      }
    }
  }

  if (currentQuestion) {
    questions.push(currentQuestion)
  }

  if (questions.length === 0) {
    return null
  }

  return { before, questions, after }
}

export interface ChoiceAnswer {
  selected: string[]
  custom: string
}

/**
 * One question → just the answer text; several → numbered lines "N. <вопрос> — <ответ>".
 * Answer = selected options joined with "; ", plus "свой ответ: <custom>" (joined with "; ") when custom is non-empty.
 * Unanswered questions are written as "— без ответа".
 * Single question with exactly one selected option and empty custom → return exactly the option text.
 * Single question with only custom → the custom text.
 */
export function formatChoiceAnswers(questions: ChoiceQuestion[], answers: ChoiceAnswer[]): string {
  if (questions.length === 1 && answers.length > 0) {
    const answer = answers[0]
    const selected = answer.selected
    const custom = answer.custom

    if (selected.length === 1 && !custom) {
      return selected[0]
    }

    if (selected.length === 0 && custom) {
      return custom
    }
  }

  const lines: string[] = []
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]
    const answer = answers[i]
    const number = i + 1

    let answerText = ''
    if (answer) {
      const parts: string[] = []
      if (answer.selected.length > 0) {
        parts.push(answer.selected.join('; '))
      }
      if (answer.custom) {
        parts.push('свой ответ: ' + answer.custom)
      }
      answerText = parts.length > 0 ? parts.join('; ') : '— без ответа'
    } else {
      answerText = '— без ответа'
    }

    lines.push(`${number}. ${question.text} — ${answerText}`)
  }

  return lines.join('\n')
}
