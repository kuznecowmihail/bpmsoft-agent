import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { validateBpmsoftProject } from './projectValidation'
import { trustSystemCertificates } from './systemCertificates'
import {
  setApiKey,
  sendAgentMessage,
  loadStoredApiKey,
  hasApiKey,
  clearApiKey,
  resetAgentSession,
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
  testCrm
} from './agentSession'
import { initChatLog, getChatLogDir } from './chatLog'
import { initAppSettings, getAppSettings, updateAppSettings } from './appSettings'
import { listCursorModels, listClaudeModels } from '@bpmsoft-agent/agent-runtime'
import type { AgentProvider, CursorModelParam, ClaudeEffort, DbSettingsPatch, CrmSettingsPatch } from '../shared/types'

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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#fafafa',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 20 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // corporate proxies/VPNs — Cursor SDK requests go through Node's TLS
  trustSystemCertificates()

  electronApp.setAppUserModelId('com.bpmsoft-agent.desktop')

  // Initialize app settings (provider, cursor model) from userData/settings.json.
  initAppSettings(join(app.getPath('userData'), 'settings.json'))

  // Milestone 9, slice 4: hydrate a previously saved Anthropic API key (if
  // any) from the OS keychain before the renderer asks about it.
  loadStoredApiKey()

  // Chat logs: one JSONL trace + Markdown transcript per chat, plus knowledge-notes.md inbox.
  initChatLog(resolveChatLogDir())

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Milestone 9, slice 2: project picker + validation.
  ipcMain.handle('project:selectFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('project:validate', (_event, projectPath: string) => validateBpmsoftProject(projectPath))

  // Milestone 9, slice 3: chat screen wired to agent-runtime's runBpmsoftAgentQuery.
  ipcMain.handle('agent:setApiKey', (_event, apiKey: string) => {
    setApiKey(apiKey)
  })

  ipcMain.handle(
    'agent:sendMessage',
    async (event, payload: { prompt: string; projectPath: string; additionalDirectories?: string[]; readRoot?: string }) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        throw new Error('Не удалось определить окно для отправки событий агента')
      }
      await sendAgentMessage(window, payload.prompt, payload.projectPath, payload.additionalDirectories, payload.readRoot)
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

  // Milestone 9, slice 5: tool-permission approval loop (canUseTool).
  ipcMain.handle('agent:permissionResponse', (_event, payload: { id: string; approved: boolean }) => {
    resolvePermissionRequest(payload.id, payload.approved)
  })

  ipcMain.handle('settings:get', () => ({
    ...getAppSettings(),
    hasClaudeKey: hasApiKey(),
    hasCursorKey: hasCursorApiKey(),
    hasDbPassword: hasDbPassword(),
    hasCrmPassword: hasCrmPassword()
  }))

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
    const next: DbSettingsPatch = {}
    if (typeof patch?.dbAccessEnabled === 'boolean') next.dbAccessEnabled = patch.dbAccessEnabled
    if (typeof patch?.dbConfirmQueries === 'boolean') next.dbConfirmQueries = patch.dbConfirmQueries
    if (typeof patch?.dbHost === 'string') next.dbHost = patch.dbHost
    if (typeof patch?.dbPort === 'string') next.dbPort = patch.dbPort
    if (typeof patch?.dbUser === 'string') next.dbUser = patch.dbUser
    updateAppSettings(next)
  })

  ipcMain.handle('db:setPassword', (_event, password: string) => {
    setDbPassword(password)
  })

  ipcMain.handle('db:clearPassword', () => {
    clearDbPassword()
  })

  ipcMain.handle('db:test', (_event, readRoot: string) => testDbConnection(readRoot))

  ipcMain.handle('settings:setCrm', (_event, patch: CrmSettingsPatch) => {
    const next: CrmSettingsPatch = {}
    if (typeof patch?.crmActionsEnabled === 'boolean') next.crmActionsEnabled = patch.crmActionsEnabled
    if (typeof patch?.crmConfirmActions === 'boolean') next.crmConfirmActions = patch.crmConfirmActions
    if (typeof patch?.crmUrl === 'string') next.crmUrl = patch.crmUrl
    if (typeof patch?.crmUser === 'string') next.crmUser = patch.crmUser
    updateAppSettings(next)
  })

  ipcMain.handle('crm:setPassword', (_event, password: string) => {
    setCrmPassword(password)
  })

  ipcMain.handle('crm:clearPassword', () => {
    clearCrmPassword()
  })

  ipcMain.handle('crm:test', () => testCrm())

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
