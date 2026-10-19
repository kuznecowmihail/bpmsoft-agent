import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  initChatIndex,
  listChats,
  upsertChat,
  getChat,
  chatIdFromLogPath,
  chatLogPath
} from '../src/main/chatIndex'

function logText(projectPath: string, ts: string, text: string, sessionId: string): string {
  const records: Array<Record<string, unknown>> = [
    { ts, kind: 'chat_start', projectPath },
    {
      ts,
      kind: 'user_message',
      text,
      provider: 'claude',
      model: { id: null, effort: null }
    },
    { ts, kind: 'turn_end', sessionId, stopped: false }
  ]
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n'
}

function writeLog(logDir: string, day: string, name: string, text: string): string {
  const dir = join(logDir, 'chats', day)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name + '.jsonl')
  writeFileSync(path, text)
  return path
}

describe('chatIndex', () => {
  let logDir: string

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'chatindex-'))
  })

  it('backfills from existing logs', () => {
    writeLog(logDir, '2026-10-18', '10-00-00', logText('/pkgA', '2026-10-18T10:00:00.000Z', 'старый', 's1'))
    writeLog(logDir, '2026-10-19', '10-00-00', logText('/pkgA', '2026-10-19T10:00:00.000Z', 'новый', 's2'))

    initChatIndex(logDir)

    const chats = listChats('/pkgA')
    expect(chats).toHaveLength(2)
    expect(chats[0].title).toBe('новый')
    expect(chats[0].id).toBe('2026-10-19/10-00-00')
    expect(chats[1].title).toBe('старый')
    expect(chats[0]).toEqual({
      id: '2026-10-19/10-00-00',
      title: 'новый',
      provider: 'claude',
      updatedAt: '2026-10-19T10:00:00.000Z',
      contextLost: false
    })
  })

  it('filters by project', () => {
    writeLog(logDir, '2026-10-19', '10-00-00', logText('/pkgA', '2026-10-19T10:00:00.000Z', 'a', 's1'))
    writeLog(logDir, '2026-10-19', '11-00-00', logText('/pkgB', '2026-10-19T11:00:00.000Z', 'b', 's2'))

    initChatIndex(logDir)

    const chats = listChats('/pkgA')
    expect(chats).toHaveLength(1)
    expect(chats[0].title).toBe('a')
    expect(listChats('/pkgB')).toHaveLength(1)
  })

  it('drops chats whose log was deleted', () => {
    const pathA = writeLog(logDir, '2026-10-19', '10-00-00', logText('/pkgA', '2026-10-19T10:00:00.000Z', 'a', 's1'))
    writeLog(logDir, '2026-10-19', '11-00-00', logText('/pkgA', '2026-10-19T11:00:00.000Z', 'b', 's2'))

    initChatIndex(logDir)
    expect(listChats('/pkgA')).toHaveLength(2)

    unlinkSync(pathA)

    const chats = listChats('/pkgA')
    expect(chats).toHaveLength(1)
    expect(chats[0].title).toBe('b')
  })

  it('upsert merges fields', () => {
    writeLog(logDir, '2026-10-19', '10-00-00', logText('/pkgA', '2026-10-19T10:00:00.000Z', 'a', 's1'))
    initChatIndex(logDir)
    const id = '2026-10-19/10-00-00'

    upsertChat({ id, sessionId: 's2' })

    const entry = getChat(id)
    expect(entry).toBeDefined()
    expect(entry!.sessionId).toBe('s2')
    expect(entry!.title).toBe('a')
    expect(entry!.projectPath).toBe('/pkgA')
  })

  it('survives corrupt index.json', () => {
    const dir = join(logDir, 'chats')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.json'), '{not json')

    expect(() => initChatIndex(logDir)).not.toThrow()
    expect(listChats('/pkgA')).toEqual([])
  })

  it('chatIdFromLogPath and chatLogPath are inverse', () => {
    const jsonlPath = join(logDir, 'chats', '2026-10-19', '15-01-24.jsonl')

    const id = chatIdFromLogPath(logDir, jsonlPath)
    expect(id).toBe('2026-10-19/15-01-24')
    expect(chatLogPath(logDir, id)).toBe(jsonlPath)
  })
})
