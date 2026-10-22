import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { basename, dirname, join, resolve } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { validateBpmsoftProject } from './projectValidation'
import { trustSystemCertificates } from './systemCertificates'
import { collectDeviceInfo } from './systemInfo'
import { evaluateEnvironment } from './environmentCheck'
import { checkFileDesignMode } from './fileDesignMode'
import {
  setApiKey,
  sendAgentMessage,
  loadStoredApiKey,
  hasApiKey,
  clearApiKey,
  resetAgentSession,
  stopAgent,
  resolvePermissionRequest,
  setCursorApiKey,
  hasCursorApiKey,
  clearCursorApiKey,
  getCursorApiKey,
  getClaudeApiKey,
  setDbPassword,
  hasDbPassword,
  clearDbPassword,
  testDbConnection,
  setCrmPassword,
  hasCrmPassword,
  clearCrmPassword,
  testCrm,
  crmConnection,
  setActiveProject,
  getActiveProject,
  dropLegacyConnectionSecrets,
  isAgentRunning
} from './agentSession'
import { initChatLog, getChatLogDir } from './chatLog'
import { initChatIndex, listChats } from './chatIndex'
import { openChatFromHistory } from './chatOpen'
import {
  attachCrmBrowserHost,
  closeCrmBrowser,
  openCrmBrowserHome,
  reloadCrmBrowser,
  setCrmBrowserBounds,
  setCrmBrowserVisible
} from './crmBrowser'
import { initAppSettings, getAppSettings, updateAppSettings, addRecentProject, removeRecentProject, getProjectConnection, updateProjectConnection } from './appSettings'
import type { ProjectConnection, StoredSettings } from './appSettings'
import { loadLoginShellPath } from './shellPath'
import { isExternalWebUrl } from './urlPolicy'
import { listCursorModels, listClaudeModels, claudeSkillsStatus, installClaudeSkills, defaultExportSources } from '@bpmsoft-agent/agent-runtime'
import type { ClaudeMdChoice } from '@bpmsoft-agent/agent-runtime'
import type { AgentProvider, CursorModelParam, ClaudeEffort, DbSettingsPatch, CrmSettingsPatch, RecentProject, ProjectValidationResult, DeviceInfo, EnvironmentReport, FileDesignModeCheck } from '../shared/types'

if (app.isPackaged) loadLoginShellPath()

// Cursor SDK looks for its platform binaries (sandbox, ripgrep, tree-sitter) in node_modules
// above process.argv[1]; a packaged app has no script argument, so point it at this bundle.
if (app.isPackaged) process.argv.splice(1, 0, __filename)

// Packaged builds take the icon from the bundle (icns/ico made by electron-builder from build/icon.png);
// in dev the Dock and the window would show the default Electron icon.
const DEV_ICON_PATH = join(__dirname, '../../build/icon.png')

/** The project opened by the user, validated in main: IPC calls may only name its folders. */
let openedProject: ProjectValidationResult | undefined

/** Facts about the computer, collected once per app run (or again on a forced recheck). */
let deviceInfo: DeviceInfo | undefined

function samePath(value: unknown, expected: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '' && expected !== undefined && resolve(value) === resolve(expected)
}

const NOT_OPENED = 'Папка не совпадает с открытым проектом — откройте проект заново'

/** The Pkg folder of the opened project when `value` names it. */
function requireOpenedPkgRoot(value: unknown): string {
  if (!openedProject?.pkgRoot || !samePath(value, openedProject.pkgRoot)) {
    throw new Error(NOT_OPENED)
  }
  return openedProject.pkgRoot
}

/** The application root of the opened project when `value` names it. */
function requireOpenedAppRoot(value: unknown): string {
  if (!openedProject?.appRoot || !samePath(value, openedProject.appRoot)) {
    throw new Error(NOT_OPENED)
  }
  return openedProject.appRoot
}

/** The opened project's key for connection settings; the connection settings are per opened project. */
function requireOpenedProject(): string {
  const project = getActiveProject()
  if (!project) {
    throw new Error('Сначала откройте проект')
  }
  return project
}

function resolveChatLogDir(): string {
  const override = process.env['BPMSOFT_AGENT_LOG_DIR']
  if (override) {
    return override
  }
  if (process.platform === 'darwin') {
    return join(app.getPath('home'), 'Library', 'Logs', 'bpmsoft-agent')
  }
  return join(app.getPath('userData'), 'logs')
}

