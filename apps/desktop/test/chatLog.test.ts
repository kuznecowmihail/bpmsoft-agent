import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import {
  initChatLog,
  getChatLogDir,
  startChatLogIfNeeded,
  endChatLog,
  getCurrentChatLogPath,
  getCurrentChatId,
  reopenChatLog,
  logChatRecord,
  truncateDeep,
  extractKnowledgeNotes
} from '../src/main/chatLog'

describe('chatLog', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatlog-'))
    initChatLog(tempDir)
  })

  afterEach(() => {
    endChatLog()
  })

  describe('initChatLog and getChatLogDir', () => {
    it('sets and returns the log directory', () => {
      const dir = '/tmp/test-logs'
      initChatLog(dir)
      expect(getChatLogDir()).toBe(dir)
    })

    it('resets current state', () => {
      initChatLog(tempDir)
      startChatLogIfNeeded({ projectPath: '/proj' })
      expect(getCurrentChatLogPath()).toBeDefined()
      initChatLog(tempDir)
      expect(getCurrentChatLogPath()).toBeUndefined()
    })
  })

  describe('reopenChatLog', () => {
    it('reopenChatLog appends to the same file', () => {
      startChatLogIfNeeded({ projectPath: '/proj' })
      const jsonlPath = getCurrentChatLogPath()!
      endChatLog()
      reopenChatLog(jsonlPath, '/proj')
      expect(getCurrentChatLogPath()).toBe(jsonlPath)
      logChatRecord('user_message', { text: 'продолжим' })
      const jsonlFiles = readdirSync(dirname(jsonlPath)).filter((name) => name.endsWith('.jsonl'))
      expect(jsonlFiles).toHaveLength(1)
      expect(readFileSync(jsonlPath, 'utf-8')).toContain('продолжим')
    })

    it('getCurrentChatId returns the id of the reopened chat', () => {
      startChatLogIfNeeded({ projectPath: '/proj' })
      const jsonlPath = getCurrentChatLogPath()!
      endChatLog()
      reopenChatLog(jsonlPath, '/proj')
      const id = getCurrentChatId()
      expect(id).toBeDefined()
      expect(id!.split('/')).toHaveLength(2)
      expect(id!.endsWith('.jsonl')).toBe(false)
    })

    it('getCurrentChatId is undefined without an open chat', () => {
      expect(getCurrentChatId()).toBeUndefined()
    })
  })

  describe('startChatLogIfNeeded', () => {
    it('is a no-op before initChatLog', () => {
      const dir = mkdtempSync(join(tmpdir(), 'chatlog-'))
      endChatLog()
      initChatLog(undefined)
      startChatLogIfNeeded({ projectPath: '/proj' })
      expect(getCurrentChatLogPath()).toBeUndefined()
    })

    it('is a no-op if already started', () => {
      startChatLogIfNeeded({ projectPath: '/proj' })
      const path1 = getCurrentChatLogPath()
      startChatLogIfNeeded({ projectPath: '/proj' })
      const path2 = getCurrentChatLogPath()
      expect(path1).toBe(path2)
    })

    it('creates chats directory and files', () => {
      startChatLogIfNeeded({ projectPath: '/proj/path' })
      const logsPath = getCurrentChatLogPath()
      expect(logsPath).toBeDefined()
      const content = readFileSync(logsPath!, 'utf-8')
      expect(content).toContain('chat_start')
    })

    it('creates different files when second started after end', (done) => {
      startChatLogIfNeeded({ projectPath: '/proj' })
      const path1 = getCurrentChatLogPath()!
      endChatLog()
      setTimeout(() => {
        startChatLogIfNeeded({ projectPath: '/proj' })
        const path2 = getCurrentChatLogPath()!
        expect(path1).not.toBe(path2)
        done()
      }, 1000)
    })
  })

  describe('logChatRecord', () => {
    it('is a no-op before start', () => {
      endChatLog()
      logChatRecord('user_message', { text: 'hello' })
      // Should not throw
      expect(true).toBe(true)
    })

    it('writes JSONL and Markdown', () => {
      startChatLogIfNeeded({ projectPath: '/proj' })
      logChatRecord('user_message', { text: 'hello' })
      logChatRecord('agent_event', { event: { type: 'text', text: 'world' } })

      const jsonlPath = getCurrentChatLogPath()!
      const mdPath = jsonlPath.replace('.jsonl', '.md')
      const jsonl = readFileSync(jsonlPath, 'utf-8').split('\n').filter((l) => l)
      const md = readFileSync(mdPath, 'utf-8')

      expect(jsonl).toHaveLength(3) // chat_start, user_message, agent_event
      expect(jsonl[0]).toContain('chat_start')
      expect(jsonl[1]).toContain('user_message')
      expect(jsonl[2]).toContain('agent_event')

      expect(md).toContain('## Вы')
      expect(md).toContain('hello')
      expect(md).toContain('## Агент')
      expect(md).toContain('world')
    })

    it('handles knowledge notes in agent text', () => {
      startChatLogIfNeeded({ projectPath: '/proj' })
      logChatRecord('agent_event', {
        event: {
          type: 'text',
          text: 'Here is content\n## Наблюдения для базы знаний\n- факт 1\n- факт 2'
        }
      })

      const knowledgeFile = join(tempDir, 'knowledge-notes.md')
      const content = readFileSync(knowledgeFile, 'utf-8')
      expect(content).toContain('- факт 1')
      expect(content).toContain('- факт 2')
    })

    it('does not create knowledge-notes for text without observations', () => {
      const knowledgeFile = join(tempDir, 'knowledge-notes.md')
      startChatLogIfNeeded({ projectPath: '/proj' })
      logChatRecord('agent_event', { event: { type: 'text', text: 'just text' } })
      expect(() => readFileSync(knowledgeFile, 'utf-8')).toThrow()
    })
  })

  describe('truncateDeep', () => {
    it('leaves short strings unchanged', () => {
      const result = truncateDeep({ text: 'hello' })
      expect(result).toEqual({ text: 'hello' })
    })

    it('truncates long strings with marker', () => {
      const longStr = 'x'.repeat(25000)
      const result = truncateDeep({ text: longStr })
      const truncated = (result as any).text
      expect(truncated).toContain('обрезано')
      expect(truncated.length).toBeLessThan(longStr.length)
    })

    it('handles nested arrays and objects', () => {
      const deep = {
        level1: {
          level2: ['a', 'b', { level3: 'nested' }]
        }
      }
      const result = truncateDeep(deep)
      expect(result).toEqual(deep)
    })

    it('truncates nested long strings', () => {
      const longStr = 'x'.repeat(25000)
      const nested = {
        outer: {
          inner: [{ text: longStr }]
        }
      }
      const result = truncateDeep(nested)
      const innerText = (result as any).outer.inner[0].text
      expect(innerText).toContain('обрезано')
    })
  })

  describe('extractKnowledgeNotes', () => {
    it('returns null when heading is absent', () => {
      const result = extractKnowledgeNotes('just text')
      expect(result).toBeNull()
    })

    it('returns null when heading exists but no content after', () => {
      const result = extractKnowledgeNotes('text\n## Наблюдения для базы знаний')
      expect(result).toBeNull()
    })

    it('returns content when heading has text after', () => {
      const text = 'intro\n## Наблюдения для базы знаний\n- факт 1\n- факт 2'
      const result = extractKnowledgeNotes(text)
      expect(result).toContain('- факт 1')
      expect(result).toContain('- факт 2')
    })

    it('is case-insensitive', () => {
      const text = 'intro\n## НАБЛЮДЕНИЯ ДЛЯ БАЗЫ ЗНАНИЙ\n- факт 1'
      const result = extractKnowledgeNotes(text)
      expect(result).toContain('- факт 1')
    })

    it('finds heading anywhere in text', () => {
      const text = 'line 1\nline 2\n## наблюдения для базы знаний\n- fact'
      const result = extractKnowledgeNotes(text)
      expect(result).toContain('- fact')
      expect(result).not.toContain('line 1')
    })

    it('stops before the <choices> block', () => {
      const text =
        'Итог\n\n**Наблюдения для базы знаний**\n- факт 1\n- факт 2\n\n<choices>\n? Обновить CRM сейчас?\n* Обнови\n</choices>'
      const result = extractKnowledgeNotes(text)
      expect(result).toBe('**Наблюдения для базы знаний**\n- факт 1\n- факт 2')
    })

    it('returns null when only <choices> follows the heading', () => {
      const text = 'Итог\n\n**Наблюдения для базы знаний**\n\n<choices>\n? Обновить CRM сейчас?\n* Обнови\n</choices>'
      expect(extractKnowledgeNotes(text)).toBeNull()
    })
  })

  describe('renderMarkdown', () => {
    it('is a simple integration smoke test', () => {
      startChatLogIfNeeded({ projectPath: '/test/proj' })
      logChatRecord('user_message', { text: 'User asked something' })
      logChatRecord('agent_event', { event: { type: 'text', text: 'Agent responded' } })
      logChatRecord('error', { message: 'Something went wrong' })

      const mdPath = getCurrentChatLogPath()!.replace('.jsonl', '.md')
      const md = readFileSync(mdPath, 'utf-8')

      expect(md).toContain('## Вы')
      expect(md).toContain('User asked something')
      expect(md).toContain('## Агент')
      expect(md).toContain('Agent responded')
      expect(md).toContain('**Ошибка:**')
    })

    it('renders exit code tool result with return symbol', () => {
      startChatLogIfNeeded({ projectPath: '/test/proj' })
      logChatRecord('agent_event', {
        event: {
          type: 'other',
          raw: {
            type: 'user',
            message: {
              content: [
                { type: 'tool_result', is_error: true, content: 'Exit code 1\nNo matches found' }
              ]
            }
          }
        }
      })

      const mdPath = getCurrentChatLogPath()!.replace('.jsonl', '.md')
      const md = readFileSync(mdPath, 'utf-8')

      expect(md).toContain('↩︎ Команда завершилась с кодом 1:')
      expect(md).not.toContain('⚠️ Ошибка инструмента')
    })

    it('renders a database query record with row count', () => {
      startChatLogIfNeeded({ projectPath: '/test/proj' })
      logChatRecord('db_query', { sql: 'SELECT Id FROM Contact', rowCount: 3, truncated: false, durationMs: 12 })

      const mdPath = getCurrentChatLogPath()!.replace('.jsonl', '.md')
      const md = readFileSync(mdPath, 'utf-8')

      expect(md).toContain('🗄 Запрос к БД')
      expect(md).toContain('3 строк')
    })

    it('renders CRM stand actions: success, denied and failure', () => {
      startChatLogIfNeeded({ projectPath: '/test/proj' })
      logChatRecord('crm_action', { action: 'update', success: true, durationMs: 4200, summary: 'ok' })
      logChatRecord('crm_action', { action: 'compile', success: false, denied: true, durationMs: 0, summary: '' })
      logChatRecord('crm_action', { action: 'compile', success: false, durationMs: 900, summary: '', error: 'Сборка не прошла' })

      const mdPath = getCurrentChatLogPath()!.replace('.jsonl', '.md')
      const md = readFileSync(mdPath, 'utf-8')

      expect(md).toContain('Обновление CRM из файловой системы → успешно · 4 с')
      expect(md).toContain('Компиляция и перезапуск CRM → отклонено пользователем')
      expect(md).toContain('Компиляция и перезапуск CRM → ⚠️ Сборка не прошла')
    })

    it('renders a stopped turn as stopped by the user, not as an error', () => {
      startChatLogIfNeeded({ projectPath: '/test/proj' })
      logChatRecord('agent_event', { event: { type: 'result', success: false, stopped: true, durationMs: 4000 } })

      const md = readFileSync(getCurrentChatLogPath()!.replace('.jsonl', '.md'), 'utf-8')
      expect(md).toContain('Ход остановлен пользователем')
      expect(md).not.toContain('с ошибкой')
    })
  })

  describe('crm browser and images', () => {
    it('replaces base64 image data with its size in the JSON log', () => {
      startChatLogIfNeeded({ projectPath: '/test/proj' })
      const data = 'A'.repeat(5000)
      logChatRecord('agent_event', {
        event: {
          type: 'other',
          raw: { type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }] }] } }
        }
      })
      logChatRecord('agent_event', { event: { type: 'other', raw: { type: 'image', data: 'B'.repeat(300), mimeType: 'image/jpeg' } } })

      const jsonl = readFileSync(getCurrentChatLogPath()!, 'utf-8')
      expect(jsonl).not.toContain('AAAAAAAAAA')
      expect(jsonl).not.toContain('BBBBBBBBBB')
      expect(jsonl).toContain('<изображение: 5000 символов base64>')
      expect(jsonl).toContain('<изображение: 300 символов base64>')
    })

    it('keeps short image data unchanged', () => {
      expect(truncateDeep({ type: 'image', data: 'short' })).toEqual({ type: 'image', data: 'short' })
    })

    it('renders CRM browser calls: success and failure', () => {
      startChatLogIfNeeded({ projectPath: '/test/proj' })
      logChatRecord('crm_browser', { tool: 'crm_browser_open', detail: '#SectionModuleV2/Test/', success: true, durationMs: 1234 })
      logChatRecord('crm_browser', { tool: 'crm_browser_click', detail: 'Сохранить', success: false, durationMs: 10, error: 'Пользователь отклонил клик' })

      const md = readFileSync(getCurrentChatLogPath()!.replace('.jsonl', '.md'), 'utf-8')
      expect(md).toContain('- 🌐 Браузер CRM: crm_browser_open #SectionModuleV2/Test/ → ok · 1234 мс')
      expect(md).toContain('- 🌐 Браузер CRM: crm_browser_click Сохранить → ⚠️ Пользователь отклонил клик')
    })
  })
})
