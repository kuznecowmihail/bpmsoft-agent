import { ElectronAPI } from '@electron-toolkit/preload'
import type { ProjectValidationResult, AgentProvider, AgentSettings, CursorModelOption, ClaudeModelOption, CursorModelParam, ClaudeEffort } from '../shared/types'
import type { AgentEvent } from '@bpmsoft-agent/agent-runtime'

export interface AgentPermissionRequest {
  id: string
  toolName: string
  input: unknown
}

export interface BpmsoftDesktopApi {
  selectProjectFolder: () => Promise<string | null>
  validateProject: (projectPath: string) => Promise<ProjectValidationResult>
  setApiKey: (apiKey: string) => Promise<void>
  hasStoredApiKey: () => Promise<boolean>
  clearApiKey: () => Promise<void>
  sendMessage: (prompt: string, projectPath: string, additionalDirectories?: string[], readRoot?: string) => Promise<void>
  newChat: () => Promise<void>
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
  openLogs: () => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: BpmsoftDesktopApi
  }
}
