import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatClockTime } from '../chatFormat'
import type { LogEvent, LogLevel } from '../chatFormat'
import { IconExternal, IconSearch, IconTerminal, IconTrash, IconX } from './icons'

type LevelFilter = 'all' | LogLevel

const LEVEL_FILTERS: LevelFilter[] = ['all', 'info', 'warn', 'error']

interface LogsDrawerProps {
  events: LogEvent[]
  onClose: () => void
  onClear: () => void
  onOpenFolder: () => void
}

export function LogsDrawer({ events, onClose, onClear, onOpenFolder }: LogsDrawerProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LevelFilter>('all')
  const consoleRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const needle = query.trim().toLowerCase()
  const visible = events.filter(
    (event) =>
      (level === 'all' || event.level === level) &&
      (!needle ||
        event.message.toLowerCase().includes(needle) ||
        event.source.toLowerCase().includes(needle) ||
        (event.details ?? '').toLowerCase().includes(needle))
  )
  const warnCount = events.filter((event) => event.level === 'warn').length
  const errorCount = events.filter((event) => event.level === 'error').length

  useLayoutEffect(() => {
    const element = consoleRef.current
    if (element && stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [visible.length])

  const handleScroll = (): void => {
    const element = consoleRef.current
    if (element) {
      stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Логи сессии">
        <div className="drawer-head">
          <span className="drawer-title">
            <IconTerminal size={15} />
            Логи сессии
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenFolder} title="Открыть папку с файлами логов">
            <IconExternal size={13} />
            Папка
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} title="Очистить вид (файлы логов не удаляются)">
            <IconTrash size={13} />
            Очистить
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Закрыть">
            <IconX size={15} />
          </button>
        </div>
        <div className="drawer-tools">
          <div className="search-wrap">
            <IconSearch size={14} />
            <input
              className="search"
              placeholder="Поиск по логам"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </div>
          <div className="level-filter">
            {LEVEL_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={level === filter ? 'active' : ''}
                onClick={() => setLevel(filter)}
              >
                {filter.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="console" ref={consoleRef} onScroll={handleScroll}>
          {visible.length === 0 ? (
            <div className="console-empty">{events.length === 0 ? 'Событий пока нет' : 'Ничего не найдено'}</div>
          ) : (
            visible.map((event) => (
              <div key={event.id} className={`log-row is-${event.level}`}>
                <span className="log-time">{formatClockTime(event.ts)}</span>
                <span className={`log-level lvl-${event.level}`}>{event.level.toUpperCase()}</span>
                <div className="log-msg">
                  <span className="log-source">[{event.source}]</span>
                  {event.message}
                  {event.details && (
                    <details className="log-details">
                      <summary>детали</summary>
                      <pre>{event.details}</pre>
                    </details>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="drawer-foot">
          <span>
            {events.length} событий · {warnCount} WARN · {errorCount} ERROR
          </span>
          <span>Полные логи — в файлах</span>
        </div>
      </aside>
    </>
  )
}
