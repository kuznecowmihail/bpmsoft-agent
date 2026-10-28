import type { BrowserWindow } from 'electron'
import { runBpmsoftAgentQuery, runCursorAgentQuery, createCrmDbTool, testCrmDbConnection, createCrmTools, testCrmConnection, createPkgLintTool, createCrmRequestTool, lintChanged, changedSchemaNames, hasChangedFiles } from '@bpmsoft-agent/agent-runtime'
import type { AgentEvent, ToolPermissionRequest, CrmDbToolOptions, CrmConnection, StandDbConfig } from '@bpmsoft-agent/agent-runtime'
import { join, resolve } from 'path'
import { saveSecret, loadSecret, clearSecret } from './secureStore'
import { startChatLogIfNeeded, endChatLog, logChatRecord, reopenChatLog, getCurrentChatId } from './chatLog'
import { getAppSettings, getProjectConnection } from './appSettings'
import { createCrmBrowserTools, markCrmBrowserStale } from './crmBrowser'
import { upsertChat, getChat } from './chatIndex'
import { chatTitle } from './chatReplay'
import type { AgentProvider } from '../shared/types'

/** Sends to the window unless it is closed (a turn may outlive its window); false when not sent. */
export function sendToWindow(window: BrowserWindow, channel: string, payload: unknown): boolean {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return false
  }
  window.webContents.send(channel, payload)
  return true
}

/**
 * Cleans a pasted API key: removes whitespace and invisible characters (zero-width
 * spaces, BOM) that often come with copy-paste. Returns undefined when the key
 * still contains characters an HTTP header cannot carry.
 */
export function normalizeApiKey(raw: string): string | undefined {
  const key = raw.replace(/[\s​-‍⁠﻿]/g, '')
  return /^[\x21-\x7E]+$/.test(key) ? key : undefined
}

const ANTHROPIC_API_KEY_SECRET = 'anthropicApiKey'

/**
 * Anthropic API key — cached in memory for fast access, persisted via
 * `secureStore` (OS keychain) so the user doesn't have to re-enter it on
 * every launch. Call `loadStoredApiKey()` once at startup to hydrate the
 * in-memory cache from disk.
 */
let currentApiKey: string | undefined

export function setApiKey(apiKey: string): void {
  const key = normalizeApiKey(apiKey)
  if (!key) {
    throw new Error('Ключ содержит недопустимые символы — скопируйте его заново (без русских букв и пробелов)')
  }
  currentApiKey = key
  saveSecret(ANTHROPIC_API_KEY_SECRET, key)
}

export function hasApiKey(): boolean {
  return Boolean(currentApiKey)
}

export function getClaudeApiKey(): string | undefined {
  return currentApiKey
}

export function loadStoredApiKey(): void {
  const stored = loadSecret(ANTHROPIC_API_KEY_SECRET)
  if (stored) {
    const normalized = normalizeApiKey(stored)
    if (normalized) {
      currentApiKey = normalized
      if (normalized !== stored) {
        saveSecret(ANTHROPIC_API_KEY_SECRET, normalized)
      }
    }
  }
  const cursorStored = loadSecret(CURSOR_API_KEY_SECRET)
  if (cursorStored) {
    const normalized = normalizeApiKey(cursorStored)
    if (normalized) {
      currentCursorApiKey = normalized
      if (normalized !== cursorStored) {
        saveSecret(CURSOR_API_KEY_SECRET, normalized)
      }
    }
  }
}

export function clearApiKey(): void {
  currentApiKey = undefined
  clearSecret(ANTHROPIC_API_KEY_SECRET)
}

const CURSOR_API_KEY_SECRET = 'cursorApiKey'
let currentCursorApiKey: string | undefined

export function setCursorApiKey(apiKey: string): void {
  const key = normalizeApiKey(apiKey)
  if (!key) {
    throw new Error('Ключ содержит недопустимые символы — скопируйте его заново (без русских букв и пробелов)')
  }
  currentCursorApiKey = key
  saveSecret(CURSOR_API_KEY_SECRET, key)
}

export function hasCursorApiKey(): boolean {
  return Boolean(currentCursorApiKey)
}

