import type { ProjectValidationResult, AgentProvider, AgentSettings, CursorModelOption, ClaudeModelOption, CursorModelParam, ClaudeEffort, DbSettingsPatch, CrmSettingsPatch, CrmBrowserState, RecentProject, ChatSummary, OpenedChat } from '../shared/types'
import type { AgentEvent, ClaudeSkillsStatus, ClaudeMdChoice, InstallOutcome } from '@bpmsoft-agent/agent-runtime'

export interface AgentPermissionRequest {
  id: string
  toolName: string
  input: unknown
}

export interface BpmsoftDesktopApi {
  selectProjectFolder: () => Promise<string | null>
  validateProject: (projectPath: string) => Promise<ProjectValidationResult>
  listRecentProjects: () => Promise<RecentProject[]>
  removeRecentProject: (projectPath: string) => Promise<void>
  setApiKey: (apiKey: string) => Promise<void>
  hasStoredApiKey: () => Promise<boolean>
  clearApiKey: () => Promise<void>
  sendMessage: (prompt: string, projectPath: string, additionalDirectories?: string[], readRoot?: string) => Promise<void>
  newChat: () => Promise<void>
  stopAgent: () => Promise<void>
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void
  onPermissionRequest: (callback: (request: AgentPermissionRequest) => void) => () => void
  respondToPermissionRequest: (id: string, approved: boolean) => Promise<void>
  getAgentSettings: () => Promise<AgentSettings>
  setProvider: (provider: AgentProvider) => Promise<void>
  setCursorModel: (model: { id: string; params?: CursorModelParam[]; name?: string }) => Promise<void>
  setClaudeModel: (model: { id: string; effort?: ClaudeEffort; name?: string }) => Promise<void>
  setCursorApiKey: (apiKey: string) => Promise<void>
  clearCursorApiKey: () => Promise<void>
  listCursorModels: () => Promise<CursorModelOption[]>
  listClaudeModels: () => Promise<ClaudeModelOption[]>
  listChats: (pkgRoot: string) => Promise<ChatSummary[]>
  openChat: (id: string, pkgRoot: string) => Promise<OpenedChat>
  setDbSettings: (patch: DbSettingsPatch) => Promise<void>
  setDbPassword: (password: string) => Promise<void>
  clearDbPassword: () => Promise<void>
  testDbConnection: (readRoot: string) => Promise<string>
  setCrmSettings: (patch: CrmSettingsPatch) => Promise<void>
  setCrmPassword: (password: string) => Promise<void>
  clearCrmPassword: () => Promise<void>
  testCrmConnection: () => Promise<string>
  claudeSkillsStatus: (appRoot: string) => Promise<ClaudeSkillsStatus>
  installClaudeSkills: (appRoot: string, options: { claudeMd?: ClaudeMdChoice; overwriteModified?: boolean }) => Promise<InstallOutcome>
  onCrmBrowserActivity: (callback: () => void) => () => void
  onCrmBrowserState: (callback: (state: CrmBrowserState) => void) => () => void
  setCrmBrowserBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
  setCrmBrowserVisible: (visible: boolean) => Promise<void>
  openCrmBrowserHome: () => Promise<void>
  reloadCrmBrowser: () => Promise<void>
  closeCrmBrowser: () => Promise<void>
  openLogs: () => Promise<void>
}

declare global {
  interface Window {
    api: BpmsoftDesktopApi
  }
}
