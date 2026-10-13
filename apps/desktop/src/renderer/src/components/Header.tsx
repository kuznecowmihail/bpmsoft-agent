import { useEffect, useRef, useState } from 'react'
import type { AgentProvider, AgentSettings } from '../../../shared/types'
import { projectName } from '../chatFormat'
import { IconFolder, IconGlobe, IconLogo, IconLogout, IconPlus, IconSettings, IconTerminal } from './icons'
import { SettingsMenu } from './SettingsMenu'

interface HeaderProps {
  projectPath: string
  projectKind?: string
  isRunning: boolean
  showDebug: boolean
  onToggleDebug: (value: boolean) => void
  onNewChat: () => void
  onOpenLogs: () => void
  onOpenLogsFolder: () => void
  settings: AgentSettings | null
  onProviderChange: (provider: AgentProvider) => void
  onSettingsChanged: () => void
  /** Opened application folder: the root for the CRM database connection check. */
  appRoot?: string
  /** CRM browser panel is open. */
  browserOpen: boolean
  onToggleBrowser: () => void
  /** Reports the settings popover state, so the native CRM browser view can step aside. */
  onMenuOpenChange?: (open: boolean) => void
  /** Returns to the project picker. */
  onChangeProject: () => void
}

type BadgeStatus = { state: 'checking' | 'ok' | 'error'; text: string }

/** Header status badge (DB, CRM): gray when off, checks on change and on click. */
function StatusBadge({
  label,
  enabled,
  offTitle,
  deps,
  check
}: {
  label: string
  enabled: boolean
  offTitle: string
  deps: unknown[]
  check: () => Promise<string>
}): React.JSX.Element {
  const [status, setStatus] = useState<BadgeStatus>({ state: 'checking', text: '' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    setStatus({ state: 'checking', text: '' })
    check()
      .then((text) => {
        if (!cancelled) setStatus({ state: 'ok', text })
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setStatus({ state: 'error', text: error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, ...deps, attempt])

  if (!enabled) {
    return (
      <span className="db-badge is-off" title={offTitle}>
        {label} выкл
      </span>
    )
  }

  const title =
    status.state === 'checking'
      ? 'Проверяю подключение…'
      : status.state === 'ok'
        ? `${status.text}. Нажмите, чтобы проверить снова`
        : `Нет подключения: ${status.text}. Нажмите, чтобы проверить снова`
  return (
    <button
      type="button"
      className={`db-badge is-${status.state}`}
      title={title}
      disabled={status.state === 'checking'}
      onClick={() => setAttempt((value) => value + 1)}
    >
      {status.state === 'error' ? `${label} недоступна` : label}
    </button>
  )
}

export function Header({
  projectPath,
  projectKind,
  isRunning,
  showDebug,
  onToggleDebug,
  onNewChat,
  onOpenLogs,
  onOpenLogsFolder,
  settings,
  onProviderChange,
  onSettingsChanged,
  appRoot,
  browserOpen,
  onToggleBrowser,
  onMenuOpenChange,
  onChangeProject
}: HeaderProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    onMenuOpenChange?.(menuOpen)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const handleMouseDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const handleCopyPath = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(projectPath)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — the full path is still shown in the tooltip
    }
  }

  return (
    <header className="header">
      <div className="header-brand">
        <div className="logo">
          <IconLogo size={15} />
        </div>
        <div className="header-titles">
          <span className="header-title">
            BPMSoft AI Agent
            {settings && (
              <span className="provider-badge" title="Провайдер агента — меняется в настройках">
                {settings.provider === 'cursor' ? `Cursor · ${settings.cursorModelName || settings.cursorModel}` : settings.claudeModelName ? `Claude · ${settings.claudeModelName}` : 'Claude'}
              </span>
            )}
            {settings && (
              <StatusBadge
                label="БД"
                enabled={Boolean(settings.dbAccessEnabled && appRoot)}
                offTitle={settings.dbAccessEnabled ? 'БД CRM: откройте проект, чтобы проверить подключение' : 'Доступ агента к БД CRM выключен — включается в настройках'}
                deps={[appRoot, settings.dbHost, settings.dbPort, settings.dbUser, settings.hasDbPassword]}
                check={() => window.api.testDbConnection(appRoot as string)}
              />
            )}
            {settings && (
              <StatusBadge
                label="CRM"
                enabled={Boolean((settings.crmActionsEnabled || settings.crmBrowserEnabled) && settings.crmUrl && settings.crmUser && settings.hasCrmPassword)}
                offTitle={
                  settings.crmActionsEnabled || settings.crmBrowserEnabled
                    ? 'CRM: укажите адрес, пользователя и пароль в настройках'
                    : 'Действия агента в CRM и браузер выключены — включаются в настройках'
                }
                deps={[settings.crmUrl, settings.crmUser, settings.hasCrmPassword]}
                check={() => window.api.testCrmConnection()}
              />
            )}
          </span>
          <div className="project-row">
            <button
              type="button"
              className="project-chip"
              title={`${projectPath}\nНажмите, чтобы скопировать путь`}
              onClick={handleCopyPath}
            >
              <IconFolder size={12} />
              <span className="project-name">{projectName(projectPath)}</span>
              {(copied || projectKind) && <span className="project-kind">· {copied ? 'путь скопирован' : projectKind}</span>}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm project-switch"
              onClick={onChangeProject}
              disabled={isRunning}
              title={isRunning ? 'Дождитесь окончания ответа агента' : 'Сменить проект — вернуться к выбору папки'}
              aria-label="Сменить проект"
            >
              <IconLogout size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="header-actions">
        {settings?.crmBrowserEnabled && (
          <button
            type="button"
            className={`btn btn-ghost btn-icon${browserOpen ? ' is-active' : ''}`}
            onClick={onToggleBrowser}
            title="Браузер CRM"
            aria-label="Браузер CRM"
            aria-pressed={browserOpen}
          >
            <IconGlobe size={16} />
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onOpenLogs} title="Логи сессии">
          <IconTerminal size={14} />
          <span className="btn-label">Логи</span>
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNewChat}
          disabled={isRunning}
          title={isRunning ? 'Дождитесь окончания ответа агента' : 'Начать новый чат'}
        >
          <IconPlus size={14} />
          <span className="btn-label">Новый чат</span>
        </button>
        <div className="popover-anchor" ref={menuRef}>
          {(() => {
            const keyReady = settings ? (settings.provider === 'cursor' ? settings.hasCursorKey : settings.hasClaudeKey) : true
            return (
              <>
                <button
                  type="button"
                  className={`btn btn-ghost btn-icon${menuOpen ? ' is-active' : ''}`}
                  onClick={() => setMenuOpen(!menuOpen)}
                  aria-label="Настройки"
                  aria-expanded={menuOpen}
                  title={keyReady ? 'Настройки' : 'Настройки · ключ не задан'}
                >
                  <IconSettings size={16} />
                  <span className={`status-dot${keyReady ? '' : ' is-off'}`} />
                </button>
                {menuOpen && (
                  <SettingsMenu
                    settings={settings}
                    isRunning={isRunning}
                    showDebug={showDebug}
                    onToggleDebug={onToggleDebug}
                    onProviderChange={(provider) => {
                      setMenuOpen(false)
                      onProviderChange(provider)
                    }}
                    onSettingsChanged={onSettingsChanged}
                    onOpenLogsFolder={onOpenLogsFolder}
                    appRoot={appRoot}
                    onClose={() => setMenuOpen(false)}
                  />
                )}
              </>
            )
          })()}
        </div>
      </div>
    </header>
  )
}
