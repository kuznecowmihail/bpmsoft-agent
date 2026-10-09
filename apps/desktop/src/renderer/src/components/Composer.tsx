import { useEffect, useLayoutEffect, useRef } from 'react'
import { IconArrowUp } from './icons'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  isRunning: boolean
  /** Changing this number moves focus into the input. */
  focusKey: number
}

export function Composer({ value, onChange, onSend, isRunning, focusKey }: ComposerProps): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const canSend = !isRunning && value.trim().length > 0

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
          placeholder={isRunning ? 'Агент работает…' : 'Напишите задачу…'}
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
        <button
          type="button"
          className="send-btn"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Отправить"
          title="Отправить (Enter)"
        >
          {isRunning ? <span className="spinner" /> : <IconArrowUp size={16} />}
        </button>
      </div>
      <div className="composer-hint">Enter — отправить · Shift+Enter — новая строка</div>
    </div>
  )
}
