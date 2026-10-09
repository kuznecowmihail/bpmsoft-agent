import type { BrowserWindow } from 'electron'
import { runBpmsoftAgentQuery, runCursorAgentQuery } from '@bpmsoft-agent/agent-runtime'
import type { AgentEvent, ToolPermissionRequest } from '@bpmsoft-agent/agent-runtime'
import { saveSecret, loadSecret, clearSecret } from './secureStore'
import { startChatLogIfNeeded, endChatLog, logChatRecord } from './chatLog'
import { getAppSettings } from './appSettings'
import type { AgentProvider } from '../shared/types'

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

/**
 * Conversation continuity: the SDK session id of the current chat and the
 * project AND provider it belongs to. Every turn resumes this session so the
 * agent keeps the context of earlier messages (its own clarifying questions and
 * the user's answers). Reset by "Новый чат" or when the project changes.
 */
let currentSessionId: string | undefined
let currentSessionProject: string | undefined
let currentSessionProvider: AgentProvider | undefined

export function getCurrentSessionId(): string | undefined {
  return currentSessionId
}

export function resetAgentSession(): void {
  currentSessionId = undefined
  currentSessionProject = undefined
  currentSessionProvider = undefined
  endChatLog()
}

/**
 * Remembers the session id carried by a `system_init` / `result` event.
 */
export function rememberSessionId(event: AgentEvent, projectPath: string, provider: AgentProvider = 'claude'): void {
  if ((event.type === 'system_init' || event.type === 'result') && event.sessionId) {
    currentSessionId = event.sessionId
    currentSessionProject = projectPath
    currentSessionProvider = provider
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

/**
 * Runs one turn of the agent (Claude or Cursor, per app settings) and streams
 * every mapped event to the given window as it arrives, via the `agent:event`
 * IPC channel — not as one final batched response. For Claude, tool calls that
 * would otherwise prompt for permission (file writes, Bash, etc.) are instead
 * surfaced to the renderer via `agent:permissionRequest` and wait for the
 * user's answer; Cursor runs without per-action approvals (its sandbox limits
 * writes to Pkg). `additionalDirectories` (e.g. BPMSoft's
 * Resources/Autogenerated/conf/ResourcesCore siblings) lets the agent research
 * BPMSoft's own implementation, not just edit files under the `projectPath`
 * (Pkg) working directory. `readRoot` — the opened application folder: the
 * agent may read only there (and its knowledge directory) and write only under
 * `projectPath` (Pkg). Every turn is also written to the chat log (chatLog.ts).
 */
export async function sendAgentMessage(
  window: BrowserWindow,
  prompt: string,
  projectPath: string,
  additionalDirectories?: string[],
  readRoot?: string
): Promise<void> {
  const { provider, cursorModel, cursorModelParams, claudeModel, claudeEffort } = getAppSettings()
  if (provider === 'cursor' && !currentCursorApiKey) {
    throw new Error('Ключ Cursor не задан — укажите его в настройках')
  }
  if (provider === 'claude' && !currentApiKey) {
    throw new Error('API-ключ Anthropic не задан — вызовите setApiKey перед отправкой сообщения')
  }

  if (
    (currentSessionProject && currentSessionProject !== projectPath) ||
    (currentSessionProvider && currentSessionProvider !== provider)
  ) {
    resetAgentSession()
  }

  startChatLogIfNeeded({ projectPath, readRoot })
  logChatRecord('user_message', { text: prompt, resume: currentSessionId ?? null, provider, model: provider === 'cursor' ? { id: cursorModel, params: cursorModelParams } : { id: claudeModel || null, effort: claudeEffort || null } })

  const requestToolPermission = (request: ToolPermissionRequest): Promise<boolean> => {
    const { id, wait } = createPendingPermissionRequest()
    logChatRecord('permission_request', { id, toolName: request.toolName, input: request.input })
    window.webContents.send('agent:permissionRequest', { id, toolName: request.toolName, input: request.input })
    return wait.then((approved) => {
      logChatRecord('permission_response', { id, approved })
      return approved
    })
  }

  const startedAt = Date.now()
  const events =
    provider === 'cursor'
      ? runCursorAgentQuery({
          apiKey: currentCursorApiKey as string,
          prompt,
          cwd: projectPath,
          model: cursorModel,
          modelParams: cursorModelParams,
          resume: currentSessionId,
          readRoot: readRoot ?? projectPath
        })
      : runBpmsoftAgentQuery({
          apiKey: currentApiKey as string,
          prompt,
          cwd: projectPath,
          model: claudeModel || undefined,
          effort: claudeEffort || undefined,
          resume: currentSessionId,
          requestToolPermission,
          additionalDirectories,
          sandbox: { readRoots: [readRoot ?? projectPath], writeRoots: [projectPath] }
        })

  try {
    for await (const event of events) {
      rememberSessionId(event, projectPath, provider)
      logChatRecord('agent_event', { event })
      window.webContents.send('agent:event', event)
    }
  } catch (error) {
    logChatRecord('error', { message: (error as Error).message, stack: (error as Error).stack })
    throw error
  } finally {
    logChatRecord('turn_end', { elapsedMs: Date.now() - startedAt, sessionId: currentSessionId ?? null })
  }
}
