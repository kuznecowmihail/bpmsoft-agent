import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ProjectValidationResult, AgentProvider, AgentSettings, ChatSummary, RecentProject } from '../../shared/types'
import {
  agentEventToLog,
  describeToolCall,
  isDiagnosticEvent,
  isEntryVisible,
  lastTotalCostUsd,
  mapAgentEventToEntry,
  newEntryId,
  newLogEvent,
  permissionSubject,
  projectName,
  replayToEntries
} from './chatFormat'
import type { ChatEntry, LogEvent } from './chatFormat'
import { BrowserPanel } from './components/BrowserPanel'
import { ChatSidebar } from './components/ChatSidebar'
import { Composer } from './components/Composer'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { LogsDrawer } from './components/LogsDrawer'
import { MessageList } from './components/MessageList'
import type { PermissionRequestEntry } from './components/MessageList'
import { IconAlert, IconFolder, IconLogo, IconX } from './components/icons'

type Screen = 'picker' | 'chat'

const CONTEXT_LOST_MESSAGE = 'Контекст чата не восстановлен'
const CONTEXT_LOST_READ_ONLY = 'Контекст этого чата потерян — продолжить его нельзя. Начните новый чат.'

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('picker')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [validation, setValidation] = useState<ProjectValidationResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])

  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null)

  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isOpeningChat, setIsOpeningChat] = useState(false)
  const openRequestRef = useRef(0)
  const [showDebug, setShowDebug] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const [permissionRequests, setPermissionRequests] = useState<PermissionRequestEntry[]>([])
  const unsubscribePermissionRef = useRef<(() => void) | null>(null)

  const [logEvents, setLogEvents] = useState<LogEvent[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [composerFocusKey, setComposerFocusKey] = useState(0)

  const [browserOpen, setBrowserOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('chatSidebarOpen') !== '0')

  const feedRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)
  /** Cumulative total_cost_usd of the last result, to show the cost of each turn. */
  const lastCostRef = useRef<number | undefined>(undefined)

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
        const previousCost = lastCostRef.current
        if (event.type === 'result' && event.totalCostUsd != null) {
          lastCostRef.current = event.totalCostUsd
        }
        if (!isDiagnosticEvent(event)) {
          const entry = mapAgentEventToEntry(event, previousCost)
          setEntries((prev) => [...prev, entry])
        }
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

  const loadChats = async (pkgRoot: string): Promise<ChatSummary[]> => {
    const list = await window.api.listChats(pkgRoot)
    setChats(list)
    return list
  }

  const loadRecentProjects = async (): Promise<void> => {
    setRecentProjects(await window.api.listRecentProjects())
  }

  const openProject = async (projectPath: string): Promise<void> => {
    setSelectedPath(projectPath)
    setValidation(null)
    setEntries([])
    lastCostRef.current = undefined
    setActiveChatId(null)
    setReadOnlyReason(null)
    setIsChecking(true)
    try {
      const result = await window.api.validateProject(projectPath)
      setValidation(result)
      if (result.isValid) {
        await refreshSettings()
        if (result.pkgRoot) {
          await loadChats(result.pkgRoot)
        }
        subscribeToAgent()
        setScreen('chat')
      } else {
        await loadRecentProjects()
      }
    } finally {
      setIsChecking(false)
    }
  }

  const handleSelectFolder = async (): Promise<void> => {
    const projectPath = await window.api.selectProjectFolder()
    if (!projectPath) {
      return
    }
    await openProject(projectPath)
  }

  const handleRemoveRecent = async (projectPath: string): Promise<void> => {
    await window.api.removeRecentProject(projectPath)
    await loadRecentProjects()
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

  const sendText = async (text: string): Promise<void> => {
    if (!text || !validation?.pkgRoot || isRunning || isOpeningChat || readOnlyReason) {
      return
    }
    setEntries((prev) => [...prev, { id: newEntryId(), ts: Date.now(), role: 'user', content: text }])
    pushLog(newLogEvent('info', 'user', text))
    stickToBottomRef.current = true
    setIsRunning(true)
    try {
      const additionalDirectories = [
        validation.appRoot,
        validation.resourcesRoot,
        validation.autogeneratedRoot,
        validation.confContent
      ].filter((dir): dir is string => Boolean(dir))
      await window.api.sendMessage(text, validation.pkgRoot, additionalDirectories, validation.appRoot ?? validation.pkgRoot)
    } catch (error) {
      const message = (error as Error).message
      setEntries((prev) => [
        ...prev,
        { id: newEntryId(), ts: Date.now(), role: 'agent-result', level: 'error', content: `Ошибка: ${message}` }
      ])
      pushLog(newLogEvent('error', 'app', message))
      if (message.includes(CONTEXT_LOST_MESSAGE)) {
        setReadOnlyReason(CONTEXT_LOST_READ_ONLY)
      }
    } finally {
      setIsRunning(false)
      setIsStopping(false)
      if (validation?.pkgRoot) {
        const previousIds = new Set(chats.map((chat) => chat.id))
        const refreshed = await loadChats(validation.pkgRoot)
        if (activeChatId === null && refreshed[0] && !previousIds.has(refreshed[0].id)) {
          setActiveChatId(refreshed[0].id)
        }
      }
    }
  }

  const handleSelectChat = async (id: string): Promise<void> => {
    // a read-only chat may be opened again: its view is what the user sees, the session is not restored
    if (isRunning || isOpeningChat || (id === activeChatId && !readOnlyReason) || !validation?.pkgRoot) {
      return
    }
    const token = ++openRequestRef.current
    setIsOpeningChat(true)
    try {
      const opened = await window.api.openChat(id, validation.pkgRoot)
      if (token !== openRequestRef.current) return
      resetChatView()
      const noteEntries: ChatEntry[] = opened.note
        ? [{ id: newEntryId(), ts: Date.now(), role: 'agent-result', level: 'warn', content: opened.note }]
        : []
      setEntries([...replayToEntries(opened.items), ...noteEntries])
      lastCostRef.current = lastTotalCostUsd(opened.items)
      setActiveChatId(id)
      setReadOnlyReason(opened.readOnlyReason)
      await refreshSettings()
    } catch (error) {
      const message = (error as Error).message
      setEntries((prev) => [
        ...prev,
        { id: newEntryId(), ts: Date.now(), role: 'agent-result', level: 'error', content: `Ошибка: ${message}` }
      ])
      pushLog(newLogEvent('error', 'app', message))
    } finally {
      if (token === openRequestRef.current) {
        setIsOpeningChat(false)
      }
    }
  }

  const handleStop = async (): Promise<void> => {
    if (!isRunning || isStopping) {
      return
    }
    setIsStopping(true)
    setPermissionRequests([])
    pushLog(newLogEvent('warn', 'user', 'Остановка агента по запросу пользователя'))
    await window.api.stopAgent()
  }

  const handleSend = async (): Promise<void> => {
    const text = prompt.trim()
    if (!text || !validation?.pkgRoot || isRunning) {
      return
    }
    setPrompt('')
    await sendText(text)
  }

  const resetChatView = (): void => {
    setEntries([])
    lastCostRef.current = undefined
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
    await refreshSettings()
    resetChatView()
    setActiveChatId(null)
    setReadOnlyReason(null)
  }

  const handleNewChat = async (): Promise<void> => {
    if (isRunning) {
      return
    }
    await window.api.newChat()
    resetChatView()
    setActiveChatId(null)
    setReadOnlyReason(null)
    if (validation?.pkgRoot) {
      await loadChats(validation.pkgRoot)
    }
  }

  const handleChangeProject = async (): Promise<void> => {
    if (isRunning) {
      return
    }
    await window.api.newChat()
    resetChatView()
    setActiveChatId(null)
    setReadOnlyReason(null)
    setChats([])
    setBrowserOpen(false)
    await window.api.setCrmBrowserVisible(false)
    await window.api.closeCrmBrowser()
    setSelectedPath(null)
    setValidation(null)
    setScreen('picker')
  }

  const handleOpenLogsFolder = async (): Promise<void> => {
    await window.api.openLogs()
  }

  const handlePickSuggestion = (text: string): void => {
    setPrompt(text)
    setComposerFocusKey((key) => key + 1)
  }

  const handleCloseLogs = useCallback(() => setLogsOpen(false), [])

  const handleToggleSidebar = (): void => {
    const next = !sidebarOpen
    setSidebarOpen(next)
    localStorage.setItem('chatSidebarOpen', next ? '1' : '0')
  }

  // the agent uses the CRM browser: open its panel
  useEffect(() => window.api.onCrmBrowserActivity(() => setBrowserOpen(true)), [])

  // start screen: refresh the recent projects list
  useEffect(() => {
    if (screen === 'picker') {
      void loadRecentProjects()
    }
  }, [screen])

  // the panel is shown only with the CRM browser enabled; otherwise the native view must stay hidden
  const browserPanelShown = browserOpen && Boolean(agentSettings?.crmBrowserEnabled)
  useEffect(() => {
    if (!browserPanelShown) {
      void window.api.setCrmBrowserVisible(false)
    }
  }, [browserPanelShown])

  if (screen === 'picker') {
    return (
      <div className="screen">
        <div className="screen-drag" />
        <div className="screen-body">
          <div className="card card-wide">
            <div className="logo-lg">
              <IconLogo size={24} />
            </div>
            <h1>BPMSoft AI Agent</h1>
            <p>Откройте папку приложения BPMSoft — агент будет работать с пакетами в BPMSoft.Configuration/Pkg.</p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={handleSelectFolder} disabled={isChecking}>
              {isChecking ? <span className="spinner" /> : <IconFolder size={16} />}
              {isChecking ? 'Проверяю проект…' : 'Открыть проект'}
            </button>
            {selectedPath && validation && !validation.isValid && (
              <div className="form-error">
                <IconAlert size={14} />
                <span>{validation.reason}</span>
              </div>
            )}
            {recentProjects.length > 0 && (
              <div className="recent">
                <div className="recent-head">Недавние проекты</div>
                {recentProjects.map((project) => (
                  <div key={project.path} className="recent-row">
                    <button
                      type="button"
                      className="recent-item"
                      disabled={isChecking}
                      onClick={() => openProject(project.path)}
                      title={project.path}
                    >
                      <span className="recent-name">{project.name}</span>
                      <span className="recent-path">{project.location}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon recent-remove"
                      onClick={() => handleRemoveRecent(project.path)}
                      title="Убрать из списка"
                      aria-label="Убрать из списка"
                    >
                      <IconX size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
        appRoot={validation?.appRoot ?? validation?.pkgRoot}
        isRunning={isRunning}
        showDebug={showDebug}
        onToggleDebug={setShowDebug}
        onOpenLogs={() => setLogsOpen(true)}
        onOpenLogsFolder={handleOpenLogsFolder}
        settings={agentSettings}
        onProviderChange={handleProviderChange}
        onSettingsChanged={() => {
          void refreshSettings()
        }}
        browserOpen={browserOpen}
        onToggleBrowser={() => setBrowserOpen((value) => !value)}
        onMenuOpenChange={setMenuOpen}
        onChangeProject={handleChangeProject}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        onNewChat={handleNewChat}
      />
      <div className="workspace">
        {sidebarOpen && (
          <ChatSidebar
            chats={chats}
            activeChatId={activeChatId}
            disabled={isRunning || isOpeningChat}
            onSelect={(id) => {
              void handleSelectChat(id)
            }}
            onNewChat={handleNewChat}
          />
        )}
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
                onChoiceSubmit={
                  readOnlyReason
                    ? undefined
                    : (text) => {
                        void sendText(text)
                      }
                }
              />
            )}
          </div>
          <Composer
            value={prompt}
            onChange={setPrompt}
            onSend={handleSend}
            isRunning={isRunning}
            focusKey={composerFocusKey}
            onStop={handleStop}
            isStopping={isStopping}
            stopOnEscape={!logsOpen && !menuOpen}
            disabledReason={readOnlyReason ?? (isOpeningChat ? 'Открываю чат…' : undefined)}
          />
        </main>
        {browserPanelShown && (
          <BrowserPanel open={browserOpen} overlayOpen={menuOpen || logsOpen} onClose={() => setBrowserOpen(false)} />
        )}
      </div>
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
