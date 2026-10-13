/**
 * Console and network journal of the built-in CRM browser. Pure: fed with
 * DevTools-protocol events, no Electron imports, so it is unit-testable.
 */

export interface ConsoleEntry { level: 'error' | 'warning' | 'info'; text: string; source?: string }

export interface NetworkEntry {
  method: string
  url: string
  type?: string
  status?: number
  /** CDP monotonic timestamp of the request start, ms. */
  start: number
  /** CDP monotonic timestamp of the request end, ms. */
  end?: number
  error?: string
  body?: string
  /** Date.now() when the request was first seen (CDP timestamps are not wall-clock). */
  seenAt: number
}

const MAX_CONSOLE = 500
const MAX_NETWORK = 1000
const MAX_CONSOLE_LINES = 100
const MAX_NETWORK_LINES = 60
const LONG_POLL_MS = 10_000
const CANCELED = 'отменён'
const UNKNOWN_NETWORK_ERROR = 'неизвестная ошибка'

/** Full address of a CRM page: a path under the base, a `#` hash route of the main page, or an absolute address of the same origin. */
export function resolveCrmUrl(base: string, path?: string): string {
  const root = base.replace(/\/+$/, '')
  if (!path) {
    return `${root}/Nui/ViewModule.aspx`
  }
  if (path.startsWith('http')) {
    if (!isSameOrigin(path, root)) {
      throw new Error('Можно открывать только адрес CRM из настроек')
    }
    return path
  }
  if (path.startsWith('#')) {
    return `${root}/Nui/ViewModule.aspx${path}`
  }
  return `${root}${path.startsWith('/') ? path : '/' + path}`
}

export function isSameOrigin(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url)
    return cut(parsed.pathname + parsed.search, 200)
  } catch {
    return cut(url, 200)
  }
}

function frameSource(frame: { url?: string; lineNumber?: number } | undefined): string | undefined {
  return frame?.url ? `${frame.url}:${(frame.lineNumber ?? 0) + 1}` : undefined
}

function argText(arg: { value?: unknown; description?: string }): string {
  if (arg.value !== undefined) {
    return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value)
  }
  return arg.description ?? ''
}

function isFailed(entry: NetworkEntry): boolean {
  return (entry.status ?? 0) >= 400 || (entry.error !== undefined && entry.error !== CANCELED)
}

function isIgnoredUrl(url: string): boolean {
  return url.startsWith('data:') || url.startsWith('blob:')
}

export class CrmBrowserLog {
  private console: ConsoleEntry[] = []
  private network = new Map<string, NetworkEntry>()
  private bodyRequested = new Set<string>()

  clear(): void {
    this.console = []
    this.network.clear()
    this.bodyRequested.clear()
  }

  private pushConsole(entry: ConsoleEntry): void {
    this.console.push(entry)
    if (this.console.length > MAX_CONSOLE) {
      this.console.splice(0, this.console.length - MAX_CONSOLE)
    }
  }

  onCdpEvent(method: string, params: any): void {
    switch (method) {
      case 'Runtime.consoleAPICalled': {
        const type: string = params?.type ?? ''
        const level = type === 'error' || type === 'assert' ? 'error' : type === 'warning' ? 'warning' : 'info'
        const args: Array<{ value?: unknown; description?: string }> = params?.args ?? []
        this.pushConsole({
          level,
          text: args.map(argText).join(' '),
          source: frameSource(params?.stackTrace?.callFrames?.[0])
        })
        return
      }
      case 'Runtime.exceptionThrown': {
        const details = params?.exceptionDetails ?? {}
        this.pushConsole({
          level: 'error',
          text: details.exception?.description ?? details.text ?? '',
          source: frameSource({ url: details.url, lineNumber: details.lineNumber })
        })
        return
      }
      case 'Log.entryAdded': {
        const entry = params?.entry ?? {}
        const level = entry.level === 'error' ? 'error' : entry.level === 'warning' ? 'warning' : 'info'
        this.pushConsole({ level, text: String(entry.text ?? ''), source: entry.url || undefined })
        return
      }
      case 'Network.requestWillBeSent': {
        const id: string = params?.requestId
        const url: string = params?.request?.url ?? ''
        const existing = this.network.get(id)
        if (existing) {
          // redirect: the same request id again with the new address
          existing.url = url
          return
        }
        if (isIgnoredUrl(url)) {
          return
        }
        this.network.set(id, {
          method: params?.request?.method ?? 'GET',
          url,
          type: params?.type,
          start: Number(params?.timestamp ?? 0) * 1000,
          seenAt: Date.now()
        })
        if (this.network.size > MAX_NETWORK) {
          const oldest = this.network.keys().next().value as string | undefined
          if (oldest !== undefined) {
            this.network.delete(oldest)
            this.bodyRequested.delete(oldest)
          }
        }
        return
      }
      case 'Network.responseReceived': {
        const entry = this.network.get(params?.requestId)
        if (entry) {
          entry.status = params?.response?.status
        }
        return
      }
      case 'Network.loadingFinished': {
        const entry = this.network.get(params?.requestId)
        if (entry) {
          entry.end = Number(params?.timestamp ?? 0) * 1000
        }
        return
      }
      case 'Network.loadingFailed': {
        const entry = this.network.get(params?.requestId)
        if (entry) {
          entry.end = Number(params?.timestamp ?? 0) * 1000
          entry.error = params?.canceled ? CANCELED : String(params?.errorText ?? UNKNOWN_NETWORK_ERROR)
        }
        return
      }
      default:
        return
    }
  }

