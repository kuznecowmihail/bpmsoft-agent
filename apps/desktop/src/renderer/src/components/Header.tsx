import { useEffect, useRef, useState } from 'react'
import type { AgentProvider, AgentSettings, EnvironmentReport } from '../../../shared/types'
import { projectName } from '../chatFormat'
import { problemChecks } from '../environmentFormat'
import { EnvironmentPanel } from './EnvironmentPanel'
import { subscribeConnection, type ConnectionKind } from '../connectionStatus'
import { IconAlert, IconFolder, IconGlobe, IconLogo, IconLogout, IconPlus, IconSettings, IconSidebar, IconTerminal } from './icons'
import { SettingsMenu } from './SettingsMenu'
import { GitBadge } from './GitBadge'

interface HeaderProps {
  projectPath: string
  projectKind?: string
  isRunning: boolean
  showDebug: boolean
  onToggleDebug: (value: boolean) => void
  onOpenLogs: () => void
  onOpenLogsFolder: () => void
  settings: AgentSettings | null
  onProviderChange: (provider: AgentProvider) => void
  onSettingsChanged: () => void
  /** Opened application folder: the root for the CRM database connection check. */
  appRoot?: string
  /** Pkg folder: git branch badge. */
  pkgRoot?: string
  /** CRM browser panel is open. */
  browserOpen: boolean
  onToggleBrowser: () => void
  /** Reports the settings popover state, so the native CRM browser view can step aside. */
  onMenuOpenChange?: (open: boolean) => void
  /** Returns to the project picker. */
  onChangeProject: () => void
  /** Chat sidebar (chat history) is shown. */
  sidebarOpen: boolean
  onToggleSidebar: () => void
  /** Starts a new chat (shown in the header while the sidebar is hidden). */
  onNewChat: () => void
  /** Environment check of the computer; the badge is shown while something is missing. */
  environment?: EnvironmentReport | null
  onRecheckEnvironment?: () => void
  environmentRechecking?: boolean
  /** Result of the Jira connection check from the header badge. */
  onJiraStateChange?: (state: BadgeState) => void
}

export type BadgeState = 'checking' | 'ok' | 'error'
type BadgeStatus = { state: BadgeState; text: string }