export function getCursorApiKey(): string | undefined {
  return currentCursorApiKey
}

export function clearCursorApiKey(): void {
  currentCursorApiKey = undefined
  clearSecret(CURSOR_API_KEY_SECRET)
}

/** The opened project (application root, or the Pkg folder without one, resolved): its connection settings and passwords apply. */
let activeProject: string | undefined

export function setActiveProject(appRoot: string | undefined): void {
  activeProject = appRoot ? resolve(appRoot) : undefined
}

export function getActiveProject(): string | undefined {
  return activeProject
}

function requireActiveProject(): string {
  if (!activeProject) {
    throw new Error('Сначала откройте проект')
  }
  return activeProject
}

function dbPasswordSecret(projectKey: string): string {
  return `dbPassword:${projectKey}`
}

function crmPasswordSecret(projectKey: string): string {
  return `crmPassword:${projectKey}`
}

/** Passwords saved before they became per-project: they cannot be attributed to a project, so they are removed. */
const LEGACY_SECRETS = ['dbPassword', 'crmPassword']

export function dropLegacyConnectionSecrets(): void {
  for (const name of LEGACY_SECRETS) {
    try {
      clearSecret(name)
    } catch {
      // the entry may be missing or the keychain unavailable; nothing to clean up
    }
  }
}

/** Password of a separate read-only DB user (optional) of the opened project, kept in the OS keychain. */
export function setDbPassword(password: string): void {
  if (!password) {
    throw new Error('Пароль пустой')
  }
  saveSecret(dbPasswordSecret(requireActiveProject()), password)
}

export function hasDbPassword(): boolean {
  return activeProject ? Boolean(loadSecret(dbPasswordSecret(activeProject))) : false
}

export function clearDbPassword(): void {
  clearSecret(dbPasswordSecret(requireActiveProject()))
}

/**
 * Connection options of the read-only CRM database tool: ConnectionStrings.config of the opened
 * application folder, overridden by this project's host/port/user from settings and this project's
 * password from the keychain. The agent never sees these values — the tool reads them itself.
 */
export function dbConnectionOptions(readRoot: string): CrmDbToolOptions {
  const { dbHost, dbPort, dbUser } = getProjectConnection(activeProject)
  return {
    connectionStringsPath: join(readRoot, 'ConnectionStrings.config'),
    override: {
      host: dbHost || undefined,
      port: dbPort ? Number(dbPort) : undefined,
      user: dbUser || undefined,
      password: activeProject ? loadSecret(dbPasswordSecret(activeProject)) : undefined
    }
  }
}

/** Database access written into the stand for the MCP server: undefined when database access is off. */
export function dbExportOptions(): StandDbConfig | undefined {
  if (!activeProject || !getAppSettings().dbAccessEnabled) {
    return undefined
  }
  const { dbHost, dbPort, dbUser } = getProjectConnection(activeProject)
  const password = loadSecret(dbPasswordSecret(activeProject))
  return {
    ...(dbHost ? { host: dbHost } : {}),
    ...(dbPort ? { port: Number(dbPort) } : {}),
    ...(dbUser ? { user: dbUser } : {}),
    ...(password ? { password } : {})
  }
}

export async function testDbConnection(readRoot: string): Promise<string> {
  if (!readRoot) {
    throw new Error('Сначала откройте проект')
  }
  return testCrmDbConnection(dbConnectionOptions(readRoot))
}

/** Password of the CRM user the agent acts as in the opened project (stand actions), kept in the OS keychain. */
export function setCrmPassword(password: string): void {
  if (!password) {
    throw new Error('Пароль пустой')
  }
  saveSecret(crmPasswordSecret(requireActiveProject()), password)
}

export function hasCrmPassword(): boolean {
  return activeProject ? Boolean(loadSecret(crmPasswordSecret(activeProject))) : false
}

export function clearCrmPassword(): void {
  clearSecret(crmPasswordSecret(requireActiveProject()))
}

