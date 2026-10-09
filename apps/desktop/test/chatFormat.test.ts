import { describe, it, expect } from 'vitest'
import {
  shortPath,
  describeToolCall,
  permissionSubject,
  mapAgentEventToEntry,
  isEntryVisible,
  projectName,
  formatClockTime,
  agentEventToLog,
  buildBlocks,
  shellExitCode,
  type ChatEntry
} from '../src/renderer/src/chatFormat'

describe('chatFormat', () => {
  describe('shortPath', () => {
    it('returns path after /Pkg/', () => {
      const result = shortPath('/a/b/BPMSoft.Configuration/Pkg/ProjectMain/Data/X/data.json')
      expect(result).toBe('ProjectMain/Data/X/data.json')
    })

    it('returns знания: prefix for knowledge files', () => {
      const result = shortPath('/x/packages/agent-runtime/knowledge/data-edit.md')
      expect(result).toBe('знания: data-edit.md')
    })

    it('returns Logs segment for log files', () => {
      const result = shortPath('/app/Logs/2026-10-06/Build.log')
      expect(result).toBe('Logs/2026-10-06/Build.log')
    })

    it('returns last two segments for regular paths', () => {
      const result = shortPath('/a/b/c/d.txt')
      expect(result).toBe('c/d.txt')
    })

    it('handles empty string', () => {
      const result = shortPath('')
      expect(result).toBe('')
    })

    it('handles non-string input', () => {
      const result = shortPath(null)
      expect(result).toBe('')
    })
  })

  describe('describeToolCall', () => {
    it('describes Read tool', () => {
      const result = describeToolCall('Read', { file_path: '/a/Pkg/P/S/x.cs' })
      expect(result).toBe('Читает файл P/S/x.cs')
    })

    it('describes Bash tool with description', () => {
      const result = describeToolCall('Bash', { command: 'ls', description: 'List packages' })
      expect(result).toBe('Выполняет команду: List packages')
    })

    it('describes Grep tool', () => {
      const result = describeToolCall('Grep', { pattern: 'GetValue', path: '/app/ResourcesCore' })
      expect(result).toBe('Ищет «GetValue» в ResourcesCore')
    })

    it('describes unknown tool', () => {
      const result = describeToolCall('Unknown', {})
      expect(result).toBe('Использует инструмент Unknown')
    })

    it('describes Write tool', () => {
      const result = describeToolCall('Write', { file_path: '/a/Pkg/test.txt' })
      expect(result).toBe('Создаёт файл test.txt')
    })

    it('describes Edit tool', () => {
      const result = describeToolCall('Edit', { file_path: '/a/Pkg/file.ts' })
      expect(result).toBe('Изменяет файл file.ts')
    })

    it('describes Agent tool', () => {
      const result = describeToolCall('Agent', { description: 'code review' })
      expect(result).toBe('Запускает помощника: code review')
    })

    it('describes Delete tool', () => {
      const result = describeToolCall('Delete', { file_path: '/x/Pkg/ProjectCore/Schemas/A/metadata.json' })
      expect(result).toBe('Удаляет файл ProjectCore/Schemas/A/metadata.json')
    })
  })

  describe('permissionSubject', () => {
    it('returns command for Bash tool', () => {
      const result = permissionSubject('Bash', { command: 'rm x' })
      expect(result).toBe('rm x')
    })

    it('returns file_path for Write tool', () => {
      const result = permissionSubject('Write', { file_path: '/p' })
      expect(result).toBe('/p')
    })

    it('returns undefined for tool without critical subject', () => {
      const result = permissionSubject('Read', { file_path: '/a/x' })
      expect(result).toBe('/a/x')
    })

    it('returns undefined when input is invalid', () => {
      const result = permissionSubject('Bash', { description: 'test' })
      expect(result).toBeUndefined()
    })
  })

  describe('shellExitCode', () => {
    it('extracts exit code from bash result', () => {
      const result = shellExitCode('Exit code 1\nfoo')
      expect(result).toBe(1)
    })

    it('returns undefined for non-exit-code text', () => {
      const result = shellExitCode('boom')
      expect(result).toBeUndefined()
    })

    it('handles leading whitespace', () => {
      const result = shellExitCode('  Exit code 42\n')
      expect(result).toBe(42)
    })
  })

  describe('mapAgentEventToEntry', () => {
    it('maps result event with success', () => {
      const event = { type: 'result' as const, success: true, durationMs: 57446 }
      const entry = mapAgentEventToEntry(event)
      expect(entry).toMatchObject({
        role: 'agent-result',
        level: 'info',
        content: 'Готово за 57 с'
      })
      expect(entry.ts).toBeDefined()
    })

    it('maps result event with failure', () => {
      const event = { type: 'result' as const, success: false, durationMs: 5000 }
      const entry = mapAgentEventToEntry(event)
      expect(entry).toMatchObject({
        role: 'agent-result',
        level: 'error',
        content: 'Агент остановился с ошибкой (5 с)'
      })
    })

    it('maps unknown event to agent-other', () => {
      const event = { type: 'other' as const, raw: {} }
      const entry = mapAgentEventToEntry(event)
      expect(entry).toMatchObject({ role: 'agent-other' })
      expect(entry.ts).toBeDefined()
    })

    it('maps tool_use event', () => {
      const event = { type: 'tool_use' as const, name: 'Read', input: { file_path: '/a/Pkg/x' } }
      const entry = mapAgentEventToEntry(event)
      expect(entry).toMatchObject({
        role: 'agent-tool',
        content: 'Читает файл x'
      })
      expect(entry.details).toContain('file_path')
      expect(entry.ts).toBeDefined()
    })

    it('maps tool error from other event', () => {
      const event = {
        type: 'other' as const,
        raw: {
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', is_error: true, content: 'Команда обращается к пути вне проекта: ../x' }
            ]
          }
        }
      }
      const entry = mapAgentEventToEntry(event)
      expect(entry).toMatchObject({
        role: 'agent-tool',
        level: 'warn'
      })
      expect(entry.content).toContain('Ошибка: Команда обращается')
    })

    it('maps exit code result as normal, without level', () => {
      const event = {
        type: 'other' as const,
        raw: {
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', is_error: true, content: 'Exit code 1\ndefine(...)' }
            ]
          }
        }
      }
      const entry = mapAgentEventToEntry(event)
      expect(entry).toMatchObject({
        role: 'agent-tool',
        content: 'Команда завершилась с кодом 1'
      })
      expect(entry.level).toBeUndefined()
      expect(entry.details).toBe('Exit code 1\ndefine(...)')
    })

    it('maps hook error as warn, not exit code', () => {
      const event = {
        type: 'other' as const,
        raw: {
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', is_error: true, content: 'PreToolUse:Bash hook error: Команда обращается к сети' }
            ]
          }
        }
      }
      const entry = mapAgentEventToEntry(event)
      expect(entry).toMatchObject({
        role: 'agent-tool',
        level: 'warn'
      })
      expect(entry.content).toContain('Ошибка:')
    })
  })

  describe('projectName', () => {
    it('returns last segment of path', () => {
      const result = projectName('/a/b/my_stand')
      expect(result).toBe('my_stand')
    })

    it('handles path with trailing slash', () => {
      const result = projectName('/a/b/my_stand/')
      expect(result).toBe('my_stand')
    })

    it('handles Windows backslashes', () => {
      const result = projectName('C:\\Users\\test\\project')
      expect(result).toBe('project')
    })
  })

  describe('formatClockTime', () => {
    it('returns time in HH:MM:SS format', () => {
      const ts = new Date('2026-10-06T14:30:45').getTime()
      const result = formatClockTime(ts)
      expect(result).toMatch(/^\d\d:\d\d:\d\d$/)
    })
  })

  describe('agentEventToLog', () => {
    it('maps tool error to warn level', () => {
      const event = {
        type: 'other' as const,
        raw: {
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', is_error: true, content: 'Error message' }
            ]
          }
        }
      }
      const log = agentEventToLog(event)
      expect(log).toMatchObject({
        level: 'warn',
        source: 'tool',
        message: 'Ошибка инструмента: Error message'
      })
    })

    it('maps exit code result to info level', () => {
      const event = {
        type: 'other' as const,
        raw: {
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', is_error: true, content: 'Exit code 1\ndefine(...)' }
            ]
          }
        }
      }
      const log = agentEventToLog(event)
      expect(log).toMatchObject({
        level: 'info',
        source: 'tool',
        message: 'Команда завершилась с кодом 1'
      })
    })

    it('maps successful tool result', () => {
      const event = {
        type: 'other' as const,
        raw: {
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', is_error: false, content: [{ type: 'text', text: 'ok' }] }
            ]
          }
        }
      }
      const log = agentEventToLog(event)
      expect(log).toMatchObject({
        level: 'info',
        source: 'tool',
        message: 'Результат инструмента',
        details: 'ok'
      })
    })

    it('maps result event with cost and turns', () => {
      const event = {
        type: 'result' as const,
        success: true,
        durationMs: 5000,
        totalCostUsd: 0.1234,
        numTurns: 3
      }
      const log = agentEventToLog(event)
      expect(log.message).toContain('$0.123')
      expect(log.message).toContain('шагов: 3')
    })
  })

  describe('buildBlocks', () => {
    it('groups consecutive tool/service entries into activity blocks', () => {
      const entries: ChatEntry[] = [
        { id: 'u1', role: 'user', content: 'test' },
        { id: 'a1', role: 'agent-text', content: 'response' },
        { id: 'a2', role: 'agent-tool', content: 'tool 1' },
        { id: 'a3', role: 'agent-tool', content: 'tool 2' },
        { id: 'a4', role: 'agent-other', content: 'service' },
        { id: 'a5', role: 'agent-text', content: 'more text' },
        { id: 'a6', role: 'agent-result', content: 'done' },
        { id: 'u2', role: 'user', content: 'next' },
        { id: 'a7', role: 'agent-text', content: 'final' }
      ]
      const blocks = buildBlocks(entries)
      expect(blocks.map((b) => b.kind)).toEqual(['user', 'text', 'activity', 'text', 'result', 'user', 'text'])
      const activityBlock = blocks[2]
      expect(activityBlock.kind).toBe('activity')
      if (activityBlock.kind === 'activity') {
        expect(activityBlock.items).toHaveLength(3)
      }
      const firstText = blocks[1]
      if (firstText.kind === 'text') {
        expect(firstText.showAvatar).toBe(true)
      }
      const secondText = blocks[3]
      if (secondText.kind === 'text') {
        expect(secondText.showAvatar).toBe(false)
      }
      const lastText = blocks[6]
      if (lastText.kind === 'text') {
        expect(lastText.showAvatar).toBe(true)
      }
    })
  })

  describe('isEntryVisible', () => {
    it('hides agent-other when showDebug is false', () => {
      const entry = { id: '1', role: 'agent-other' as const, content: 'test' }
      expect(isEntryVisible(entry, false)).toBe(false)
    })

    it('shows agent-other when showDebug is true', () => {
      const entry = { id: '1', role: 'agent-other' as const, content: 'test' }
      expect(isEntryVisible(entry, true)).toBe(true)
    })

    it('always shows other roles', () => {
      const userEntry = { id: '1', role: 'user' as const, content: 'test' }
      const toolEntry = { id: '2', role: 'agent-tool' as const, content: 'test' }
      expect(isEntryVisible(userEntry, false)).toBe(true)
      expect(isEntryVisible(toolEntry, false)).toBe(true)
    })
  })
})
