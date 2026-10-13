import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { basename, join } from 'path'

let logDir: string | undefined
let current: { jsonlPath: string; mdPath: string; projectPath: string } | undefined

function pad(num: number): string {
  return String(num).padStart(2, '0')
}

function getLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  return `${year}-${month}-${day}`
}

function getLocalTimeString(date: Date): string {
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${hours}-${minutes}-${seconds}`
}

function getLocalTimeWithColons(date: Date): string {
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${hours}:${minutes}:${seconds}`
}

function getLocalDateTimeString(date: Date): string {
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function short(s: string, n: number): string {
  const normalized = s.replace(/\n/g, ' ')
  return normalized.length > n ? normalized.slice(0, n) + '…' : normalized
}

function findFilename(dir: string, base: string, ext: string): string {
  let attempt = base
  let path = join(dir, attempt + ext)
  let counter = 2
  while (existsSync(path)) {
    attempt = `${base}-${counter}`
    path = join(dir, attempt + ext)
    counter++
  }
  return attempt
}

export function truncateDeep(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length > 20000) {
      return value.slice(0, 20000) + `… [обрезано, всего ${value.length} символов]`
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateDeep(item))
  }
  if (value !== null && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    const result: Record<string, unknown> = {}
    for (const key in value as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = truncateDeep((value as Record<string, unknown>)[key])
      }
    }
    return result
  }
  return value
}

export function extractKnowledgeNotes(text: string): string | null {
  const lines = text.split('\n')
  let startIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('наблюдения для базы знаний')) {
      startIndex = i
      break
    }
  }
  if (startIndex === -1) {
    return null
  }
  const result = lines.slice(startIndex).join('\n').trim()
  if (result === lines[startIndex].trim()) {
    return null
  }
  return result
}

function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((item: any) => {
        if (typeof item === 'object' && item.text) {
          return item.text
        }
        return ''
      })
      .join('')
  }
  return JSON.stringify(content)
}

function shellExitCode(text: string): number | undefined {
  const match = /^\s*Exit code (\d+)/.exec(text)
  return match ? Number(match[1]) : undefined
}

function renderMarkdown(kind: string, data: Record<string, any>): string {
  const t = getLocalTimeWithColons(new Date())
  switch (kind) {
    case 'chat_start':
      return ''
    case 'user_message':
      return `\n## Вы · ${t}\n\n${data.text}\n`
    case 'agent_event': {
      const event = data.event as any
      if (!event) return ''
      if (event.type === 'text') {
        return `\n## Агент · ${t}\n\n${event.text}\n`
      }
      if (event.type === 'tool_use') {
        return `- 🔧 ${event.name}: ${short(JSON.stringify(event.input), 300)}\n`
      }
      if (event.type === 'result') {
        const parts = [`_Ход завершён · ${event.success ? 'успешно' : 'с ошибкой'} · ${(event.durationMs / 1000).toFixed(1)} с`]
        if (event.totalCostUsd != null) {
          parts.push(`$${event.totalCostUsd.toFixed(3)}`)
        }
        if (event.numTurns != null) {
          parts.push(`шагов: ${event.numTurns}`)
        }
        return parts.join(' · ') + '_\n'
      }
      if (event.type === 'other') {
        if (event.raw?.type === 'user' && Array.isArray(event.raw?.message?.content)) {
          const content = event.raw.message.content as Array<any>
          let md = ''
          for (const block of content) {
            if (block.type === 'tool_result' && block.is_error === true) {
              const text = textOf(block.content)
              const code = shellExitCode(text)
              if (code !== undefined && !text.includes('hook error')) {
                md += `- ↩︎ Команда завершилась с кодом ${code}: ${short(text, 300)}\n`
              } else {
                md += `- ⚠️ Ошибка инструмента: ${short(text, 300)}\n`
              }
            }
          }
          return md
        }
        return ''
      }
      return ''
    }
    case 'permission_request':
      return `- ❓ Запрос разрешения: ${data.toolName} ${short(JSON.stringify(data.input), 300)}\n`
    case 'permission_response':
      return `- ${data.approved ? '✅ Разрешено' : '⛔ Отклонено'} (запрос ${data.id})\n`
    case 'db_query': {
      const outcome = data.denied
        ? 'отклонён пользователем'
        : data.error
          ? `⚠️ ${short(String(data.error), 200)}`
          : `${data.rowCount} строк${data.truncated ? ' (обрезано)' : ''} · ${data.durationMs} мс`
      return `- 🗄 Запрос к БД: ${short(String(data.sql ?? ''), 300)} → ${outcome}\n`
    }
    case 'crm_action': {
      const title = data.action === 'compile' ? 'Компиляция и перезапуск CRM' : 'Обновление CRM из файловой системы'
      const outcome = data.denied
        ? 'отклонено пользователем'
        : data.success
          ? `успешно · ${Math.round(Number(data.durationMs) / 1000)} с`
          : `⚠️ ${short(String(data.error ?? data.summary ?? ''), 300)}`
      return `- ⚙️ ${title} → ${outcome}\n`
    }
    case 'error':
      return `\n**Ошибка:** ${data.message}\n`
    case 'turn_end':
      return ''
    default:
      return ''
  }
}

export function initChatLog(dir: string): void {
  logDir = dir
  current = undefined
}

export function getChatLogDir(): string | undefined {
  return logDir
}

export function startChatLogIfNeeded(meta: { projectPath: string; readRoot?: string }): void {
  if (!logDir || current) {
    return
  }
  try {
    const now = new Date()
    const day = getLocalDateString(now)
    const time = getLocalTimeString(now)
    const dir = join(logDir, 'chats', day)
    mkdirSync(dir, { recursive: true })
    const base = findFilename(dir, time, '')
    const jsonlPath = join(dir, base + '.jsonl')
    const mdPath = join(dir, base + '.md')
    current = { jsonlPath, mdPath, projectPath: meta.projectPath }
    const headerLine = getLocalTimeWithColons(now)
    const header = `# Чат ${day} ${headerLine}\n\nПроект: ${meta.projectPath}\n`
    appendFileSync(mdPath, header)
    logChatRecord('chat_start', { projectPath: meta.projectPath, readRoot: meta.readRoot })
  } catch (err) {
    console.error('Error starting chat log:', err)
  }
}

export function endChatLog(): void {
  current = undefined
}

export function getCurrentChatLogPath(): string | undefined {
  return current?.jsonlPath
}

export function logChatRecord(kind: string, data: Record<string, unknown>): void {
  if (!current) {
    return
  }
  try {
    const record = { ts: new Date().toISOString(), kind, ...(truncateDeep(data) as Record<string, unknown>) }
    appendFileSync(current.jsonlPath, JSON.stringify(record) + '\n')
    const md = renderMarkdown(kind, data as any)
    if (md) {
      appendFileSync(current.mdPath, md)
    }
    if (kind === 'agent_event') {
      const event = (data as any).event as any
      if (event?.type === 'text' && typeof event?.text === 'string') {
        const block = extractKnowledgeNotes(event.text)
        if (block) {
          const timestamp = getLocalDateTimeString(new Date())
          const knowledgeFile = join(logDir || '', 'knowledge-notes.md')
          const entry = `\n## ${timestamp} · ${current.projectPath} · ${basename(current.jsonlPath)}\n\n${block}\n`
          appendFileSync(knowledgeFile, entry)
        }
      }
    }
  } catch (err) {
    console.error('Error logging chat record:', err)
  }
}