/** Writes the environment report to environment.json in the log folder; best effort. */
function writeEnvironmentFile(report: EnvironmentReport): void {
  try {
    const dir = getChatLogDir()
    if (!dir) return
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'environment.json'), JSON.stringify({ collectedAt: new Date().toISOString(), ...report }, null, 2))
  } catch {
    // The log file is only a record; a failed write must not affect the app.
  }
}

/** Environment report for the computer; device facts are collected again only when `force` is set or nothing is collected yet. */
async function getEnvironmentReport(force: boolean): Promise<EnvironmentReport> {
  let info = deviceInfo
  const collecting = force || !info
  if (collecting) {
    info = await collectDeviceInfo()
    deviceInfo = info
  }
  const report = evaluateEnvironment(info!, getAppSettings().provider)
  if (collecting) {
    writeEnvironmentFile(report)
  }
  return report
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#fafafa',
    ...(is.dev && process.platform !== 'darwin' ? { icon: DEV_ICON_PATH } : {}),
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 20 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  attachCrmBrowserHost(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    stopAgent()
    closeCrmBrowser()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isExternalWebUrl(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // The window shows only the app's own page: dropped files, links and redirects cannot replace it.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (is.dev && process.platform === 'darwin') {
    app.dock?.setIcon(DEV_ICON_PATH)
  }

  // corporate proxies/VPNs — Cursor SDK requests go through Node's TLS
  trustSystemCertificates()

  electronApp.setAppUserModelId('com.bpmsoft-agent.desktop')

  // Initialize app settings (provider, cursor model) from userData/settings.json.
  initAppSettings(join(app.getPath('userData'), 'settings.json'))

  // Milestone 9, slice 4: hydrate a previously saved Anthropic API key (if
  // any) from the OS keychain before the renderer asks about it.
  loadStoredApiKey()
  dropLegacyConnectionSecrets()

  // Chat logs: one JSONL trace + Markdown transcript per chat, plus knowledge-notes.md inbox.
  initChatLog(resolveChatLogDir())
  initChatIndex(resolveChatLogDir())

  // Environment report is collected and logged at startup.
  void getEnvironmentReport(false)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // No <webview> tags anywhere in the app.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (attachEvent) => attachEvent.preventDefault())
  })

  // Milestone 9, slice 2: project picker + validation.
  ipcMain.handle('project:selectFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('project:validate', async (_event, projectPath: string) => {
    const result = await validateBpmsoftProject(projectPath)
    if (result.isValid) {
      const env = await getEnvironmentReport(false)
      if (!env.canOpenProject) {
        addRecentProject(projectPath)
        const missing = env.checks
          .filter((check) => check.blocking && check.status !== 'ok')
          .map((check) => check.title)
          .join(', ')
        return {
          ...result,
          isValid: false,
          environmentBlocked: true,
          reason: 'Компьютер не готов к работе агента: ' + missing + '. Подробности — в блоке «Об устройстве».'
        }
      }

      const fdm: FileDesignModeCheck = result.appRoot
        ? checkFileDesignMode(result.appRoot)
        : { status: 'notFound', problems: ['Не найдена папка приложения с BPMSoft.Configuration'] }
      if (fdm.status !== 'ok') {
        addRecentProject(projectPath)
        return {
          ...result,
          isValid: false,
          fileDesignMode: fdm,
          reason: fdm.status === 'notFound' ? 'Не найден файл конфигурации стенда' : 'Не включён режим разработки в файловой системе'
        }
      }

      addRecentProject(projectPath)
      setActiveProject(result.appRoot ?? result.pkgRoot)
      openedProject = result
    }
    return result
  })

  // Environment check: the report for the «Об устройстве» block, and a forced recheck.
  ipcMain.handle('env:report', () => getEnvironmentReport(false))
  ipcMain.handle('env:recheck', () => getEnvironmentReport(true))

  ipcMain.handle('project:recent', (): RecentProject[] => {
    const home = homedir()
    return getAppSettings()
      .recentProjects.filter((projectPath) => existsSync(projectPath))
      .map((projectPath) => {
        const parent = dirname(projectPath)
        return { path: projectPath, name: basename(projectPath), location: parent.startsWith(home) ? `~${parent.slice(home.length)}` : parent }
      })
  })

  ipcMain.handle('project:removeRecent', (_event, projectPath: string) => {
    if (typeof projectPath === 'string') removeRecentProject(projectPath)
  })

  // Milestone 9, slice 3: chat screen wired to agent-runtime's runBpmsoftAgentQuery.
  ipcMain.handle('agent:setApiKey', (_event, apiKey: string) => {
    setApiKey(apiKey)
  })

  ipcMain.handle(
    'agent:sendMessage',
    async (event, payload: { prompt: string; projectPath: string; additionalDirectories?: string[]; readRoot?: string }) => {
      if (typeof payload?.prompt !== 'string') {
        throw new Error('Пустое сообщение')
      }
      const pkgRoot = requireOpenedPkgRoot(payload.projectPath)
      const readRoot = openedProject!.appRoot ?? pkgRoot
      if (payload.readRoot !== undefined && !samePath(payload.readRoot, readRoot)) {
        throw new Error(NOT_OPENED)
      }
      // Additional directories come from main, not from the payload.
      const additionalDirectories = [openedProject!.appRoot, openedProject!.resourcesRoot, openedProject!.autogeneratedRoot, openedProject!.confContent].filter(
        (dir): dir is string => Boolean(dir)
      )
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        throw new Error('Не удалось определить окно для отправки событий агента')
      }
      await sendAgentMessage(window, payload.prompt, pkgRoot, additionalDirectories, readRoot)
    }
  )

  // Milestone 9, slice 4: real safeStorage-backed persistence for the API key.
  ipcMain.handle('agent:hasApiKey', () => hasApiKey())

  ipcMain.handle('agent:clearApiKey', () => {
    clearApiKey()
  })

  ipcMain.handle('agent:newChat', () => {
    resetAgentSession()
  })

  ipcMain.handle('agent:stop', () => {
    stopAgent()
  })

  // Milestone 9, slice 5: tool-permission approval loop (canUseTool).
  ipcMain.handle('agent:permissionResponse', (_event, payload: { id: string; approved: boolean }) => {
    resolvePermissionRequest(payload.id, payload.approved)
  })

  ipcMain.handle('settings:get', () => {
    const { projectConnections: _projectConnections, ...app } = getAppSettings()
    return {
      ...app,
      ...getProjectConnection(getActiveProject()),
      hasClaudeKey: hasApiKey(),
      hasCursorKey: hasCursorApiKey(),
      hasDbPassword: hasDbPassword(),
      hasCrmPassword: hasCrmPassword()
    }
  })

  ipcMain.handle('settings:setProvider', (_event, provider: AgentProvider) => {
    if (provider !== 'claude' && provider !== 'cursor') {
      throw new Error(`Неизвестный провайдер: ${String(provider)}`)
    }
    updateAppSettings({ provider })
    resetAgentSession()
  })

  ipcMain.handle('settings:setCursorModel', (_event, model: { id: string; params?: CursorModelParam[]; name?: string }) => {
    updateAppSettings({ cursorModel: model.id, cursorModelParams: model.params ?? [], cursorModelName: model.name ?? '' })
  })

  ipcMain.handle('settings:setClaudeModel', (_event, model: { id: string; effort?: ClaudeEffort; name?: string }) => {
    updateAppSettings({ claudeModel: model.id, claudeEffort: model.effort ?? '', claudeModelName: model.name ?? '' })
  })

  ipcMain.handle('settings:setDb', (_event, patch: DbSettingsPatch) => {
    const toggles: Partial<Pick<StoredSettings, 'dbAccessEnabled' | 'dbConfirmQueries'>> = {}
    if (typeof patch?.dbAccessEnabled === 'boolean') toggles.dbAccessEnabled = patch.dbAccessEnabled
    if (typeof patch?.dbConfirmQueries === 'boolean') toggles.dbConfirmQueries = patch.dbConfirmQueries
    updateAppSettings(toggles)

    const connection: Partial<ProjectConnection> = {}
    if (typeof patch?.dbHost === 'string') connection.dbHost = patch.dbHost
    if (typeof patch?.dbPort === 'string') connection.dbPort = patch.dbPort
    if (typeof patch?.dbUser === 'string') connection.dbUser = patch.dbUser
    if (Object.keys(connection).length > 0) updateProjectConnection(requireOpenedProject(), connection)
  })

  ipcMain.handle('db:setPassword', (_event, password: string) => {
    setDbPassword(password)
  })

  ipcMain.handle('db:clearPassword', () => {
    clearDbPassword()
  })

  ipcMain.handle('db:test', (_event, readRoot: string) => testDbConnection(requireOpenedAppRoot(readRoot)))

  ipcMain.handle('settings:setCrm', (_event, patch: CrmSettingsPatch) => {
    const toggles: Partial<Pick<StoredSettings, 'crmActionsEnabled' | 'crmConfirmActions' | 'crmBrowserEnabled'>> = {}
    if (typeof patch?.crmActionsEnabled === 'boolean') toggles.crmActionsEnabled = patch.crmActionsEnabled
    if (typeof patch?.crmConfirmActions === 'boolean') toggles.crmConfirmActions = patch.crmConfirmActions
    if (typeof patch?.crmBrowserEnabled === 'boolean') toggles.crmBrowserEnabled = patch.crmBrowserEnabled
    updateAppSettings(toggles)

    const connection: Partial<ProjectConnection> = {}
    if (typeof patch?.crmUrl === 'string') connection.crmUrl = patch.crmUrl
    if (typeof patch?.crmUser === 'string') connection.crmUser = patch.crmUser
    if (Object.keys(connection).length > 0) updateProjectConnection(requireOpenedProject(), connection)
  })

  ipcMain.handle('crm:setPassword', (_event, password: string) => {
    setCrmPassword(password)
  })

  ipcMain.handle('crm:clearPassword', () => {
    clearCrmPassword()
  })

  ipcMain.handle('crm:test', () => testCrm())

  // CRM browser panel: bounds of the placeholder in the renderer, visibility, the user's home button, reload.
  ipcMain.handle('crmBrowser:setBounds', (_event, b: { x: number; y: number; width: number; height: number }) => {
    const values = [b?.x, b?.y, b?.width, b?.height]
    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      return
    }
    setCrmBrowserBounds(b)
  })

  ipcMain.handle('crmBrowser:setVisible', (_event, visible: boolean) => {
    setCrmBrowserVisible(visible === true)
  })

  ipcMain.handle('crmBrowser:openHome', async () => {
    const connection = crmConnection()
    if (!connection) {
      throw new Error('Укажите адрес CRM, пользователя и пароль в настройках')
    }
    await openCrmBrowserHome(connection)
  })

  ipcMain.handle('crmBrowser:reload', () => {
    reloadCrmBrowser()
  })

  ipcMain.handle('crmBrowser:close', () => closeCrmBrowser())

  ipcMain.handle('cursor:setApiKey', (_event, apiKey: string) => {
    setCursorApiKey(apiKey)
  })

  ipcMain.handle('cursor:clearApiKey', () => {
    clearCursorApiKey()
  })

  ipcMain.handle('cursor:listModels', async () => {
    const apiKey = getCursorApiKey()
    if (!apiKey) {
      throw new Error('Ключ Cursor не задан')
    }
    return listCursorModels(apiKey)
  })

  ipcMain.handle('claude:listModels', async () => {
    const apiKey = getClaudeApiKey()
    if (!apiKey) {
      throw new Error('API-ключ Anthropic не задан')
    }
    return listClaudeModels(apiKey)
  })

  ipcMain.handle('chat:list', (_event, pkgRoot: string) =>
    samePath(pkgRoot, openedProject?.pkgRoot) ? listChats(openedProject!.pkgRoot as string) : []
  )

  ipcMain.handle('chat:open', (_event, id: string, pkgRoot: string) => {
    if (typeof id !== 'string') {
      throw new Error('Чат не найден')
    }
    return openChatFromHistory(id, requireOpenedPkgRoot(pkgRoot), {
      isRunning: isAgentRunning,
      hasKey: (provider: AgentProvider) => (provider === 'cursor' ? hasCursorApiKey() : hasApiKey()),
      listModelIds: async (provider: AgentProvider) => {
        if (provider === 'cursor') {
          const apiKey = getCursorApiKey()
          if (!apiKey) {
            throw new Error('Ключ Cursor не задан')
          }
          return (await listCursorModels(apiKey)).map((m) => m.id)
        }
        const apiKey = getClaudeApiKey()
        if (!apiKey) {
          throw new Error('API-ключ Anthropic не задан')
        }
        return (await listClaudeModels(apiKey)).map((m) => m.id)
      }
    })
  })

  ipcMain.handle('claudeSkills:status', (_event, appRoot: string) => claudeSkillsStatus(requireOpenedAppRoot(appRoot), defaultExportSources()))

  ipcMain.handle('claudeSkills:install', (_event, appRoot: string, options?: { claudeMd?: ClaudeMdChoice; overwriteModified?: boolean }) =>
    installClaudeSkills(requireOpenedAppRoot(appRoot), defaultExportSources(), {
      claudeMd: options?.claudeMd === 'separate' || options?.claudeMd === 'replace' ? options.claudeMd : undefined,
      overwriteModified: options?.overwriteModified === true,
      appVersion: app.getVersion(),
      crm: crmConnection()
    })
  )

  ipcMain.handle('logs:open', async () => {
    const dir = getChatLogDir()
    if (!dir) return
    mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
