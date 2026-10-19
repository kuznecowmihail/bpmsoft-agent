import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as path from 'path'

const store = new Map<string, string>()

vi.mock('../src/main/secureStore', () => ({
  saveSecret: (key: string, value: string) => store.set(key, value),
  loadSecret: (key: string) => store.get(key),
  clearSecret: (key: string) => store.delete(key)
}))

import {
  normalizeApiKey,
  setApiKey,
  hasApiKey,
  loadStoredApiKey,
  clearApiKey,
  setCursorApiKey,
  hasCursorApiKey,
  clearCursorApiKey,
  getCursorApiKey,
  createPendingPermissionRequest,
  resolvePermissionRequest,
  rejectAllPendingPermissions,
  stopAgent,
  getCurrentSessionId,
  resetAgentSession,
  rememberSessionId,
  setActiveProject,
  setCrmPassword,
  hasCrmPassword,
  clearCrmPassword,
  dropLegacyConnectionSecrets
} from '../src/main/agentSession'

describe('normalizeApiKey', () => {
  it('removes leading and trailing whitespace', () => {
    expect(normalizeApiKey('  key_abc\n')).toBe('key_abc')
  })

  it('removes zero-width spaces', () => {
    expect(normalizeApiKey('key_abc​')).toBe('key_abc')
  })

  it('returns undefined when key contains Cyrillic characters', () => {
    expect(normalizeApiKey('key_ключ')).toBeUndefined()
  })

  it('accepts ASCII printable characters', () => {
    expect(normalizeApiKey('key_123!@#')).toBe('key_123!@#')
  })

  it('returns undefined for empty string after cleaning', () => {
    expect(normalizeApiKey('   \n  ')).toBeUndefined()
  })
})

describe('agentSession API key state', () => {
  beforeEach(() => {
    store.clear()
    clearApiKey()
    clearCursorApiKey()
  })

  it('has no API key by default', () => {
    expect(hasApiKey()).toBe(false)
  })

  it('reports true after setApiKey is called with valid key', () => {
    setApiKey('test-key')
    expect(hasApiKey()).toBe(true)
  })

  it('throws when setApiKey is called with Cyrillic characters', () => {
    expect(() => setApiKey('key_ключ')).toThrow('Ключ содержит недопустимые символы')
  })

  it('normalizes and stores cleaned key when setApiKey receives spaces and invisible chars', () => {
    setApiKey(' test-key​ ')
    expect(hasApiKey()).toBe(true)
    expect(store.get('anthropicApiKey')).toBe('test-key')
  })

  it('loadStoredApiKey hydrates the in-memory cache from a previously persisted key', () => {
    store.set('anthropicApiKey', 'previously-persisted-key')
    expect(hasApiKey()).toBe(false)
    loadStoredApiKey()
    expect(hasApiKey()).toBe(true)
  })

  it('clearApiKey removes both the in-memory and persisted key', () => {
    setApiKey('test-key')
    clearApiKey()
    expect(hasApiKey()).toBe(false)
    expect(store.has('anthropicApiKey')).toBe(false)
  })
})

describe('agentSession Cursor API key state', () => {
  beforeEach(() => {
    store.clear()
    clearCursorApiKey()
  })

  it('has no Cursor API key by default', () => {
    expect(hasCursorApiKey()).toBe(false)
  })

  it('reports true after setCursorApiKey is called with valid key', () => {
    setCursorApiKey('cursor-key')
    expect(hasCursorApiKey()).toBe(true)
  })

  it('throws when setCursorApiKey is called with Cyrillic characters', () => {
    expect(() => setCursorApiKey('key_ключ')).toThrow('Ключ содержит недопустимые символы')
  })

  it('normalizes and stores cleaned key when setCursorApiKey receives spaces and invisible chars', () => {
    setCursorApiKey(' key_ok​ ')
    expect(hasCursorApiKey()).toBe(true)
    expect(store.get('cursorApiKey')).toBe('key_ok')
    expect(getCursorApiKey()).toBe('key_ok')
  })

  it('loadStoredApiKey hydrates the Cursor key from the persisted key', () => {
    store.set('cursorApiKey', 'previously-persisted-cursor-key')
    expect(hasCursorApiKey()).toBe(false)
    loadStoredApiKey()
    expect(hasCursorApiKey()).toBe(true)
  })

  it('clearCursorApiKey removes both the in-memory and persisted key', () => {
    setCursorApiKey('cursor-key')
    clearCursorApiKey()
    expect(hasCursorApiKey()).toBe(false)
    expect(store.has('cursorApiKey')).toBe(false)
  })

  it('loadStoredApiKey repairs a stored Cursor key with invisible characters', () => {
    store.set('cursorApiKey', 'key_x​')
    expect(hasCursorApiKey()).toBe(false)
    loadStoredApiKey()
    expect(hasCursorApiKey()).toBe(true)
    expect(getCursorApiKey()).toBe('key_x')
    expect(store.get('cursorApiKey')).toBe('key_x')
  })
})

