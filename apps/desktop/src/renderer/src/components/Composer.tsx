import { useEffect, useLayoutEffect, useRef } from 'react'
import { IconArrowUp, IconStop } from './icons'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  isRunning: boolean
  /** Changing this number moves focus into the input. */
  focusKey: number
  /** Stops the running agent turn. */
  onStop: () => void
  /** The stop request is sent and the turn is still finishing. */
  isStopping: boolean
  /** Esc stops the turn only when no overlay (logs, menu) is open. */
  stopOnEscape: boolean
}

export function Composer({ value, onChange, onSend, isRunning, focusKey, onStop, isStopping, stopOnEscape }: ComposerProps): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const canSend = !isRunning && value.trim().length > 0

  useEffect(() => {
    if (!isRunning || !stopOnEscape || isStopping) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onStop()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isRunning, stopOnEscape, isStopping, onStop])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [value])

  useEffect(() => {
    if (!isRunning) {
      textareaRef.current?.focus()
    }
  }, [isRunning, focusKey])

  return (
    <div className="composer-wrap">
      <div className={`composer${isRunning ? ' is-disabled' : ''}`}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={isRunning}
          placeholder={isRunning ? (isStopping ? 'Останавливаю агента…' : 'Агент работает…') : 'Напишите задачу…'}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (canSend) {
                onSend()
              }
            }
          }}
        />
        {isRunning ? (
          <button
            type="button"
            className="send-btn is-stop"
            onClick={onStop}
            disabled={isStopping}
            aria-label="Остановить"
            title="Остановить (Esc)"
          >
            {isStopping ? <span className="spinner" /> : <IconStop size={14} />}
          </button>
        ) : (
          <button
            type="button"
            className="send-btn"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Отправить"
            title="Отправить (Enter)"
          >
            <IconArrowUp size={16} />
          </button>
        )}
      </div>
      <div className="composer-hint">{isRunning ? 'Esc — остановить агента' : 'Enter — отправить · Shift+Enter — новая строка'}</div>
    </div>
  )
}
