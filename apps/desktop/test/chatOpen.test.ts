import { describe, it, expect } from 'vitest'
import { planChatOpen } from '../src/main/chatOpen'
import type { ChatIndexEntry } from '../src/main/chatIndex'

function chat(over: Partial<ChatIndexEntry> = {}): ChatIndexEntry {
  return {
    id: '2026-10-19/15-01-24',
    title: 'опиши',
    provider: 'claude',
    updatedAt: '2026-10-19T12:00:00.000Z',
    contextLost: false,
    projectPath: '/pkgA',
    createdAt: '2026-10-19T11:00:00.000Z',
    model: { id: 'claude-x', effort: 'high' },
    modelName: 'Claude X',
    sessionId: 'sid-1',
    lastTurnInterrupted: false,
    lastTurnStopped: false,
    ...over
  }
}

const hasAll = (): boolean => true
const hasNone = (): boolean => false

describe('planChatOpen', () => {
  it('makes a chat read-only when its context is lost', () => {
    const plan = planChatOpen(chat({ contextLost: true }), { hasKey: hasAll })
    expect(plan.readOnlyReason).toBe('Контекст этого чата потерян — продолжить его нельзя. Начните новый чат.')
    expect(plan.settingsPatch).toBeNull()
    expect(plan.note).toBeNull()
  })

  it('makes a chat read-only when it has no session id', () => {
    const plan = planChatOpen(chat({ sessionId: null }), { hasKey: hasAll })
    expect(plan.readOnlyReason).toBe('Ход оборвался до начала сессии агента — продолжить чат нельзя. Начните новый чат.')
    expect(plan.settingsPatch).toBeNull()
  })

  it('checks context before session id and key', () => {
    const plan = planChatOpen(chat({ contextLost: true, sessionId: null }), { hasKey: hasNone })
    expect(plan.readOnlyReason).toBe('Контекст этого чата потерян — продолжить его нельзя. Начните новый чат.')
  })

  it('makes a Claude chat read-only when the Claude key is missing', () => {
    const plan = planChatOpen(chat({ provider: 'claude' }), { hasKey: hasNone })
    expect(plan.readOnlyReason).toBe('Не задан ключ Claude — продолжить чат нельзя. Укажите ключ в настройках или начните новый чат.')
    expect(plan.settingsPatch).toBeNull()
  })

  it('makes a Cursor chat read-only when the Cursor key is missing', () => {
    const plan = planChatOpen(chat({ provider: 'cursor', model: { id: 'composer-2.5', params: [] } }), { hasKey: hasNone })
    expect(plan.readOnlyReason).toBe('Не задан ключ Cursor — продолжить чат нельзя. Укажите ключ в настройках или начните новый чат.')
    expect(plan.settingsPatch).toBeNull()
  })

  it('switches to the Claude provider and model of the chat', () => {
    const plan = planChatOpen(chat(), { hasKey: hasAll })
    expect(plan.readOnlyReason).toBeNull()
    expect(plan.note).toBeNull()
    expect(plan.settingsPatch).toEqual({
      provider: 'claude',
      claudeModel: 'claude-x',
      claudeEffort: 'high',
      claudeModelName: 'Claude X'
    })
  })

  it('switches to the Cursor provider and model with params', () => {
    const params = [{ id: 'thinking', value: 'true' }]
    const plan = planChatOpen(
      chat({ provider: 'cursor', model: { id: 'composer-2.5', params }, modelName: 'Composer' }),
      { hasKey: hasAll }
    )
    expect(plan.readOnlyReason).toBeNull()
    expect(plan.settingsPatch).toEqual({
      provider: 'cursor',
      cursorModel: 'composer-2.5',
      cursorModelParams: params,
      cursorModelName: 'Composer'
    })
  })

  it('keeps only the provider when the chat has no model', () => {
    const plan = planChatOpen(chat({ model: null }), { hasKey: hasAll })
    expect(plan.settingsPatch).toEqual({ provider: 'claude' })
  })

  it('keeps the current model and adds a note when the chat model is gone', () => {
    const plan = planChatOpen(chat(), { hasKey: hasAll, availableModelIds: ['claude-y'] })
    expect(plan.readOnlyReason).toBeNull()
    expect(plan.note).toBe('Модели этого чата больше нет — продолжаю на текущей модели провайдера.')
    expect(plan.settingsPatch).toEqual({ provider: 'claude' })
  })

  it('switches the model when the list of models is not known', () => {
    const plan = planChatOpen(chat(), { hasKey: hasAll, availableModelIds: undefined })
    expect(plan.note).toBeNull()
    expect(plan.settingsPatch).toEqual({
      provider: 'claude',
      claudeModel: 'claude-x',
      claudeEffort: 'high',
      claudeModelName: 'Claude X'
    })
  })

  it('names the model by its id when the chat has no model name', () => {
    const plan = planChatOpen(chat({ model: { id: 'x', effort: 'high' }, modelName: '' }), { hasKey: hasAll })
    expect(plan.settingsPatch?.claudeModelName).toBe('x')
  })

  it('switches the model when the chat model is still in the list', () => {
    const plan = planChatOpen(chat(), { hasKey: hasAll, availableModelIds: ['claude-x', 'claude-y'] })
    expect(plan.note).toBeNull()
    expect(plan.settingsPatch?.claudeModel).toBe('claude-x')
  })
})
