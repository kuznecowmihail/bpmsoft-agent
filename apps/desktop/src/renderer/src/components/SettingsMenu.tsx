import { useEffect, useState } from 'react'
import type { AgentProvider, AgentSettings, CursorModelOption, ClaudeModelOption, DbSettingsPatch, CrmSettingsPatch } from '../../../shared/types'
import { IconExternal, IconTrash } from './icons'
import { Toggle } from './Toggle'

interface SettingsMenuProps {
  settings: AgentSettings | null
  isRunning: boolean
  showDebug: boolean
  onToggleDebug: (value: boolean) => void
  onProviderChange: (provider: AgentProvider) => void
  onSettingsChanged: () => void
  onOpenLogsFolder: () => void
  /** Opened application folder: the root for the CRM database connection check. */
  appRoot?: string
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

function errorText(error: unknown): string {
  return (error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function SettingsMenu({
  settings,
  isRunning,
  showDebug,
  onToggleDebug,
  onProviderChange,
  onSettingsChanged,
  onOpenLogsFolder,
  appRoot,
  onClose
}: SettingsMenuProps): React.JSX.Element {
  const [cursorKeyInput, setCursorKeyInput] = useState('')
  const [editingCursorKey, setEditingCursorKey] = useState(false)
  const [claudeKeyInput, setClaudeKeyInput] = useState('')
  const [editingClaudeKey, setEditingClaudeKey] = useState(false)
  const [models, setModels] = useState<CursorModelOption[] | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [claudeModels, setClaudeModels] = useState<ClaudeModelOption[] | null>(null)
  const [claudeModelsError, setClaudeModelsError] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [dbHost, setDbHost] = useState(settings?.dbHost ?? '')
  const [dbPort, setDbPort] = useState(settings?.dbPort ?? '')
  const [dbUser, setDbUser] = useState(settings?.dbUser ?? '')
  const [dbPasswordInput, setDbPasswordInput] = useState('')
  const [editingDbPassword, setEditingDbPassword] = useState(false)
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [isTestingDb, setIsTestingDb] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)
  const [crmUrl, setCrmUrl] = useState(settings?.crmUrl ?? '')
  const [crmUser, setCrmUser] = useState(settings?.crmUser ?? '')
  const [crmPasswordInput, setCrmPasswordInput] = useState('')
  const [editingCrmPassword, setEditingCrmPassword] = useState(false)
  const [crmTestResult, setCrmTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [isTestingCrm, setIsTestingCrm] = useState(false)
  const [crmError, setCrmError] = useState<string | null>(null)
  const [cursorError, setCursorError] = useState<string | null>(null)

  useEffect(() => {
    setDbHost(settings?.dbHost ?? '')
    setDbPort(settings?.dbPort ?? '')
    setDbUser(settings?.dbUser ?? '')
  }, [settings?.dbHost, settings?.dbPort, settings?.dbUser])

  useEffect(() => {
    setCrmUrl(settings?.crmUrl ?? '')
    setCrmUser(settings?.crmUser ?? '')
  }, [settings?.crmUrl, settings?.crmUser])

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

  const handleSaveClaudeKey = async (): Promise<void> => {
    const key = claudeKeyInput.trim()
    if (!key) {
      return
    }
    setIsSaving(true)
    setKeyError(null)
    try {
      await window.api.setApiKey(key)
      setClaudeKeyInput('')
      setEditingClaudeKey(false)
      setClaudeModels(null)
      setClaudeModelsError(null)
      onSettingsChanged()
    } catch (error) {
      setKeyError((error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearClaudeKey = async (): Promise<void> => {
    setKeyError(null)
    try {
      await window.api.clearApiKey()
      setEditingClaudeKey(false)
      setClaudeModels(null)
      setClaudeModelsError(null)
      onSettingsChanged()
    } catch (error) {
      setKeyError(errorText(error))
    }
  }

  const handleClearCursorKey = async (): Promise<void> => {
    setKeyError(null)
    try {
      await window.api.clearCursorApiKey()
      setEditingCursorKey(false)
      setModels(null)
      setModelsError(null)
      onSettingsChanged()
    } catch (error) {
      setKeyError(errorText(error))
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

  const saveDbSettings = async (patch: DbSettingsPatch): Promise<void> => {
    setDbError(null)
    try {
      await window.api.setDbSettings(patch)
      onSettingsChanged()
    } catch (error) {
      setDbError(errorText(error))
    }
  }

  const saveCursorUnsandboxed = async (value: boolean): Promise<void> => {
    setCursorError(null)
    try {
      await window.api.setCursorUnsandboxed(value)
      onSettingsChanged()
    } catch (error) {
      setCursorError(errorText(error))
    }
  }

  const handleSaveDbPassword = async (): Promise<void> => {
    if (!dbPasswordInput) {
      return
    }
    setIsSaving(true)
    setDbError(null)
    try {
      await window.api.setDbPassword(dbPasswordInput)
      setDbPasswordInput('')
      setEditingDbPassword(false)
      onSettingsChanged()
    } catch (error) {
      setDbError(errorText(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearDbPassword = async (): Promise<void> => {
    setDbError(null)
    try {
      await window.api.clearDbPassword()
      onSettingsChanged()
    } catch (error) {
      setDbError(errorText(error))
    }
  }

  const handleTestDb = async (): Promise<void> => {
    if (!appRoot) {
      return
    }
    setIsTestingDb(true)
    setDbTestResult(null)
    try {
      const text = await window.api.testDbConnection(appRoot)
      setDbTestResult({ ok: true, text })
    } catch (error) {
      setDbTestResult({ ok: false, text: errorText(error) })
    } finally {
      setIsTestingDb(false)
    }
  }

  const saveCrmSettings = async (patch: CrmSettingsPatch): Promise<void> => {
    setCrmError(null)
    try {
      await window.api.setCrmSettings(patch)
      onSettingsChanged()
    } catch (error) {
      setCrmError(errorText(error))
    }
  }

  const handleSaveCrmPassword = async (): Promise<void> => {
    if (!crmPasswordInput) {
      return
    }
    setIsSaving(true)
    setCrmError(null)
    try {
      await window.api.setCrmPassword(crmPasswordInput)
      setCrmPasswordInput('')
      setEditingCrmPassword(false)
      onSettingsChanged()
    } catch (error) {
      setCrmError(errorText(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearCrmPassword = async (): Promise<void> => {
    setCrmError(null)
    try {
      await window.api.clearCrmPassword()
      onSettingsChanged()
    } catch (error) {
      setCrmError(errorText(error))
    }
  }

  const handleTestCrm = async (): Promise<void> => {
    setIsTestingCrm(true)
    setCrmTestResult(null)
    try {
      const text = await window.api.testCrmConnection()
      setCrmTestResult({ ok: true, text })
    } catch (error) {
      setCrmTestResult({ ok: false, text: errorText(error) })
    } finally {
      setIsTestingCrm(false)
    }
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
          <div className="popover-label">Claude</div>
          {settings?.hasClaudeKey && !editingClaudeKey ? (
            <>
              <div className="popover-row">
                <span className="key-status">Ключ в Keychain</span>
                <div className="popover-inline">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={isRunning} onClick={() => setEditingClaudeKey(true)}>
                    Сменить
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    disabled={isRunning}
                    onClick={handleClearClaudeKey}
                    title="Удалить ключ"
                    aria-label="Удалить ключ"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
              {keyError && <div className="popover-error">{keyError}</div>}
            </>
          ) : (
            <div>
              <div className="popover-field-label">API-ключ Anthropic (console.anthropic.com → API Keys)</div>
              <div className="popover-inline">
                <input
                  className="input"
                  type="password"
                  placeholder="sk-ant-…"
                  value={claudeKeyInput}
                  onChange={(event) => setClaudeKeyInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSaveClaudeKey()
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={isSaving || !claudeKeyInput.trim()}
                  onClick={handleSaveClaudeKey}
                >
                  Сохранить
                </button>
              </div>
              {keyError && <div className="popover-error">{keyError}</div>}
            </div>
          )}
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
            <>
              <div className="popover-row">
                <span className="key-status">Ключ в Keychain</span>
                <div className="popover-inline">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={isRunning} onClick={() => setEditingCursorKey(true)}>
                    Сменить
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    disabled={isRunning}
                    onClick={handleClearCursorKey}
                    title="Удалить ключ"
                    aria-label="Удалить ключ"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
              {keyError && <div className="popover-error">{keyError}</div>}
            </>
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
          {settings?.platform === 'win32' && (
            <div className="popover-field">
              <div className="popover-row">
                <div>
                  <div className="popover-row-title">Разрешить Cursor без песочницы</div>
                  <div className="popover-row-hint">На Windows у Cursor нет песочницы: запись вне Pkg ограничена только правилами для модели</div>
                </div>
                <Toggle
                  checked={Boolean(settings?.cursorUnsandboxed)}
                  onChange={(value) => saveCursorUnsandboxed(value)}
                  label="Разрешить Cursor без песочницы"
                />
              </div>
              {cursorError && <div className="popover-error">{cursorError}</div>}
            </div>
          )}
          <div className="popover-note">
            Cursor не спрашивает разрешений по ходу работы: запись ограничена папкой Pkg{settings?.platform === 'win32' ? ' (на Windows — только правилами для модели)' : ''}, удаление и изменения git агент делает только после вашего согласия в чате.
          </div>
        </div>
      )}
      <div className="popover-divider" />
      <div className="popover-section">
        <div className="popover-row">
          <div>
            <div className="popover-row-title">Доступ агента к БД CRM</div>
            <div className="popover-row-hint">Только чтение: один SELECT в транзакции только для чтения, до 200 строк</div>
          </div>
          <Toggle
            checked={Boolean(settings?.dbAccessEnabled)}
            onChange={(value) => saveDbSettings({ dbAccessEnabled: value })}
            label="Доступ агента к БД CRM"
          />
        </div>
        {dbError && <div className="popover-error">{dbError}</div>}
        {settings?.dbAccessEnabled && (
          <>
            <div className="popover-field">
              <div className="popover-row">
                <div>
                  <div className="popover-row-title">Спрашивать перед каждым запросом</div>
                  <div className="popover-row-hint">Показывать SQL и ждать вашего разрешения</div>
                </div>
                <Toggle
                  checked={Boolean(settings?.dbConfirmQueries)}
                  onChange={(value) => saveDbSettings({ dbConfirmQueries: value })}
                  label="Спрашивать перед каждым запросом"
                />
              </div>
            </div>
            <div className="popover-field">
              <div className="popover-field-label">Подключение (пусто — из ConnectionStrings.config)</div>
              <div className="popover-inline popover-inline-3">
                <input
                  className="input"
                  placeholder="Хост"
                  value={dbHost}
                  onChange={(event) => setDbHost(event.target.value)}
                  onBlur={() => saveDbSettings({ dbHost: dbHost.trim() })}
                />
                <input
                  className="input"
                  placeholder="Порт"
                  inputMode="numeric"
                  value={dbPort}
                  onChange={(event) => setDbPort(event.target.value.replace(/\D/g, '').slice(0, 5))}
                  onBlur={() => saveDbSettings({ dbPort })}
                />
                <input
                  className="input"
                  placeholder="Пользователь"
                  value={dbUser}
                  onChange={(event) => setDbUser(event.target.value)}
                  onBlur={() => saveDbSettings({ dbUser: dbUser.trim() })}
                />
              </div>
            </div>
            <div className="popover-field">
              {settings?.hasDbPassword && !editingDbPassword ? (
                <div className="popover-row">
                  <span className="key-status">Пароль в Keychain</span>
                  <div className="popover-inline">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={isRunning} onClick={() => setEditingDbPassword(true)}>
                      Сменить
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      disabled={isRunning}
                      onClick={handleClearDbPassword}
                      title="Удалить пароль"
                      aria-label="Удалить пароль"
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="popover-inline">
                  <input
                    className="input"
                    type="password"
                    placeholder="Пароль (пусто — из ConnectionStrings.config)"
                    value={dbPasswordInput}
                    onChange={(event) => setDbPasswordInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleSaveDbPassword()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={isSaving || !dbPasswordInput}
                    onClick={handleSaveDbPassword}
                  >
                    Сохранить
                  </button>
                </div>
              )}
            </div>
            <div className="popover-field">
              <button type="button" className="btn btn-secondary btn-sm" disabled={!appRoot || isTestingDb} onClick={handleTestDb}>
                Проверить подключение
              </button>
              {!appRoot && <div className="popover-note">Откройте проект, чтобы проверить подключение</div>}
              {dbTestResult &&
                (dbTestResult.ok ? (
                  <div className="popover-note">{dbTestResult.text}</div>
                ) : (
                  <div className="popover-error">{dbTestResult.text}</div>
                ))}
            </div>
            <div className="popover-note">
              Логин и пароль агенту не передаются — приложение подключается само. Надёжнее указать отдельного пользователя БД с
              правами только на чтение. Изменения действуют со следующего сообщения.
            </div>
          </>
        )}
      </div>
      <div className="popover-divider" />
      <div className="popover-section">
        <div className="popover-row">
          <div>
            <div className="popover-row-title">Действия агента в CRM</div>
            <div className="popover-row-hint">Обновить из файловой системы, компиляция и перезапуск — агент делает сам</div>
          </div>
          <Toggle
            checked={Boolean(settings?.crmActionsEnabled)}
            onChange={(value) => saveCrmSettings({ crmActionsEnabled: value })}
            label="Действия агента в CRM"
          />
        </div>
        <div className="popover-row">
          <div>
            <div className="popover-row-title">Встроенный браузер CRM</div>
            <div className="popover-row-hint">Агент открывает страницы CRM в панели справа (кнопка с глобусом): текст, снимок, консоль, сеть; клики — с разрешения, если включено подтверждение</div>
          </div>
          <Toggle
            checked={Boolean(settings?.crmBrowserEnabled)}
            onChange={(value) => saveCrmSettings({ crmBrowserEnabled: value })}
            label="Встроенный браузер CRM"
          />
        </div>
        {crmError && <div className="popover-error">{crmError}</div>}
        {(settings?.crmActionsEnabled || settings?.crmBrowserEnabled) && (
          <>
            {(settings?.crmActionsEnabled || settings?.crmBrowserEnabled) && (
              <div className="popover-field">
                <div className="popover-row">
                  <div>
                    <div className="popover-row-title">Спрашивать перед каждым действием</div>
                    <div className="popover-row-hint">Обновление, компиляция и клики в браузере — показывать и ждать вашего разрешения</div>
                  </div>
                  <Toggle
                    checked={Boolean(settings?.crmConfirmActions)}
                    onChange={(value) => saveCrmSettings({ crmConfirmActions: value })}
                    label="Спрашивать перед каждым действием"
                  />
                </div>
              </div>
            )}
            <div className="popover-field">
              <div className="popover-field-label">Адрес CRM и пользователь</div>
              <div className="popover-inline popover-inline-2">
                <input
                  className="input"
                  placeholder="http://localhost:8007"
                  value={crmUrl}
                  onChange={(event) => setCrmUrl(event.target.value)}
                  onBlur={() => saveCrmSettings({ crmUrl: crmUrl.trim() })}
                />
                <input
                  className="input"
                  placeholder="Пользователь"
                  value={crmUser}
                  onChange={(event) => setCrmUser(event.target.value)}
                  onBlur={() => saveCrmSettings({ crmUser: crmUser.trim() })}
                />
              </div>
            </div>
            <div className="popover-field">
              {settings?.hasCrmPassword && !editingCrmPassword ? (
                <div className="popover-row">
                  <span className="key-status">Пароль в Keychain</span>
                  <div className="popover-inline">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={isRunning} onClick={() => setEditingCrmPassword(true)}>
                      Сменить
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      disabled={isRunning}
                      onClick={handleClearCrmPassword}
                      title="Удалить пароль"
                      aria-label="Удалить пароль"
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="popover-inline">
                  <input
                    className="input"
                    type="password"
                    placeholder="Пароль"
                    value={crmPasswordInput}
                    onChange={(event) => setCrmPasswordInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleSaveCrmPassword()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={isSaving || !crmPasswordInput}
                    onClick={handleSaveCrmPassword}
                  >
                    Сохранить
                  </button>
                </div>
              )}
            </div>
            <div className="popover-field">
              <button type="button" className="btn btn-secondary btn-sm" disabled={isTestingCrm} onClick={handleTestCrm}>
                Проверить вход
              </button>
              {crmTestResult &&
                (crmTestResult.ok ? (
                  <div className="popover-note">{crmTestResult.text}</div>
                ) : (
                  <div className="popover-error">{crmTestResult.text}</div>
                ))}
            </div>
            <div className="popover-note">
              Нужен пользователь с ролью «Системный администратор». Пароль агенту не передаётся. Изменения действуют со следующего
              сообщения.
            </div>
          </>
        )}
      </div>
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
