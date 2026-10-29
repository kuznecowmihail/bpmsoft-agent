import { useState } from 'react'

interface JiraTaskBarProps {
  disabled: boolean
  onTake: (keyOrUrl: string) => Promise<void>
}

/** Starts a chat with a Jira issue: the key or link is typed here, the issue text goes to the agent. */
export function JiraTaskBar({ disabled, onTake }: JiraTaskBarProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const collapse = (): void => {
    setExpanded(false)
    setValue('')
    setError(null)
  }

  const submit = async (): Promise<void> => {
    const keyOrUrl = value.trim()
    if (!keyOrUrl || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onTake(keyOrUrl)
      collapse()
    } catch (err) {
      setError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }

  if (!expanded) {
    return (
      <div className="jira-task-bar">
        <div>
          <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => setExpanded(true)}>
            Взять задачу из Jira
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="jira-task-bar">
      <div className="jira-task-bar-row">
        <input
          className="input"
          placeholder="Ключ PRJ-123 или ссылка на задачу"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void submit()
            } else if (event.key === 'Escape') {
              collapse()
            }
          }}
          disabled={busy}
          autoFocus
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={disabled || busy || !value.trim()} onClick={() => void submit()}>
          {busy ? 'Загружаю…' : 'Взять'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={collapse}>
          Отмена
        </button>
      </div>
      {error && <div className="popover-error">{error}</div>}
    </div>
  )
}