/** CRM connection of the opened project (address, user) and its keychain password; undefined until all three are set. */
export function crmConnection(): CrmConnection | undefined {
  if (!activeProject) {
    return undefined
  }
  const { crmUrl, crmUser } = getProjectConnection(activeProject)
  const password = loadSecret(crmPasswordSecret(activeProject))
  if (!crmUrl || !crmUser || !password) {
    return undefined
  }
  return { url: crmUrl, user: crmUser, password }
}

export async function testCrm(): Promise<string> {
  const connection = crmConnection()
  if (!connection) {
    throw new Error('Укажите адрес CRM, пользователя и пароль')
  }
  return testCrmConnection(connection)
}

/**
 * Conversation continuity: the SDK session id of the current chat and the
 * project AND provider it belongs to. Every turn resumes this session so the
 * agent keeps the context of earlier messages (its own clarifying questions and
 * the user's answers). Reset by "Новый чат" or when the project changes.
 */
let currentSessionId: string | undefined
let currentSessionProject: string | undefined
let currentSessionProvider: AgentProvider | undefined
/** Start of the current chat: files in Pkg changed after it count as the agent's own. */
let currentChatStartedAt: number | undefined
/** The turn that is running now; its controller is aborted by the "Стоп" button. */
let currentRun: AbortController | undefined
/** The previous turn was stopped by the user: the next message carries a note about it. */
let lastTurnStopped = false
/** How long a stopped turn may still deliver events before the app stops waiting for it. */
const STOP_GRACE_MS = 10000
const STOPPED_TURN_NOTE = '(Предыдущий ход остановлен пользователем кнопкой «Стоп». Не продолжай прерванную работу сам: выполни сообщение ниже; если оно не о прерванной задаче — не возвращайся к ней.)'
/** The previous turn was cut off by an app restart: the next message carries a note about it. */
let lastTurnInterrupted = false
const INTERRUPTED_TURN_NOTE = '(Предыдущий ход прервался: приложение перезапустилось во время работы агента. Прежде чем продолжать, проверь, что из прерванной работы уже сделано, затем выполни сообщение ниже.)'
export const CONTEXT_LOST_MESSAGE = 'Контекст чата не восстановлен: провайдер начал новую сессию. Начните новый чат.'

export function getCurrentSessionId(): string | undefined {
  return currentSessionId
}

/** True while a turn of the agent is running. */
export function isAgentRunning(): boolean {
  return currentRun !== undefined
}

export function resetAgentSession(): void {
  stopAgent()
  currentSessionId = undefined
  currentSessionProject = undefined
  currentSessionProvider = undefined
  currentChatStartedAt = undefined
  lastTurnStopped = false
  lastTurnInterrupted = false
  endChatLog()
}

/** A chat read back from its log: the session to resume and the flags of its last turn. */
export interface RestoredSession {
  sessionId: string
  projectPath: string
  provider: AgentProvider
  chatStartedAt: number
  lastTurnStopped: boolean
  lastTurnInterrupted: boolean
  jsonlPath: string
}

/** Makes a chat from history the current one: the next message resumes its session and appends to its log. */
export function restoreAgentSession(s: RestoredSession): void {
  resetAgentSession()
  currentSessionId = s.sessionId
  currentSessionProject = s.projectPath
  currentSessionProvider = s.provider
  currentChatStartedAt = s.chatStartedAt
  lastTurnStopped = s.lastTurnStopped
  lastTurnInterrupted = s.lastTurnInterrupted
  reopenChatLog(s.jsonlPath, s.projectPath)
}

/** True when the provider answered a resume with a different session: the old context is gone. */
export function isContextLost(resumedFrom: string | undefined, event: AgentEvent): boolean {
  return resumedFrom !== undefined && event.type === 'system_init' && Boolean(event.sessionId) && event.sessionId !== resumedFrom
}

/** True when the provider reports that the session to resume does not exist (the old context cannot be restored). */
export function isSessionNotFoundError(message: string): boolean {
  return /no conversation found|session.*not found|agent.*not found/i.test(message)
}

/**
 * Remembers the session id carried by a `system_init` / `result` event.
 */
