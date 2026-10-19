import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname, join, relative, sep } from 'path'
import type { AgentProvider, ChatModelRef, ChatSummary } from '../shared/types'
import { parseChatLog } from './chatReplay'

export interface ChatIndexEntry extends ChatSummary {
  projectPath: string
  createdAt: string
  model: ChatModelRef | null
  modelName: string
  sessionId: string | null
  lastTurnInterrupted: boolean
  lastTurnStopped: boolean
}

const UNTITLED = 'Без названия'
const JSONL_EXT = '.jsonl'

let logDir: string | undefined
let indexPath: string | undefined
let entries: Record<string, ChatIndexEntry> = {}

function hasEntry(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(entries, id)
}

function saveIndex(): void {
  if (!indexPath) {
    return
  }
  try {
    mkdirSync(dirname(indexPath), { recursive: true })
    const tmpPath = `${indexPath}.tmp`
    writeFileSync(tmpPath, JSON.stringify({ version: 1, chats: entries }, null, 2))
    renameSync(tmpPath, indexPath)
  } catch (err) {
    console.error('Error saving chat index:', err)
  }
}

function backfill(dir: string): void {
  const chatsRoot = join(dir, 'chats')
  let days: string[]
  try {
    days = readdirSync(chatsRoot)
  } catch {
    return
  }
  for (const day of days) {
    const dayDir = join(chatsRoot, day)
    try {
      if (!statSync(dayDir).isDirectory()) {
        continue
      }
    } catch {
      continue
    }
    for (const name of readdirSync(dayDir)) {
      if (!name.endsWith(JSONL_EXT)) {
        continue
      }
      const jsonlPath = join(dayDir, name)
      try {
        const parsed = parseChatLog(readFileSync(jsonlPath, 'utf8'))
        if (!parsed.projectPath || !parsed.provider) {
          continue
        }
        const id = chatIdFromLogPath(dir, jsonlPath)
        const mtime = statSync(jsonlPath).mtime.toISOString()
        const createdAt = parsed.startedAt ?? parsed.updatedAt ?? mtime
        entries[id] = {
          id,
          title: parsed.title,
          provider: parsed.provider,
          updatedAt: parsed.updatedAt ?? createdAt,
          contextLost: false,
          projectPath: parsed.projectPath,
          createdAt,
          model: parsed.model,
          modelName: '',
          sessionId: parsed.sessionId,
          lastTurnInterrupted: parsed.lastTurnInterrupted,
          lastTurnStopped: parsed.lastTurnStopped
        }
      } catch (err) {
        console.error('Error reading chat log for index:', err)
      }
    }
  }
}

/** Loads the chat index from `chats/index.json`; a missing or corrupt file is rebuilt from the logs. */
export function initChatIndex(dir: string): void {
  logDir = dir
  indexPath = join(dir, 'chats', 'index.json')
  entries = {}
  if (!existsSync(indexPath)) {
    backfill(dir)
    saveIndex()
    return
  }
  let loaded: Record<string, ChatIndexEntry> | undefined
  try {
    const parsed = JSON.parse(readFileSync(indexPath, 'utf8').replace(/^﻿/, ''))
    if (parsed !== null && typeof parsed === 'object' && parsed.chats !== null && typeof parsed.chats === 'object' && !Array.isArray(parsed.chats)) {
      loaded = parsed.chats as Record<string, ChatIndexEntry>
    }
  } catch (err) {
    console.error('Error loading chat index:', err)
  }
  if (loaded) {
    entries = loaded
    return
  }
  entries = {}
  backfill(dir)
  saveIndex()
}

/** Chat id is the log path relative to `chats/` without `.jsonl`, with '/' as the separator: '<день>/<имя>'. */
export function chatIdFromLogPath(dir: string, jsonlPath: string): string {
  const rel = relative(join(dir, 'chats'), jsonlPath).replace(/\.jsonl$/, '')
  return rel.split(sep).join('/')
}

export function chatLogPath(dir: string, id: string): string {
  return join(dir, 'chats', ...id.split('/')) + JSONL_EXT
}

function defaultEntry(id: string): ChatIndexEntry {
  const now = new Date().toISOString()
  return {
    id,
    title: UNTITLED,
    provider: 'claude' as AgentProvider,
    updatedAt: now,
    contextLost: false,
    projectPath: '',
    createdAt: now,
    model: null,
    modelName: '',
    sessionId: null,
    lastTurnInterrupted: false,
    lastTurnStopped: false
  }
}

/** Merges the given fields into the entry (creating it if needed) and saves the index. No-op before initChatIndex. */
export function upsertChat(patch: Partial<ChatIndexEntry> & { id: string }): void {
  if (!indexPath) {
    return
  }
  const { id } = patch
  const merged: Record<string, unknown> = { ...(hasEntry(id) ? entries[id] : defaultEntry(id)) }
  for (const key of Object.keys(patch)) {
    const value = (patch as Record<string, unknown>)[key]
    if (value !== undefined) {
      merged[key] = value
    }
  }
  entries[id] = merged as unknown as ChatIndexEntry
  saveIndex()
}

export function getChat(id: string): ChatIndexEntry | undefined {
  return hasEntry(id) ? entries[id] : undefined
}

/** Chats of one stand, newest first. Entries whose .jsonl is gone are removed from the index. */
export function listChats(projectPath: string): ChatSummary[] {
  if (!logDir) {
    return []
  }
  try {
    const dir = logDir
    let removed = false
    for (const id of Object.keys(entries)) {
      if (!existsSync(chatLogPath(dir, id))) {
        delete entries[id]
        removed = true
      }
    }
    if (removed) {
      saveIndex()
    }
    return Object.values(entries)
      .filter((entry) => entry.projectPath === projectPath)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        provider: entry.provider,
        updatedAt: entry.updatedAt,
        contextLost: entry.contextLost
      }))
  } catch (err) {
    console.error('Error listing chats:', err)
    return []
  }
}