/** Header status badge (DB, CRM, Jira, Confluence): gray when off, checks on change and on click. */
function StatusBadge({
  kind,
  label,
  enabled,
  offTitle,
  deps,
  check,
  onStateChange
}: {
  kind: ConnectionKind
  label: string
  enabled: boolean
  offTitle: string
  deps: unknown[]
  check: () => Promise<string>
  onStateChange?: (state: BadgeState) => void
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

  // a check from the settings menu updates the badge right away
  useEffect(
    () =>
      subscribeConnection(kind, (result) => {
        setStatus({ state: result.ok ? 'ok' : 'error', text: result.text })
      }),
    [kind]
  )

  useEffect(() => {
    onStateChange?.(status.state)
  }, [status.state])

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

/** Confluence works with its own token, or with the Jira token when both sites are on the same host (as trackerConfig in main). */
function confluenceReady(settings: AgentSettings): boolean {
  if (!settings.confluenceUrl) return false
  if (settings.hasConfluenceToken) return true
  if (!settings.jiraUrl || !settings.hasJiraToken) return false
  try {
    return new URL(settings.confluenceUrl).host === new URL(settings.jiraUrl).host
  } catch {
    return false
  }
}

export function Header({
  projectPath,
  projectKind,
  isRunning,
  showDebug,
  onToggleDebug,
  onOpenLogs,
  onOpenLogsFolder,
  settings,
  onProviderChange,
  onSettingsChanged,
  appRoot,
  pkgRoot,
  browserOpen,
  onToggleBrowser,
  onMenuOpenChange,
  onChangeProject,
  sidebarOpen,
  onToggleSidebar,
  onNewChat,
  environment,
  onRecheckEnvironment,
  environmentRechecking = false,
  onJiraStateChange
}: HeaderProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [envOpen, setEnvOpen] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const envRef = useRef<HTMLDivElement | null>(null)

  // the environment popover is shown only while something is missing
  const problemCount = problemChecks(environment ?? null).length
  const envPopoverOpen = envOpen && problemCount > 0

  useEffect(() => {
    onMenuOpenChange?.(menuOpen || envPopoverOpen || gitOpen)
  }, [menuOpen, envPopoverOpen, gitOpen])

  useEffect(() => {
    if (!envPopoverOpen) {
      return
    }
    const handleMouseDown = (event: MouseEvent): void => {
      if (envRef.current && !envRef.current.contains(event.target as Node)) {
        setEnvOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setEnvOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [envPopoverOpen])

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
        <button
          type="button"
          className={`btn btn-ghost btn-sm btn-icon sidebar-toggle${sidebarOpen ? ' is-active' : ''}`}
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Скрыть список чатов' : 'Показать список чатов'}
          aria-label={sidebarOpen ? 'Скрыть список чатов' : 'Показать список чатов'}
          aria-pressed={sidebarOpen}
        >
          <IconSidebar size={16} />
        </button>
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
                kind="db"
                label="БД"
                enabled={Boolean(settings.dbAccessEnabled && appRoot)}
                offTitle={settings.dbAccessEnabled ? 'БД CRM: откройте проект, чтобы проверить подключение' : 'Доступ агента к БД CRM выключен — включается в настройках'}
                deps={[appRoot, settings.dbHost, settings.dbPort, settings.dbUser, settings.hasDbPassword]}
                check={() => window.api.testDbConnection(appRoot as string)}
              />
            )}
            {settings && (
              <StatusBadge
                kind="crm"
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
            {settings && (
              <StatusBadge
                kind="jira"
                label="Jira"
                enabled={Boolean(settings.jiraUrl && settings.hasJiraToken)}
                offTitle="Jira не подключена — адрес и токен задаются в настройках"
                deps={[settings.jiraUrl, settings.jiraEmail, settings.hasJiraToken]}
                check={() => window.api.testJiraConnection()}
                onStateChange={onJiraStateChange}
              />
            )}
            {settings && (
              <StatusBadge
                kind="confluence"
                label="Confluence"
                enabled={confluenceReady(settings)}
                offTitle="Confluence не подключена — адрес и токен задаются в настройках"
                deps={[settings.confluenceUrl, settings.confluenceEmail, settings.hasConfluenceToken, settings.jiraUrl, settings.hasJiraToken]}
                check={() => window.api.testConfluenceConnection()}
              />
            )}
            {settings && <GitBadge pkgRoot={pkgRoot} isRunning={isRunning} onOpenChange={setGitOpen} />}
            {environment && problemCount > 0 && (
              <div className="popover-anchor env-anchor" ref={envRef}>
                <button
                  type="button"
                  className={`env-badge${environment.canOpenProject ? '' : ' is-error'}`}
                  onClick={() => setEnvOpen(!envOpen)}
                  aria-expanded={envPopoverOpen}
                  title="Не всё установлено — нажмите, чтобы посмотреть"
                >
                  <IconAlert size={11} />
                  Окружение
                </button>
                {envPopoverOpen && (
                  <div className="popover env-popover" role="dialog" aria-label="Об устройстве">
                    <EnvironmentPanel
                      report={environment}
                      onRecheck={() => onRecheckEnvironment?.()}
                      rechecking={environmentRechecking}
                      defaultOpen
                    />
                  </div>
                )}
              </div>
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
        {!sidebarOpen && (
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
        )}
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
                    onProviderChange={onProviderChange}
                    onSettingsChanged={onSettingsChanged}
                    onOpenLogsFolder={onOpenLogsFolder}
                    appRoot={appRoot}
                    environment={environment}
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