  /** Requests still in flight: WebSockets, event streams and long polls (older than 10 s) are not counted. */
  pendingCount(now: number = Date.now()): number {
    let pending = 0
    for (const entry of this.network.values()) {
      if (entry.end !== undefined) continue
      if (entry.type === 'WebSocket' || entry.type === 'EventSource') continue
      if (now - entry.seenAt > LONG_POLL_MS) continue
      pending++
    }
    return pending
  }

  /** True once per request: an error response whose body has not been requested yet. */
  needsBody(requestId: string): boolean {
    const entry = this.network.get(requestId)
    if (!entry || entry.body !== undefined || (entry.status ?? 0) < 400 || this.bodyRequested.has(requestId)) {
      return false
    }
    this.bodyRequested.add(requestId)
    return true
  }

  setBody(requestId: string, body: string): void {
    const entry = this.network.get(requestId)
    if (entry) {
      entry.body = body
    }
  }

  counts(): { consoleErrors: number; failedRequests: number } {
    let failedRequests = 0
    for (const entry of this.network.values()) {
      if (isFailed(entry)) failedRequests++
    }
    return {
      consoleErrors: this.console.filter((entry) => entry.level === 'error').length,
      failedRequests
    }
  }

  consoleText(onlyErrors: boolean): string {
    const errors = this.console.filter((entry) => entry.level === 'error').length
    const header = `Сообщений консоли: ${this.console.length}, ошибок: ${errors}`
    const selected = onlyErrors ? this.console.filter((entry) => entry.level === 'error') : this.console

    const lines: Array<{ entry: ConsoleEntry; count: number }> = []
    for (const entry of selected) {
      const last = lines[lines.length - 1]
      if (last && last.entry.level === entry.level && last.entry.text === entry.text && last.entry.source === entry.source) {
        last.count++
      } else {
        lines.push({ entry, count: 1 })
      }
    }

    const shown = lines.slice(-MAX_CONSOLE_LINES).map(({ entry, count }) => {
      const source = entry.source ? ` (${entry.source})` : ''
      const repeats = count > 1 ? ` ×${count}` : ''
      return `[${entry.level}] ${cut(entry.text, 500)}${source}${repeats}`
    })
    return shown.length > 0 ? [header, ...shown].join('\n') : `${header}\nПусто`
  }

  networkText(options: { onlyFailed: boolean; filter?: string }): string {
    const all = [...this.network.values()]
    const failedCount = all.filter(isFailed).length
    const header = `Запросов: ${all.length}, с ошибкой: ${failedCount}`
    const selected = all.filter(
      (entry) => (!options.onlyFailed || isFailed(entry)) && (!options.filter || entry.url.includes(options.filter))
    )

    const shown = selected.slice(-MAX_NETWORK_LINES).flatMap((entry) => {
      const duration = entry.end !== undefined && entry.start ? Math.round(entry.end - entry.start) : '?'
      const error = entry.error ? ` — ${entry.error}` : ''
      const line = `${entry.method} ${entry.status ?? 'ERR'} ${pathOf(entry.url)} (${duration} мс)${error}`
      return entry.body ? [line, `  ответ: ${entry.body.replace(/\s+/g, ' ').slice(0, 1500)}`] : [line]
    })
    return shown.length > 0 ? [header, ...shown].join('\n') : `${header}\nПусто`
  }
}
