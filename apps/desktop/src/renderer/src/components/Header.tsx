import { useEffect, useRef, useState } from 'react'
import type { AgentProvider, AgentSettings } from '../../../shared/types'
import { projectName } from '../chatFormat'
import { IconFolder, IconLogo, IconPlus, IconSettings, IconTerminal } from './icons'
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
  onChangeApiKey: () => void
  settings: AgentSettings | null
  onProviderChange: (provider: AgentProvider) => void
  onSettingsChanged: () => void
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
  onChangeApiKey,
  settings,
  onProviderChange,
  onSettingsChanged
}: HeaderProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

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
          </span>
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
        </div>
      </div>

      <div className="header-actions">
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
                    onChangeClaudeKey={onChangeApiKey}
                    onSettingsChanged={onSettingsChanged}
                    onOpenLogsFolder={onOpenLogsFolder}
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
