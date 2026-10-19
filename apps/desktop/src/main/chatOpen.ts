import { readFileSync } from 'fs'
import type { AgentProvider, ClaudeEffort, OpenedChat } from '../shared/types'
import { updateAppSettings } from './appSettings'
import type { StoredSettings } from './appSettings'
import { getChat, chatLogPath } from './chatIndex'
import type { ChatIndexEntry } from './chatIndex'
import { getChatLogDir } from './chatLog'
import { parseChatLog } from './chatReplay'
import { restoreAgentSession, resetAgentSession } from './agentSession'

export interface ChatOpenContext {
  hasKey: (p: AgentProvider) => boolean
  availableModelIds?: string[]
}

export interface ChatOpenPlan {
  readOnlyReason: string | null
  settingsPatch: Partial<StoredSettings> | null
  note: string | null
}

export interface ChatOpenDeps {
  isRunning: () => boolean
  hasKey: (p: AgentProvider) => boolean
  listModelIds: (p: AgentProvider) => Promise<string[]>
}

const MODEL_GONE_NOTE = 'Модели этого чата больше нет — продолжаю на текущей модели провайдера.'

function readOnly(reason: string): ChatOpenPlan {
  return { readOnlyReason: reason, settingsPatch: null, note: null }
}

/** Decides whether a chat from history can be continued and which provider/model settings it needs. */
export function planChatOpen(chat: ChatIndexEntry, ctx: ChatOpenContext): ChatOpenPlan {
  if (chat.contextLost) {
    return readOnly('Контекст этого чата потерян — продолжить его нельзя. Начните новый чат.')
  }
  if (!chat.sessionId) {
    return readOnly('Ход оборвался до начала сессии агента — продолжить чат нельзя. Начните новый чат.')
  }
  if (!ctx.hasKey(chat.provider)) {
    const name = chat.provider === 'cursor' ? 'Cursor' : 'Claude'
    return readOnly(`Не задан ключ ${name} — продолжить чат нельзя. Укажите ключ в настройках или начните новый чат.`)
  }
  const model = chat.model
  if (!model) {
    return { readOnlyReason: null, settingsPatch: { provider: chat.provider }, note: null }
  }
  const modelId = model.id
  if (ctx.availableModelIds && typeof modelId === 'string' && modelId.length > 0 && !ctx.availableModelIds.includes(modelId)) {
    return { readOnlyReason: null, settingsPatch: { provider: chat.provider }, note: MODEL_GONE_NOTE }
  }
  if (chat.provider === 'cursor') {
    return {
      readOnlyReason: null,
      settingsPatch: {
        provider: 'cursor',
        cursorModel: modelId ?? '',
        cursorModelParams: model.params ?? [],
        cursorModelName: chat.modelName
      },
      note: null
    }
  }
  return {
    readOnlyReason: null,
    settingsPatch: {
      provider: 'claude',
      claudeModel: modelId ?? '',
      claudeEffort: (model.effort ?? '') as ClaudeEffort | '',
      claudeModelName: chat.modelName
    },
    note: null
  }
}

/** Opens a chat of this stand from its log: restores its session (or makes it read-only) and returns its replay. */
export async function openChatFromHistory(id: string, pkgRoot: string, deps: ChatOpenDeps): Promise<OpenedChat> {
  const logDir = getChatLogDir()
  if (!logDir) {
    throw new Error('Папка логов не задана')
  }
  const chat = getChat(id)
  if (!chat) {
    throw new Error('Чат не найден')
  }
  if (chat.projectPath !== pkgRoot) {
    throw new Error('Чат относится к другому стенду')
  }
  if (deps.isRunning()) {
    throw new Error('Агент работает — дождитесь окончания хода')
  }
  const jsonlPath = chatLogPath(logDir, id)
  const parsed = parseChatLog(readFileSync(jsonlPath, 'utf8'))
  const availableModelIds = deps.hasKey(chat.provider)
    ? await deps.listModelIds(chat.provider).catch(() => undefined)
    : undefined
  const plan = planChatOpen(chat, { hasKey: deps.hasKey, availableModelIds })
  if (plan.readOnlyReason || !plan.settingsPatch || !chat.sessionId) {
    resetAgentSession()
  } else {
    // Settings are written directly (not via settings:setProvider): that would reset the session just restored.
    updateAppSettings(plan.settingsPatch)
    restoreAgentSession({
      sessionId: chat.sessionId,
      projectPath: chat.projectPath,
      provider: chat.provider,
      chatStartedAt: Date.parse(parsed.startedAt ?? chat.createdAt),
      lastTurnStopped: parsed.lastTurnStopped,
      lastTurnInterrupted: parsed.lastTurnInterrupted,
      jsonlPath
    })
  }
  return { id, items: parsed.items, readOnlyReason: plan.readOnlyReason, note: plan.note }
}