export function rememberSessionId(event: AgentEvent, projectPath: string, provider: AgentProvider = 'claude'): void {
  if ((event.type === 'system_init' || event.type === 'result') && event.sessionId) {
    const changed = event.sessionId !== currentSessionId
    currentSessionId = event.sessionId
    currentSessionProject = projectPath
    currentSessionProvider = provider
    const chatId = changed ? getCurrentChatId() : undefined
    if (chatId) {
      upsertChat({ id: chatId, sessionId: event.sessionId })
    }
  }
}

const pendingPermissionRequests = new Map<string, (approved: boolean) => void>()
let nextPermissionRequestId = 0

/**
 * Registers a new pending tool-permission request and returns its id and a
 * promise that resolves once `resolvePermissionRequest` is called with that
 * id — decoupled from IPC/Electron so it's unit-testable on its own.
 */
export function createPendingPermissionRequest(): { id: string; wait: Promise<boolean> } {
  const id = String(nextPermissionRequestId++)
  const wait = new Promise<boolean>((resolve) => {
    pendingPermissionRequests.set(id, resolve)
  })
  return { id, wait }
}

export function resolvePermissionRequest(id: string, approved: boolean): void {
  const resolve = pendingPermissionRequests.get(id)
  if (!resolve) {
    return
  }
  pendingPermissionRequests.delete(id)
  resolve(approved)
}

/** Declines every pending permission request (used when the turn is stopped). */
export function rejectAllPendingPermissions(): void {
  for (const resolve of pendingPermissionRequests.values()) {
    resolve(false)
  }
  pendingPermissionRequests.clear()
}

/**
 * Stops the running turn: aborts its SDK query and tools and declines pending
 * permission requests. Returns false when no turn is running.
 */
export function stopAgent(): boolean {
  if (!currentRun) {
    return false
  }
  logChatRecord('stop_request', {})
  currentRun.abort()
  rejectAllPendingPermissions()
  return true
}

/**
 * Runs one turn of the agent (Claude or Cursor, per app settings) and streams
 * every mapped event to the given window as it arrives, via the `agent:event`
 * IPC channel — not as one final batched response. For Claude, tool calls that
 * would otherwise prompt for permission (file writes, Bash, etc.) are instead
 * surfaced to the renderer via `agent:permissionRequest` and wait for the
 * user's answer; Cursor runs without per-action approvals (its sandbox limits
 * writes to Pkg). `additionalDirectories` (e.g. BPMSoft's
 * Resources/Autogenerated/conf siblings) lets the agent research
 * BPMSoft's own implementation, not just edit files under the `projectPath`
 * (Pkg) working directory. `readRoot` — the opened application folder: the
 * agent may read only there (and its knowledge directory) and write only under
 * `projectPath` (Pkg). Every turn is also written to the chat log (chatLog.ts).
 * The turn can be stopped by `stopAgent()` (the "Стоп" button): the query is
 * aborted, and a stopped turn ends with a `result` event marked `stopped`.
 */
