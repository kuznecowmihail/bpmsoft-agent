import * as fs from 'fs'
import type { AgentProvider, CursorModelParam, ClaudeEffort } from '../shared/types'

const MAX_RECENT_PROJECTS = 10

/** Non-secret app preferences persisted as JSON in userData (keys live in secureStore). */
export interface StoredSettings {
  provider: AgentProvider
  cursorModel: string
  cursorModelParams: CursorModelParam[]
  cursorModelName: string
  claudeModel: string
  claudeEffort: ClaudeEffort | ''
  claudeModelName: string
  dbAccessEnabled: boolean
  dbConfirmQueries: boolean
  dbHost: string
  dbPort: string
  dbUser: string
  crmActionsEnabled: boolean
  crmConfirmActions: boolean
  crmBrowserEnabled: boolean
  crmUrl: string
  crmUser: string
  recentProjects: string[]
}

export const DEFAULT_SETTINGS: StoredSettings = { provider: 'claude', cursorModel: 'composer-2.5', cursorModelParams: [], cursorModelName: '', claudeModel: '', claudeEffort: '', claudeModelName: '', dbAccessEnabled: false, dbConfirmQueries: false, dbHost: '', dbPort: '', dbUser: '', crmActionsEnabled: false, crmConfirmActions: false, crmBrowserEnabled: false, crmUrl: '', crmUser: '', recentProjects: [] }

let settingsPath: string | undefined
let cache: StoredSettings = { ...DEFAULT_SETTINGS }

function normalize(value: unknown): StoredSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  const params = Array.isArray(raw.cursorModelParams)
    ? raw.cursorModelParams.filter((p) => typeof p === 'object' && typeof p.id === 'string' && typeof p.value === 'string')
    : []

  const validEfforts = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max'])
  const claudeEffort = typeof raw.claudeEffort === 'string' && validEfforts.has(raw.claudeEffort) ? (raw.claudeEffort as ClaudeEffort) : ''

  const crmUrl = typeof raw.crmUrl === 'string' ? raw.crmUrl.trim().replace(/\/+$/, '') : ''

  return {
    provider: raw.provider === 'cursor' ? 'cursor' : 'claude',
    cursorModel: typeof raw.cursorModel === 'string' && raw.cursorModel.trim() ? raw.cursorModel : DEFAULT_SETTINGS.cursorModel,
    cursorModelParams: params,
    cursorModelName: typeof raw.cursorModelName === 'string' ? raw.cursorModelName : '',
    claudeModel: typeof raw.claudeModel === 'string' ? raw.claudeModel.trim() : '',
    claudeEffort,
    claudeModelName: typeof raw.claudeModelName === 'string' ? raw.claudeModelName : '',
    dbAccessEnabled: raw.dbAccessEnabled === true,
    dbConfirmQueries: raw.dbConfirmQueries === true,
    dbHost: typeof raw.dbHost === 'string' ? raw.dbHost.trim() : '',
    dbPort: typeof raw.dbPort === 'string' && /^\d{1,5}$/.test(raw.dbPort.trim()) ? raw.dbPort.trim() : '',
    dbUser: typeof raw.dbUser === 'string' ? raw.dbUser.trim() : '',
    crmActionsEnabled: raw.crmActionsEnabled === true,
    crmConfirmActions: raw.crmConfirmActions === true,
    crmBrowserEnabled: raw.crmBrowserEnabled === true,
    crmUrl: /^https?:\/\/[^\s]+$/i.test(crmUrl) ? crmUrl : '',
    crmUser: typeof raw.crmUser === 'string' ? raw.crmUser.trim() : '',
    recentProjects: Array.isArray(raw.recentProjects)
      ? [...new Set(raw.recentProjects.filter((p): p is string => typeof p === 'string' && p.trim() !== ''))].slice(0, MAX_RECENT_PROJECTS)
      : []
  }
}

/** Loads settings from `filePath` (missing or broken file → defaults). */
export function initAppSettings(filePath: string): void {
  settingsPath = filePath
  try {
    cache = fs.existsSync(filePath) ? normalize(JSON.parse(fs.readFileSync(filePath, 'utf-8'))) : { ...DEFAULT_SETTINGS }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
}

export function getAppSettings(): StoredSettings {
  return { ...cache }
}

/** Merges `patch` into the settings and writes them to disk (in memory only before init). */
export function updateAppSettings(patch: Partial<StoredSettings>): StoredSettings {
  cache = normalize({ ...cache, ...patch })
  if (settingsPath) {
    fs.writeFileSync(settingsPath, JSON.stringify(cache, null, 2), 'utf-8')
  }
  return getAppSettings()
}

/** Moves `projectPath` to the top of the recent projects list (at most MAX_RECENT_PROJECTS). */
export function addRecentProject(projectPath: string): void {
  updateAppSettings({ recentProjects: [projectPath, ...cache.recentProjects.filter((p) => p !== projectPath)] })
}

export function removeRecentProject(projectPath: string): void {
  updateAppSettings({ recentProjects: cache.recentProjects.filter((p) => p !== projectPath) })
}
