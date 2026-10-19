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
  parseChoices,
  formatChoiceAnswers,
  isPlanWithoutChoices,
  replayToEntries,
  type ChatEntry,
  type ChoiceQuestion,
  type ChoiceAnswer
} from '../src/renderer/src/chatFormat'
import type { ChatReplayItem } from '../src/shared/types'

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
      const result = describeToolCall('Grep', { pattern: 'GetValue', path: '/app/Resources' })
      expect(result).toBe('Ищет «GetValue» в Resources')
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

    it('describes the CRM database tool under both names', () => {
      expect(describeToolCall('crm_db_query', { sql: 'SELECT 1' })).toBe('Запрос к БД CRM')
      expect(describeToolCall('mcp__bpmsoft__crm_db_query', { sql: 'SELECT 1' })).toBe('Запрос к БД CRM')
    })

    it('describes the CRM stand actions under both names', () => {
      expect(describeToolCall('crm_update_from_fs', {})).toBe('Обновляет CRM из файловой системы')
      expect(describeToolCall('mcp__bpmsoft__crm_update_from_fs', {})).toBe('Обновляет CRM из файловой системы')
      expect(describeToolCall('crm_compile', {})).toBe('Компилирует и перезапускает CRM')
      expect(describeToolCall('mcp__bpmsoft__crm_compile', {})).toBe('Компилирует и перезапускает CRM')
      expect(describeToolCall('crm_action', { action: 'update' })).toBe('Действие в CRM')
    })
  })

  describe('CRM browser tools', () => {
    it('describes the browser tools in Russian, with or without the app prefix', () => {
      expect(describeToolCall('crm_browser_open', { path: '#SectionModuleV2/Contact/' })).toBe('Открывает страницу CRM #SectionModuleV2/Contact/')
      expect(describeToolCall('mcp__app__crm_browser_open', {})).toBe('Открывает страницу CRM')
      expect(describeToolCall('mcp__app__crm_browser_screenshot', {})).toBe('Делает снимок страницы CRM')
      expect(describeToolCall('crm_browser_text', {})).toBe('Читает текст страницы CRM')
      expect(describeToolCall('crm_browser_console', {})).toBe('Смотрит консоль браузера CRM')
      expect(describeToolCall('crm_browser_network', {})).toBe('Смотрит сетевые запросы CRM')
    })

    it('describes a click by selector or by text', () => {
      expect(describeToolCall('crm_browser_click', { selector: '#btn' })).toBe('Нажимает в CRM #btn')
      expect(describeToolCall('mcp__app__crm_browser_click', { text: 'Сохранить' })).toBe('Нажимает в CRM Сохранить')
      expect(describeToolCall('crm_browser_click', {})).toBe('Нажимает в CRM')
    })

    it('shows the click action as the permission subject', () => {
      expect(permissionSubject('crm_browser_click', { action: 'Клик в CRM: «Сохранить»' })).toBe('Клик в CRM: «Сохранить»')
    })
  })

  describe('permissionSubject', () => {
    it('returns sql for the CRM database tool under both names', () => {
      expect(permissionSubject('crm_db_query', { sql: 'SELECT 1' })).toBe('SELECT 1')
      expect(permissionSubject('mcp__bpmsoft__crm_db_query', { sql: 'SELECT 2' })).toBe('SELECT 2')
    })

    it('returns undefined for the CRM database tool without sql', () => {
      expect(permissionSubject('crm_db_query', {})).toBeUndefined()
    })

    it('returns the action for the CRM stand action tool', () => {
      expect(permissionSubject('crm_action', { action: 'compile' })).toBe('compile')
      expect(permissionSubject('crm_action', {})).toBeUndefined()
    })

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

    it('maps a stopped result to a warning that starts with the stop note', () => {
      const event = { type: 'result' as const, success: false, stopped: true, durationMs: 4000 }
      const entry = mapAgentEventToEntry(event)
      expect(entry).toMatchObject({ role: 'agent-result', level: 'warn' })
      expect(entry.content.startsWith('Остановлено пользователем')).toBe(true)
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

  describe('isPlanWithoutChoices', () => {
    it('returns true for text with AC and DoD in Дано-То format without colon', () => {
      const text = `## План

- **AC-1.** Дано начальное состояние. Когда пользователь нажимает. То конечное состояние

- **DoD-1.** Дано та же компиляция. Когда ... То результат`
      expect(isPlanWithoutChoices(text)).toBe(true)
    })

    it('returns true for real plan with Дано without colon and risk note', () => {
      const text = `### Критерии приёмки
- **AC-1.** Дано обращение в реестре выбрано. Когда пользователь нажимает «Проверить». То показывается итог проверки.
- **DoD-1.** Дано пакет обновлён из файловой системы и скомпилирован. Когда открыт процесс. То сборка итога — метод процесса.
**Риск:** чтение параметров через Get.`
      expect(isPlanWithoutChoices(text)).toBe(true)
    })

    it('returns false when text contains <choices> block', () => {
      const text = `## План

- **AC-1.** Дано: test, То: test

- **DoD-1.** Дано: test, То: test

<choices>
? Question
- Option
</choices>`
      expect(isPlanWithoutChoices(text)).toBe(false)
    })

    it('returns false for final report without Дано in AC', () => {
      const text = `## Результаты

**AC-1, AC-2.** Сохраните изменения в CRM

- **DoD-1.** Дано: проверка, То: сохранено`
      expect(isPlanWithoutChoices(text)).toBe(false)
    })

    it('returns false when text contains knowledge notes header', () => {
      const text = `## План

- **AC-1.** Дано: test, То: test

- **DoD-1.** Дано: test, То: test

**Наблюдения для базы знаний**`
      expect(isPlanWithoutChoices(text)).toBe(false)
    })

    it('returns false when AC or DoD are missing', () => {
      const text = `## План

- **AC-1.** Дано: test, То: test`
      expect(isPlanWithoutChoices(text)).toBe(false)
    })

    it('returns false when only AC-n format without Дано', () => {
      const text = `## План

- **AC-1.** Something without any acceptance criteria marker

- **DoD-1.** Дано: test, То: test`
      expect(isPlanWithoutChoices(text)).toBe(false)
    })

    it('returns true for plan with multiple AC and DoD criteria', () => {
      const text = `## План

- **AC-1.** Дано: состояние A, То: состояние B
- **AC-2.** Дано: состояние C, То: состояние D

- **DoD-1.** Дано: проверка 1, То: результат 1
- **DoD-2.** Дано: проверка 2, То: результат 2`
      expect(isPlanWithoutChoices(text)).toBe(true)
    })

    it('returns false for knowledge notes case-insensitive', () => {
      const text = `## План

- **AC-1.** Дано: test, То: test

- **DoD-1.** Дано: test, То: test

НАБЛЮДЕНИЯ ДЛЯ БАЗЫ ЗНАНИЙ`
      expect(isPlanWithoutChoices(text)).toBe(false)
    })
  })

  describe('parseChoices and formatChoiceAnswers', () => {
    it('parseChoices returns null without block', () => {
      const result = parseChoices('Some text without choices')
      expect(result).toBeNull()
    })

    it('parseChoices returns null with empty block', () => {
      const result = parseChoices('<choices>\n\n</choices>')
      expect(result).toBeNull()
    })

    it('parseChoices parses single ? question with mixed options', () => {
      const text = `<choices>
? Which option?
- First option
* Second option (preselected)
- Third option
</choices>`
      const result = parseChoices(text)
      expect(result).not.toBeNull()
      expect(result!.questions).toHaveLength(1)
      const q = result!.questions[0]
      expect(q.text).toBe('Which option?')
      expect(q.multi).toBe(false)
      expect(q.options).toHaveLength(3)
      expect(q.options[0]).toEqual({ text: 'First option', preselected: false })
      expect(q.options[1]).toEqual({ text: 'Second option (preselected)', preselected: true })
      expect(q.options[2]).toEqual({ text: 'Third option', preselected: false })
    })

    it('parseChoices parses ?* multi-select question', () => {
      const text = `<choices>
?* Select multiple options:
- Option A
- Option B
* Option C (preselected)
</choices>`
      const result = parseChoices(text)
      expect(result).not.toBeNull()
      expect(result!.questions).toHaveLength(1)
      const q = result!.questions[0]
      expect(q.text).toBe('Select multiple options:')
      expect(q.multi).toBe(true)
      expect(q.options).toHaveLength(3)
    })

    it('parseChoices handles continuation lines in question text', () => {
      const text = `<choices>
? This is a question
that spans multiple lines
and continues here
- Option 1
- Option 2
</choices>`
      const result = parseChoices(text)
      expect(result).not.toBeNull()
      expect(result!.questions).toHaveLength(1)
      const q = result!.questions[0]
      expect(q.text).toBe('This is a question that spans multiple lines and continues here')
      expect(q.options).toHaveLength(2)
    })

    it('parseChoices uses LAST block when multiple exist', () => {
      const text = `<choices>
? First block question
- Option 1
</choices>
Some text between blocks
<choices>
? Second block question
- Option A
- Option B
</choices>`
      const result = parseChoices(text)
      expect(result).not.toBeNull()
      expect(result!.questions).toHaveLength(1)
      expect(result!.questions[0].text).toBe('Second block question')
      expect(result!.questions[0].options).toHaveLength(2)
    })

    it('parseChoices returns before and after text trimmed', () => {
      const text = `  Some text before
<choices>
? A question
- An option
</choices>
  Some text after  `
      const result = parseChoices(text)
      expect(result).not.toBeNull()
      expect(result!.before).toBe('Some text before')
      expect(result!.after).toBe('Some text after')
    })

    it('formatChoiceAnswers: single question with single option returns option text', () => {
      const questions: ChoiceQuestion[] = [
        {
          text: 'Pick one',
          multi: false,
          options: [
            { text: 'Option A', preselected: false },
            { text: 'Option B', preselected: false }
          ]
        }
      ]
      const answers: ChoiceAnswer[] = [
        {
          selected: ['Option A'],
          custom: ''
        }
      ]
      const result = formatChoiceAnswers(questions, answers)
      expect(result).toBe('Option A')
    })

    it('formatChoiceAnswers: single question with only custom text', () => {
      const questions: ChoiceQuestion[] = [
        {
          text: 'What is your answer?',
          multi: false,
          options: [
            { text: 'Predefined A', preselected: false },
            { text: 'Predefined B', preselected: false }
          ]
        }
      ]
      const answers: ChoiceAnswer[] = [
        {
          selected: [],
          custom: 'My custom answer'
        }
      ]
      const result = formatChoiceAnswers(questions, answers)
      expect(result).toBe('My custom answer')
    })

    it('formatChoiceAnswers: multiple questions with formatted output', () => {
      const questions: ChoiceQuestion[] = [
        {
          text: 'First question?',
          multi: false,
          options: [
            { text: 'Yes', preselected: false },
            { text: 'No', preselected: false }
          ]
        },
        {
          text: 'Second question?',
          multi: true,
          options: [
            { text: 'Option 1', preselected: false },
            { text: 'Option 2', preselected: false }
          ]
        }
      ]
      const answers: ChoiceAnswer[] = [
        {
          selected: ['Yes'],
          custom: ''
        },
        {
          selected: ['Option 1', 'Option 2'],
          custom: 'extra info'
        }
      ]
      const result = formatChoiceAnswers(questions, answers)
      expect(result).toBe('1. First question? — Yes\n2. Second question? — Option 1; Option 2; свой ответ: extra info')
    })

    it('formatChoiceAnswers: unanswered question shows "без ответа"', () => {
      const questions: ChoiceQuestion[] = [
        {
          text: 'Question?',
          multi: false,
          options: [
            { text: 'Option A', preselected: false },
            { text: 'Option B', preselected: false }
          ]
        }
      ]
      const answers: ChoiceAnswer[] = [
        {
          selected: [],
          custom: ''
        }
      ]
      const result = formatChoiceAnswers(questions, answers)
      expect(result).toBe('1. Question? — — без ответа')
    })
  })
})

describe('describeToolCall pkg_lint', () => {
  it('describes the pkg_lint tool with and without the app prefix', () => {
    expect(describeToolCall('mcp__app__pkg_lint', {})).toBe('Проверяет изменённые схемы (pkg_lint)')
    expect(describeToolCall('pkg_lint', {})).toBe('Проверяет изменённые схемы (pkg_lint)')
  })

  describe('replayToEntries', () => {
    it('keeps order and timestamps', () => {
      const userTs = '2026-10-19T10:00:00.000Z'
      const agentTs = '2026-10-19T10:00:05.000Z'
      const items = [
        { kind: 'user', ts: userTs, text: 'опиши' },
        { kind: 'agent', ts: agentTs, event: { type: 'text', text: 'ответ' } }
      ] as ChatReplayItem[]
      const entries = replayToEntries(items)
      expect(entries.map((entry) => entry.role)).toEqual(['user', 'agent-text'])
      expect(entries[0].content).toBe('опиши')
      expect(entries[1].content).toBe('ответ')
      expect(entries[0].ts).toBe(Date.parse(userTs))
      expect(entries[1].ts).toBe(Date.parse(agentTs))
    })
  })
})