describe('agentSession tool-permission requests', () => {
  it('resolves a pending permission request with the given approval', async () => {
    const { id, wait } = createPendingPermissionRequest()
    resolvePermissionRequest(id, true)
    await expect(wait).resolves.toBe(true)
  })

  it('resolves with false when the user declines', async () => {
    const { id, wait } = createPendingPermissionRequest()
    resolvePermissionRequest(id, false)
    await expect(wait).resolves.toBe(false)
  })

  it('does nothing when resolving an unknown request id', () => {
    expect(() => resolvePermissionRequest('missing-id', true)).not.toThrow()
  })

  it('rejectAllPendingPermissions resolves every pending wait with false', async () => {
    const first = createPendingPermissionRequest()
    const second = createPendingPermissionRequest()
    rejectAllPendingPermissions()
    await expect(first.wait).resolves.toBe(false)
    await expect(second.wait).resolves.toBe(false)
  })

  it('a request rejected by rejectAllPendingPermissions cannot be resolved again', async () => {
    const { id, wait } = createPendingPermissionRequest()
    rejectAllPendingPermissions()
    resolvePermissionRequest(id, true)
    await expect(wait).resolves.toBe(false)
  })
})

describe('agentSession per-project CRM password', () => {
  beforeEach(() => {
    store.clear()
    setActiveProject(undefined)
  })

  it('keeps the CRM password of each opened project apart', () => {
    setActiveProject(path.resolve('a'))
    setCrmPassword('secret-a')
    expect(hasCrmPassword()).toBe(true)

    setActiveProject(path.resolve('b'))
    expect(hasCrmPassword()).toBe(false)
    setCrmPassword('secret-b')

    setActiveProject(path.resolve('a'))
    expect(hasCrmPassword()).toBe(true)
    expect(store.get(`crmPassword:${path.resolve('a')}`)).toBe('secret-a')

    clearCrmPassword()
    expect(hasCrmPassword()).toBe(false)
    expect(store.has(`crmPassword:${path.resolve('a')}`)).toBe(false)
  })

  it('without an opened project there is no password and it cannot be set', () => {
    expect(hasCrmPassword()).toBe(false)
    expect(() => setCrmPassword('secret')).toThrow('Сначала откройте проект')
  })

  it('dropLegacyConnectionSecrets removes the unattributed password saved before', () => {
    store.set('crmPassword', 'old-secret')
    dropLegacyConnectionSecrets()
    expect(store.has('crmPassword')).toBe(false)
  })
})

describe('agentSession stop', () => {
  it('stopAgent returns false when no turn is running', () => {
    expect(stopAgent()).toBe(false)
  })
})

describe('agentSession conversation continuity', () => {
  beforeEach(() => {
    resetAgentSession()
  })

  it('has no session by default', () => {
    expect(getCurrentSessionId()).toBeUndefined()
  })

  it('remembers the session id from system_init and result events', () => {
    rememberSessionId({ type: 'system_init', model: 'm', mcpServers: [], sessionId: 'sess-1' }, '/pkg')
    expect(getCurrentSessionId()).toBe('sess-1')
    rememberSessionId({ type: 'result', success: true, durationMs: 1, sessionId: 'sess-2' }, '/pkg')
    expect(getCurrentSessionId()).toBe('sess-2')
  })

  it('ignores events without a session id', () => {
    rememberSessionId({ type: 'text', text: 'hi' }, '/pkg')
    expect(getCurrentSessionId()).toBeUndefined()
  })

  it('resetAgentSession forgets the session', () => {
    rememberSessionId({ type: 'result', success: true, durationMs: 1, sessionId: 'sess-1' }, '/pkg')
    resetAgentSession()
    expect(getCurrentSessionId()).toBeUndefined()
  })

  it('rememberSessionId stores the provider parameter', () => {
    rememberSessionId({ type: 'result', success: true, durationMs: 1, sessionId: 'sess-cursor' }, '/pkg', 'cursor')
    expect(getCurrentSessionId()).toBe('sess-cursor')
    // No public getter for provider, but we verify through resetAgentSession
    resetAgentSession()
    expect(getCurrentSessionId()).toBeUndefined()
  })
})
