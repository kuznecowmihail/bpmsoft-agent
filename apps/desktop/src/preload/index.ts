import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ProjectValidationResult, AgentProvider, AgentSettings, CursorModelOption, ClaudeModelOption, CursorModelParam, ClaudeEffort, DbSettingsPatch, CrmSettingsPatch, CrmBrowserState } from '../shared/types'
import type { AgentEvent } from '@bpmsoft-agent/agent-runtime'

export interface AgentPermissionRequest {
  id: string
  toolName: string
  input: unknown
}

const api = {
  selectProjectFolder: (): Promise<string | null> => ipcRenderer.invoke('project:selectFolder'),
  validateProject: (projectPath: string): Promise<ProjectValidationResult> =>
    ipcRenderer.invoke('project:validate', projectPath),
  setApiKey: (apiKey: string): Promise<void> => ipcRenderer.invoke('agent:setApiKey', apiKey),
  hasStoredApiKey: (): Promise<boolean> => ipcRenderer.invoke('agent:hasApiKey'),
  clearApiKey: (): Promise<void> => ipcRenderer.invoke('agent:clearApiKey'),
  sendMessage: (prompt: string, projectPath: string, additionalDirectories?: string[], readRoot?: string): Promise<void> =>
    ipcRenderer.invoke('agent:sendMessage', { prompt, projectPath, additionalDirectories, readRoot }),
  newChat: (): Promise<void> => ipcRenderer.invoke('agent:newChat'),
  onAgentEvent: (callback: (event: AgentEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, agentEvent: AgentEvent): void => callback(agentEvent)
    ipcRenderer.on('agent:event', listener)
    return () => ipcRenderer.removeListener('agent:event', listener)
  },
  onPermissionRequest: (callback: (request: AgentPermissionRequest) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, request: AgentPermissionRequest): void => callback(request)
    ipcRenderer.on('agent:permissionRequest', listener)
    return () => ipcRenderer.removeListener('agent:permissionRequest', listener)
  },
  respondToPermissionRequest: (id: string, approved: boolean): Promise<void> =>
    ipcRenderer.invoke('agent:permissionResponse', { id, approved }),
  getAgentSettings: (): Promise<AgentSettings> => ipcRenderer.invoke('settings:get'),
  setProvider: (provider: AgentProvider): Promise<void> => ipcRenderer.invoke('settings:setProvider', provider),
  setCursorModel: (model: { id: string; params?: CursorModelParam[]; name?: string }): Promise<void> => ipcRenderer.invoke('settings:setCursorModel', model),
  setClaudeModel: (model: { id: string; effort?: ClaudeEffort; name?: string }): Promise<void> => ipcRenderer.invoke('settings:setClaudeModel', model),
  setCursorUnsandboxed: (value: boolean): Promise<void> => ipcRenderer.invoke('settings:setCursorUnsandboxed', value),
  setCursorApiKey: (apiKey: string): Promise<void> => ipcRenderer.invoke('cursor:setApiKey', apiKey),
  clearCursorApiKey: (): Promise<void> => ipcRenderer.invoke('cursor:clearApiKey'),
  listCursorModels: (): Promise<CursorModelOption[]> => ipcRenderer.invoke('cursor:listModels'),
  listClaudeModels: (): Promise<ClaudeModelOption[]> => ipcRenderer.invoke('claude:listModels'),
  setDbSettings: (patch: DbSettingsPatch): Promise<void> => ipcRenderer.invoke('settings:setDb', patch),
  setDbPassword: (password: string): Promise<void> => ipcRenderer.invoke('db:setPassword', password),
  clearDbPassword: (): Promise<void> => ipcRenderer.invoke('db:clearPassword'),
  testDbConnection: (readRoot: string): Promise<string> => ipcRenderer.invoke('db:test', readRoot),
  setCrmSettings: (patch: CrmSettingsPatch): Promise<void> => ipcRenderer.invoke('settings:setCrm', patch),
  setCrmPassword: (password: string): Promise<void> => ipcRenderer.invoke('crm:setPassword', password),
  clearCrmPassword: (): Promise<void> => ipcRenderer.invoke('crm:clearPassword'),
  testCrmConnection: (): Promise<string> => ipcRenderer.invoke('crm:test'),
  onCrmBrowserActivity: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('crmBrowser:activity', listener)
    return () => ipcRenderer.removeListener('crmBrowser:activity', listener)
  },
  onCrmBrowserState: (callback: (state: CrmBrowserState) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: CrmBrowserState): void => callback(state)
    ipcRenderer.on('crmBrowser:state', listener)
    return () => ipcRenderer.removeListener('crmBrowser:state', listener)
  },
  setCrmBrowserBounds: (bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke('crmBrowser:setBounds', bounds),
  setCrmBrowserVisible: (visible: boolean): Promise<void> => ipcRenderer.invoke('crmBrowser:setVisible', visible),
  openCrmBrowserHome: (): Promise<void> => ipcRenderer.invoke('crmBrowser:openHome'),
  reloadCrmBrowser: (): Promise<void> => ipcRenderer.invoke('crmBrowser:reload'),
  closeCrmBrowser: (): Promise<void> => ipcRenderer.invoke('crmBrowser:close'),
  openLogs: (): Promise<void> => ipcRenderer.invoke('logs:open')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