export async function sendAgentMessage(
  window: BrowserWindow,
  prompt: string,
  projectPath: string,
  additionalDirectories?: string[],
  readRoot?: string
): Promise<void> {
  if (currentRun) {
    throw new Error('Агент уже работает — дождитесь окончания или остановите его')
  }
  const { provider, cursorModel, cursorModelParams, cursorModelName, claudeModel, claudeEffort, claudeModelName, dbAccessEnabled, dbConfirmQueries, crmActionsEnabled, crmConfirmActions, crmBrowserEnabled } = getAppSettings()
  if (provider === 'cursor' && !currentCursorApiKey) {
    throw new Error('Ключ Cursor не задан — укажите его в настройках')
  }
  if (provider === 'claude' && !currentApiKey) {
    throw new Error('API-ключ Anthropic не задан — укажите его в настройках')
  }

  if (
    (currentSessionProject && currentSessionProject !== projectPath) ||
    (currentSessionProvider && currentSessionProvider !== provider)
  ) {
    resetAgentSession()
  }

  const controller = new AbortController()
  currentRun = controller
  try {
    if (currentChatStartedAt === undefined) {
      currentChatStartedAt = Date.now()
    }
    const chatSince = (): number => currentChatStartedAt ?? Date.now()

    const requestToolPermission = (request: ToolPermissionRequest): Promise<boolean> => {
      const { id, wait } = createPendingPermissionRequest()
      logChatRecord('permission_request', { id, toolName: request.toolName, input: request.input })
      if (!sendToWindow(window, 'agent:permissionRequest', { id, toolName: request.toolName, input: request.input })) {
        resolvePermissionRequest(id, false)
      }
      return wait.then((approved) => {
        logChatRecord('permission_response', { id, approved })
        return approved
      })
    }

    const dbTool =
      dbAccessEnabled && readRoot
        ? createCrmDbTool({
            ...dbConnectionOptions(readRoot),
            signal: controller.signal,
            confirm: dbConfirmQueries ? (sql) => requestToolPermission({ toolName: 'crm_db_query', input: { sql } }) : undefined,
            onQuery: (record) => logChatRecord('db_query', { ...record })
          })
        : undefined

    const crmConn = crmActionsEnabled || crmBrowserEnabled ? crmConnection() : undefined
    const crmTools = crmActionsEnabled && crmConn
      ? createCrmTools({
          connection: crmConn,
          appRoot: readRoot,
          signal: controller.signal,
          ownSchemas: () => changedSchemaNames(projectPath, chatSince()),
          lint: () => lintChanged(projectPath, chatSince()),
          changedSince: (ms) => hasChangedFiles(projectPath, ms),
          chatStartedAt: chatSince,
          confirm: crmConfirmActions ? (action) => requestToolPermission({ toolName: 'crm_action', input: { action } }) : undefined,
          onAction: (record) => {
            logChatRecord('crm_action', { ...record })
            if ((record.action === 'update' && record.success) || record.stopped) {
              markCrmBrowserStale()
            }
          }
        })
      : undefined
    const browserTools = crmBrowserEnabled && crmConn
      ? createCrmBrowserTools({
          connection: crmConn,
          confirm: (action) => requestToolPermission({ toolName: 'crm_browser_click', input: { action } }),
          onAction: (record) => logChatRecord('crm_browser', { ...record })
        })
      : undefined
    const requestTool = crmActionsEnabled && crmConn
      ? createCrmRequestTool({
          connection: crmConn,
          signal: controller.signal,
          confirm: (action) => requestToolPermission({ toolName: 'crm_action', input: { action } }),
          onRequest: (record) => logChatRecord('crm_request', { ...record })
        })
      : undefined
    const appTools = [...(browserTools ?? []), ...(requestTool ? [requestTool] : []), createPkgLintTool({ pkgRoot: projectPath, since: chatSince })]

    startChatLogIfNeeded({ projectPath, readRoot })
    // After a stopped or interrupted turn the agent gets a note, so it does not resume the interrupted work by itself.
    const afterStop = lastTurnStopped
    const afterInterrupt = lastTurnInterrupted
    const note = lastTurnInterrupted ? INTERRUPTED_TURN_NOTE : lastTurnStopped ? STOPPED_TURN_NOTE : undefined
    const agentPrompt = note ? `${note}\n\n${prompt}` : prompt
    lastTurnStopped = false
    lastTurnInterrupted = false
    const modelRef = provider === 'cursor' ? { id: cursorModel, params: cursorModelParams } : { id: claudeModel || null, effort: claudeEffort || null }
    logChatRecord('user_message', { text: prompt, afterStop, afterInterrupt, resume: currentSessionId ?? null, provider, model: modelRef, dbAccess: Boolean(dbTool), crmActions: Boolean(crmTools), crmBrowser: Boolean(browserTools) })

    const resumedFrom = currentSessionId
    const chatId = getCurrentChatId()
    if (chatId) {
      const existing = getChat(chatId)
      const now = new Date().toISOString()
      upsertChat({
        id: chatId,
        projectPath,
        provider,
        model: modelRef,
        modelName: provider === 'cursor' ? cursorModelName : claudeModelName,
        updatedAt: now,
        lastTurnInterrupted: true,
        ...(existing ? {} : { title: chatTitle(prompt), createdAt: now, contextLost: false })
      })
    }

    const startedAt = Date.now()
    const events =
      provider === 'cursor'
        ? runCursorAgentQuery({
            apiKey: currentCursorApiKey as string,
            prompt: agentPrompt,
            cwd: projectPath,
            model: cursorModel,
            modelParams: cursorModelParams,
            resume: currentSessionId,
            readRoot: readRoot ?? projectPath,
            requestToolPermission,
            dbTool,
            crmTools,
            appTools,
            signal: controller.signal
          })
        : runBpmsoftAgentQuery({
            apiKey: currentApiKey as string,
            prompt: agentPrompt,
            cwd: projectPath,
            model: claudeModel || undefined,
            effort: claudeEffort || undefined,
            resume: currentSessionId,
            requestToolPermission,
            additionalDirectories,
            sandbox: { readRoots: [readRoot ?? projectPath], writeRoots: [projectPath] },
            dbTool,
            crmTools,
            appTools,
            signal: controller.signal
          })

    // After a stop the app stops waiting for the SDK after STOP_GRACE_MS, so the
    // chat is never blocked by a query that does not finish; late events are dropped.
    let detached = false
    let resultSent = false
    const send = (event: AgentEvent): void => {
      if (detached) return
      if (event.type === 'result') resultSent = true
      sendToWindow(window, 'agent:event', event)
    }
    let contextLost = false
    const consume = (async (): Promise<void> => {
      for await (const event of events) {
        // late events of a detached or superseded turn are dropped; the iterator is still drained so the SDK can finish
        if (detached || currentRun !== controller) continue
        if (isContextLost(resumedFrom, event)) {
          // The provider started a new session instead of resuming: the event is not shown or remembered.
          contextLost = true
          logChatRecord('context_lost', { resumedFrom, sessionId: (event as { sessionId?: string }).sessionId })
          if (chatId) {
            upsertChat({ id: chatId, contextLost: true })
          }
          controller.abort()
          break
        }
        rememberSessionId(event, projectPath, provider)
        logChatRecord('agent_event', { event })
        send(event)
      }
    })()
    let graceTimer: NodeJS.Timeout | undefined
    const graceOver = new Promise<'timeout'>((resolve) => {
      const onAbort = (): void => {
        graceTimer = setTimeout(() => resolve('timeout'), STOP_GRACE_MS)
      }
      if (controller.signal.aborted) onAbort()
      else controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      const outcome = await Promise.race([consume.then(() => 'done' as const), graceOver])
      if (outcome === 'timeout') {
        logChatRecord('stop_timeout', { graceMs: STOP_GRACE_MS })
        consume.catch(() => undefined)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = (error as Error).message
        if (resumedFrom && isSessionNotFoundError(message)) {
          // the provider has no such session any more: the chat continues only as a read-only log
          contextLost = true
          logChatRecord('context_lost', { resumedFrom, error: message })
          if (chatId) {
            upsertChat({ id: chatId, contextLost: true })
          }
        } else {
          logChatRecord('error', { message, stack: (error as Error).stack })
          throw error
        }
      }
    } finally {
      if (graceTimer) clearTimeout(graceTimer)
      if (controller.signal.aborted) {
        if (!contextLost) {
          lastTurnStopped = true
          if (!resultSent) {
            send({ type: 'result', success: false, stopped: true, durationMs: Date.now() - startedAt, sessionId: currentSessionId })
          }
        }
        detached = true
      }
      logChatRecord('turn_end', { elapsedMs: Date.now() - startedAt, sessionId: currentSessionId ?? null, stopped: controller.signal.aborted && !contextLost })
      if (chatId && !contextLost) {
        upsertChat({ id: chatId, updatedAt: new Date().toISOString(), lastTurnInterrupted: false, lastTurnStopped: controller.signal.aborted })
      }
    }
    if (contextLost) {
      // The turn is over: clear it first so the reset does not log a stop request.
      currentRun = undefined
      resetAgentSession()
      throw new Error(CONTEXT_LOST_MESSAGE)
    }
  } finally {
    if (currentRun === controller) {
      currentRun = undefined
    }
  }
}
