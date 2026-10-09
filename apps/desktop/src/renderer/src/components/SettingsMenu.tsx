import { useEffect, useState } from 'react'
import type { AgentProvider, AgentSettings, CursorModelOption, ClaudeModelOption } from '../../../shared/types'
import { IconExternal, IconKey } from './icons'
import { Toggle } from './Toggle'

interface SettingsMenuProps {
  settings: AgentSettings | null
  isRunning: boolean
  showDebug: boolean
  onToggleDebug: (value: boolean) => void
  onProviderChange: (provider: AgentProvider) => void
  onChangeClaudeKey: () => void
  onSettingsChanged: () => void
  onOpenLogsFolder: () => void
  onClose: () => void
}

const PROVIDERS: Array<{ id: AgentProvider; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' }
]

/** Stable select value for a model + variant params. */
function modelKey(id: string, params?: Array<{ id: string; value: string }>): string {
  return params && params.length > 0 ? `${id}?${params.map((param) => `${param.id}=${param.value}`).join('&')}` : id
}

/** Stable select value for a Claude model + effort. */
function claudeKey(id: string, effort?: string): string {
  return effort ? `${id}?effort=${effort}` : id
}

export function SettingsMenu({
  settings,
  isRunning,
  showDebug,
  onToggleDebug,
  onProviderChange,
  onChangeClaudeKey,
  onSettingsChanged,
  onOpenLogsFolder,
  onClose
}: SettingsMenuProps): React.JSX.Element {
  const [cursorKeyInput, setCursorKeyInput] = useState('')
  const [editingCursorKey, setEditingCursorKey] = useState(false)
  const [models, setModels] = useState<CursorModelOption[] | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [claudeModels, setClaudeModels] = useState<ClaudeModelOption[] | null>(null)
  const [claudeModelsError, setClaudeModelsError] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const provider = settings?.provider ?? 'claude'
  const hasCursorKey = Boolean(settings?.hasCursorKey)

  useEffect(() => {
    if (provider !== 'cursor' || !hasCursorKey || models !== null) {
      return
    }
    let cancelled = false
    window.api
      .listCursorModels()
      .then((list) => {
        if (!cancelled) {
          setModels(list)
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setModelsError(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
        }
      })
    return () => {
      cancelled = true
    }
  }, [provider, hasCursorKey, models])

  useEffect(() => {
    if (provider !== 'claude' || !settings?.hasClaudeKey || claudeModels !== null) {
      return
    }
    let cancelled = false
    window.api
      .listClaudeModels()
      .then((list) => {
        if (!cancelled) {
          setClaudeModels(list)
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setClaudeModelsError(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
        }
      })
    return () => {
      cancelled = true
    }
  }, [provider, settings?.hasClaudeKey, claudeModels])

  const handleSaveCursorKey = async (): Promise<void> => {
    const key = cursorKeyInput.trim()
    if (!key) {
      return
    }
    setIsSaving(true)
    setKeyError(null)
    try {
      await window.api.setCursorApiKey(key)
      setCursorKeyInput('')
      setEditingCursorKey(false)
      setModels(null)
      setModelsError(null)
      onSettingsChanged()
    } catch (error) {
      setKeyError((error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setIsSaving(false)
    }
  }

  const handleModelChange = async (key: string): Promise<void> => {
    const option = (models ?? []).find((m) => modelKey(m.id, m.params) === key)
    if (option) {
      await window.api.setCursorModel({ id: option.id, params: option.params, name: option.name })
      onSettingsChanged()
    }
  }

  const handleClaudeModelChange = async (key: string): Promise<void> => {
    if (key === '') {
      await window.api.setClaudeModel({ id: '', name: '' })
    } else {
      const option = (claudeModels ?? []).find((m) => claudeKey(m.id, m.effort) === key)
      if (option) {
        await window.api.setClaudeModel({ id: option.id, effort: option.effort, name: option.name })
      }
    }
    onSettingsChanged()
  }

  const currentKey = settings ? modelKey(settings.cursorModel, settings.cursorModelParams) : ''
  const recommended = (models ?? []).filter((m) => m.recommended)
  const others = (models ?? []).filter((m) => !m.recommended)
  const hasCurrent = (models ?? []).some((m) => modelKey(m.id, m.params) === currentKey)

  const currentClaudeKey = settings?.claudeModel ? claudeKey(settings.claudeModel, settings.claudeEffort || undefined) : ''
  const recommendedClaude = (claudeModels ?? []).filter((m) => m.recommended)
  const othersClaude = (claudeModels ?? []).filter((m) => !m.recommended)
  const hasCurrentClaude = (claudeModels ?? []).some((m) => claudeKey(m.id, m.effort) === currentClaudeKey)

  return (
    <div className="popover" role="menu">
      <div className="popover-section">
        <div className="popover-label">Провайдер агента</div>
        <div className="segmented" role="radiogroup" aria-label="Провайдер агента">
          {PROVIDERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={provider === item.id}
              className={provider === item.id ? 'active' : ''}
              disabled={isRunning || !settings}
              onClick={() => {
                if (provider !== item.id) {
                  onProviderChange(item.id)
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="popover-note">Смена провайдера начинает новый чат.</div>
      </div>
      <div className="popover-divider" />
      {provider === 'claude' ? (
        <div className="popover-section">
          <div className="popover-label">API-ключ Anthropic</div>
          <div className="popover-row">
            <span className={`key-status${settings?.hasClaudeKey ? '' : ' is-off'}`}>
              {settings?.hasClaudeKey ? 'Сохранён в Keychain' : 'Не задан'}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isRunning}
              onClick={() => {
                onClose()
                onChangeClaudeKey()
              }}
            >
              <IconKey size={13} />
              {settings?.hasClaudeKey ? 'Сменить' : 'Задать'}
            </button>
          </div>
          {settings?.hasClaudeKey && (
            <div className="popover-field">
              <div className="popover-field-label">Модель</div>
              <select className="select" value={currentClaudeKey} disabled={isRunning} onChange={(event) => handleClaudeModelChange(event.target.value)}>
                <option value="">По умолчанию (SDK)</option>
                {!hasCurrentClaude && settings && currentClaudeKey && (
                  <option value={currentClaudeKey}>{settings.claudeModelName || settings.claudeModel}</option>
                )}
                {recommendedClaude.length > 0 && (
                  <optgroup label="Рекомендуемые">
                    {recommendedClaude.map((model) => (
                      <option key={claudeKey(model.id, model.effort)} value={claudeKey(model.id, model.effort)}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {othersClaude.length > 0 && (
                  <optgroup label="Все модели">
                    {othersClaude.map((model) => (
                      <option key={claudeKey(model.id, model.effort)} value={claudeKey(model.id, model.effort)}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {claudeModelsError && <div className="popover-error">Не удалось загрузить модели: {claudeModelsError}</div>}
              <div className="popover-note">Список — модели, доступные вашему ключу. Варианты XHigh и Max умнее на сложных задачах, но медленнее и дороже; Low и Medium — быстрее и дешевле.</div>
            </div>
          )}
        </div>
      ) : (
        <div className="popover-section">
          <div className="popover-label">Cursor</div>
          {hasCursorKey && !editingCursorKey ? (
            <div className="popover-row">
              <span className="key-status">Ключ сохранён в Keychain</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={isRunning} onClick={() => setEditingCursorKey(true)}>
                <IconKey size={13} />
                Сменить
              </button>
            </div>
          ) : (
            <div>
              <div className="popover-field-label">API-ключ Cursor (Dashboard → API Keys)</div>
              <div className="popover-inline">
                <input
                  className="input"
                  type="password"
                  placeholder="Ключ Cursor"
                  value={cursorKeyInput}
                  onChange={(event) => setCursorKeyInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSaveCursorKey()
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={isSaving || !cursorKeyInput.trim()}
                  onClick={handleSaveCursorKey}
                >
                  Сохранить
                </button>
              </div>
              {keyError && <div className="popover-error">{keyError}</div>}
            </div>
          )}
          {hasCursorKey && (
            <div className="popover-field">
              <div className="popover-field-label">Модель</div>
              <select
                className="select"
                value={currentKey}
                disabled={isRunning}
                onChange={(event) => handleModelChange(event.target.value)}
              >
                {!hasCurrent && settings && (
                  <option value={currentKey}>{settings.cursorModelName || settings.cursorModel}</option>
                )}
                {recommended.length > 0 && (
                  <optgroup label="Рекомендуемые">
                    {recommended.map((model) => (
                      <option key={modelKey(model.id, model.params)} value={modelKey(model.id, model.params)}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label="Все модели">
                    {others.map((model) => (
                      <option key={modelKey(model.id, model.params)} value={modelKey(model.id, model.params)}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {modelsError && <div className="popover-error">Не удалось загрузить модели: {modelsError}</div>}
              <div className="popover-note">Варианты Thinking и Max умнее на сложных задачах, но медленнее и дороже.</div>
            </div>
          )}
          <div className="popover-note">
            Cursor не спрашивает разрешений по ходу работы: запись ограничена папкой Pkg, удаление и изменения git агент
            делает только после вашего согласия в чате.
          </div>
        </div>
      )}
      <div className="popover-divider" />
      <div className="popover-section">
        <div className="popover-row">
          <div>
            <div className="popover-row-title">Служебные события</div>
            <div className="popover-row-hint">Технические события агента в ленте</div>
          </div>
          <Toggle checked={showDebug} onChange={onToggleDebug} label="Служебные события" />
        </div>
      </div>
      <div className="popover-divider" />
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          onClose()
          onOpenLogsFolder()
        }}
      >
        <IconExternal size={14} />
        Открыть папку логов
      </button>
    </div>
  )
}
