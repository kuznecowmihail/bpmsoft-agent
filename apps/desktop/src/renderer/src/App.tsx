import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ProjectValidationResult, AgentProvider, AgentSettings } from '../../shared/types'
import {
  agentEventToLog,
  describeToolCall,
  isEntryVisible,
  mapAgentEventToEntry,
  newEntryId,
  newLogEvent,
  permissionSubject,
  projectName
} from './chatFormat'
import type { ChatEntry, LogEvent } from './chatFormat'
import { Composer } from './components/Composer'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { LogsDrawer } from './components/LogsDrawer'
import { MessageList } from './components/MessageList'
import type { PermissionRequestEntry } from './components/MessageList'
import { IconAlert, IconFolder, IconLogo } from './components/icons'

type Screen = 'picker' | 'apiKey' | 'chat'

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('picker')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [validation, setValidation] = useState<ProjectValidationResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const [apiKeyInput, setApiKeyInput] = useState('')

  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null)

  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const [permissionRequests, setPermissionRequests] = useState<PermissionRequestEntry[]>([])
  const unsubscribePermissionRef = useRef<(() => void) | null>(null)

  const [logEvents, setLogEvents] = useState<LogEvent[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [composerFocusKey, setComposerFocusKey] = useState(0)

  const feedRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  useLayoutEffect(() => {
    const feed = feedRef.current
    if (feed && stickToBottomRef.current) {
      feed.scrollTop = feed.scrollHeight
    }
  }, [entries, permissionRequests, showDebug, screen, isRunning])

  const pushLog = (event: LogEvent): void => {
    setLogEvents((prev) => [...prev, event])
  }

  const refreshSettings = async (): Promise<AgentSettings> => {
    const settings = await window.api.getAgentSettings()
    setAgentSettings(settings)
    return settings
  }

  const subscribeToAgent = (): void => {
    if (!unsubscribeRef.current) {
      unsubscribeRef.current = window.api.onAgentEvent((event) => {
        setEntries((prev) => [...prev, mapAgentEventToEntry(event)])
        setLogEvents((prev) => [...prev, agentEventToLog(event)])
      })
    }
    if (!unsubscribePermissionRef.current) {
      unsubscribePermissionRef.current = window.api.onPermissionRequest((request) => {
        setPermissionRequests((prev) => [...prev, request])
        setLogEvents((prev) => [
          ...prev,
          newLogEvent(
            'warn',
            'permission',
            `Запрос разрешения: ${describeToolCall(request.toolName, request.input)}`,
            permissionSubject(request.toolName, request.input)
          )
        ])
      })
    }
  }

  const handleSelectFolder = async (): Promise<void> => {
    const projectPath = await window.api.selectProjectFolder()
    if (!projectPath) {
      return
    }
    setSelectedPath(projectPath)
    setValidation(null)
    setEntries([])
    setIsChecking(true)
    try {
      const result = await window.api.validateProject(projectPath)
      setValidation(result)
      if (result.isValid) {
        const settings = await refreshSettings()
        if (settings.provider === 'claude' && !settings.hasClaudeKey) {
          setScreen('apiKey')
        } else {
          subscribeToAgent()
          setScreen('chat')
        }
      }
    } finally {
      setIsChecking(false)
    }
  }

  const handleSubmitApiKey = async (): Promise<void> => {
    if (!apiKeyInput.trim()) {
      return
    }
    await window.api.setApiKey(apiKeyInput.trim())
    setApiKeyInput('')
    await refreshSettings()
    subscribeToAgent()
    setScreen('chat')
  }

  const handleChangeApiKey = async (): Promise<void> => {
    await window.api.clearApiKey()
    await refreshSettings()
    setScreen('apiKey')
  }

  const handlePermissionResponse = async (id: string, approved: boolean): Promise<void> => {
    setPermissionRequests((prev) => prev.filter((request) => request.id !== id))
    pushLog(newLogEvent(approved ? 'info' : 'warn', 'permission', approved ? `Разрешено (запрос ${id})` : `Отклонено (запрос ${id})`))
    await window.api.respondToPermissionRequest(id, approved)
  }

  const handleFeedScroll = (): void => {
    const feed = feedRef.current
    if (!feed) return
    stickToBottomRef.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40
  }

  const handleSend = async (): Promise<void> => {
    const text = prompt.trim()
    if (!text || !validation?.pkgRoot || isRunning) {
      return
    }
    setEntries((prev) => [...prev, { id: newEntryId(), ts: Date.now(), role: 'user', content: text }])
    pushLog(newLogEvent('info', 'user', text))
    stickToBottomRef.current = true
    setPrompt('')
    setIsRunning(true)
    try {
      const additionalDirectories = [
        validation.appRoot,
        validation.resourcesRoot,
        validation.autogeneratedRoot,
        validation.confContent,
        validation.resourcesCoreRoot
      ].filter((dir): dir is string => Boolean(dir))
      await window.api.sendMessage(text, validation.pkgRoot, additionalDirectories, validation.appRoot ?? validation.pkgRoot)
    } catch (error) {
      const message = (error as Error).message
      setEntries((prev) => [
        ...prev,
        { id: newEntryId(), ts: Date.now(), role: 'agent-result', level: 'error', content: `Ошибка: ${message}` }
      ])
      pushLog(newLogEvent('error', 'app', message))
    } finally {
      setIsRunning(false)
    }
  }

  const resetChatView = (): void => {
    setEntries([])
    setPermissionRequests([])
    setLogEvents([])
    stickToBottomRef.current = true
    setComposerFocusKey((key) => key + 1)
  }

  const handleProviderChange = async (provider: AgentProvider): Promise<void> => {
    if (isRunning) {
      return
    }
    await window.api.setProvider(provider)
    const settings = await refreshSettings()
    resetChatView()
    if (provider === 'claude' && !settings.hasClaudeKey) {
      setScreen('apiKey')
    }
  }

  const handleUseCursor = async (): Promise<void> => {
    await window.api.setProvider('cursor')
    await refreshSettings()
    resetChatView()
    subscribeToAgent()
    setScreen('chat')
  }

  const handleNewChat = async (): Promise<void> => {
    if (isRunning) {
      return
    }
    await window.api.newChat()
    resetChatView()
  }

  const handleOpenLogsFolder = async (): Promise<void> => {
    await window.api.openLogs()
  }

  const handlePickSuggestion = (text: string): void => {
    setPrompt(text)
    setComposerFocusKey((key) => key + 1)
  }

  const handleCloseLogs = useCallback(() => setLogsOpen(false), [])

  if (screen === 'picker') {
    return (
      <div className="screen">
        <div className="screen-drag" />
        <div className="screen-body">
          <div className="card">
            <div className="logo-lg">
              <IconLogo size={24} />
            </div>
            <h1>BPMSoft AI Agent</h1>
            <p>Откройте папку приложения BPMSoft — агент будет работать с пакетами в BPMSoft.Configuration/Pkg.</p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={handleSelectFolder} disabled={isChecking}>
              {isChecking ? <span className="spinner" /> : <IconFolder size={16} />}
              {isChecking ? 'Проверяю проект…' : 'Выбрать папку проекта'}
            </button>
            {selectedPath && validation && !validation.isValid && (
              <div className="form-error">
                <IconAlert size={14} />
                <span>{validation.reason}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'apiKey') {
    return (
      <div className="screen">
        <div className="screen-drag" />
        <div className="screen-body">
          <div className="card">
            <div className="logo-lg">
              <IconLogo size={24} />
            </div>
            <h1>Ключ Anthropic API</h1>
            <p>
              Проект: <b title={selectedPath ?? ''}>{projectName(selectedPath ?? '')}</b>. Ключ хранится локально в
              защищённом хранилище ОС (Keychain).
            </p>
            <input
              className="input"
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSubmitApiKey()
                }
              }}
              placeholder="sk-ant-…"
              autoFocus
            />
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              onClick={handleSubmitApiKey}
              disabled={!apiKeyInput.trim()}
            >
              Продолжить
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={handleUseCursor}>
              Использовать Cursor вместо Claude
            </button>
          </div>
        </div>
      </div>
    )
  }

  const visibleEntries = entries.filter((entry) => isEntryVisible(entry, showDebug))
  const isEmpty = visibleEntries.length === 0 && permissionRequests.length === 0 && !isRunning

  return (
    <div className="app">
      <Header
        projectPath={selectedPath ?? ''}
        projectKind={validation?.kind}
        isRunning={isRunning}
        showDebug={showDebug}
        onToggleDebug={setShowDebug}
        onNewChat={handleNewChat}
        onOpenLogs={() => setLogsOpen(true)}
        onOpenLogsFolder={handleOpenLogsFolder}
        onChangeApiKey={handleChangeApiKey}
        settings={agentSettings}
        onProviderChange={handleProviderChange}
        onSettingsChanged={() => {
          void refreshSettings()
        }}
      />
      <main className="main">
        <div ref={feedRef} onScroll={handleFeedScroll} className={`feed${isEmpty ? ' is-empty' : ''}`}>
          {isEmpty ? (
            <EmptyState projectName={projectName(selectedPath ?? '')} onPick={handlePickSuggestion} />
          ) : (
            <MessageList
              entries={visibleEntries}
              isRunning={isRunning}
              permissionRequests={permissionRequests}
              onPermissionResponse={handlePermissionResponse}
            />
          )}
        </div>
        <Composer
          value={prompt}
          onChange={setPrompt}
          onSend={handleSend}
          isRunning={isRunning}
          focusKey={composerFocusKey}
        />
      </main>
      {logsOpen && (
        <LogsDrawer
          events={logEvents}
          onClose={handleCloseLogs}
          onClear={() => setLogEvents([])}
          onOpenFolder={handleOpenLogsFolder}
        />
      )}
    </div>
  )
}

export default App
