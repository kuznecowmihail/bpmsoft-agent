import { describe, it, expect } from 'vitest'
import { CrmBrowserLog, resolveCrmUrl, isSameOrigin } from '../src/main/crmBrowserLog'

const BASE = 'http://localhost:8007'

describe('resolveCrmUrl', () => {
  it('empty path opens the main page', () => {
    expect(resolveCrmUrl(BASE, '')).toBe('http://localhost:8007/Nui/ViewModule.aspx')
    expect(resolveCrmUrl(BASE)).toBe('http://localhost:8007/Nui/ViewModule.aspx')
  })

  it('hash path is attached to the main page', () => {
    expect(resolveCrmUrl(BASE, '#SectionModuleV2/Contact/')).toBe('http://localhost:8007/Nui/ViewModule.aspx#SectionModuleV2/Contact/')
  })

  it('path with and without leading slash is attached to the base', () => {
    expect(resolveCrmUrl(BASE, '/a')).toBe('http://localhost:8007/a')
    expect(resolveCrmUrl(BASE, 'a')).toBe('http://localhost:8007/a')
  })

  it('trailing slash of the base is removed', () => {
    expect(resolveCrmUrl('http://localhost:8007/', '/a')).toBe('http://localhost:8007/a')
    expect(resolveCrmUrl('http://localhost:8007/', '')).toBe('http://localhost:8007/Nui/ViewModule.aspx')
  })

  it('absolute address of the same origin is allowed', () => {
    expect(resolveCrmUrl(BASE, 'http://localhost:8007/Nui/ViewModule.aspx#CardModuleV2/X/edit/1')).toBe(
      'http://localhost:8007/Nui/ViewModule.aspx#CardModuleV2/X/edit/1'
    )
  })

  it('absolute address of another origin is rejected', () => {
    expect(() => resolveCrmUrl(BASE, 'http://evil.example.test/page')).toThrow('Можно открывать только адрес CRM из настроек')
  })
})

describe('isSameOrigin', () => {
  it('compares scheme, host and port', () => {
    expect(isSameOrigin('http://localhost:8007/a?b=1', BASE)).toBe(true)
    expect(isSameOrigin('http://localhost:8008/a', BASE)).toBe(false)
    expect(isSameOrigin('https://localhost:8007/a', BASE)).toBe(false)
    expect(isSameOrigin('http://other.test/a', BASE)).toBe(false)
  })

  it('returns false on parse errors', () => {
    expect(isSameOrigin('not a url', BASE)).toBe(false)
    expect(isSameOrigin(BASE, 'also not a url')).toBe(false)
  })
})

describe('CrmBrowserLog console', () => {
  it('keeps console errors from consoleAPICalled with source and text of arguments', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Runtime.consoleAPICalled', {
      type: 'error',
      args: [{ value: 'Ошибка' }, { value: 42 }, { description: 'Object' }],
      stackTrace: { callFrames: [{ url: 'http://localhost:8007/app.js', lineNumber: 9 }] }
    })
    expect(log.counts().consoleErrors).toBe(1)
    expect(log.consoleText(true)).toBe('Сообщений консоли: 1, ошибок: 1\n[error] Ошибка 42 Object (http://localhost:8007/app.js:10)')
  })

  it('maps assert to error, warning to warning and the rest to info', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Runtime.consoleAPICalled', { type: 'assert', args: [{ value: 'a' }] })
    log.onCdpEvent('Runtime.consoleAPICalled', { type: 'warning', args: [{ value: 'w' }] })
    log.onCdpEvent('Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'l' }] })
    expect(log.counts().consoleErrors).toBe(1)
    expect(log.consoleText(false)).toBe('Сообщений консоли: 3, ошибок: 1\n[error] a\n[warning] w\n[info] l')
    expect(log.consoleText(true)).toBe('Сообщений консоли: 3, ошибок: 1\n[error] a')
  })

  it('records uncaught exceptions with the exception description', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Runtime.exceptionThrown', {
      exceptionDetails: {
        text: 'Uncaught',
        exception: { description: 'TypeError: x is undefined' },
        url: 'http://localhost:8007/a.js',
        lineNumber: 0
      }
    })
    expect(log.consoleText(true)).toBe('Сообщений консоли: 1, ошибок: 1\n[error] TypeError: x is undefined (http://localhost:8007/a.js:1)')
  })

  it('collapses consecutive identical messages into one line with a counter', () => {
    const log = new CrmBrowserLog()
    for (let i = 0; i < 3; i++) {
      log.onCdpEvent('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'same' }] })
    }
    log.onCdpEvent('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'other' }] })
    log.onCdpEvent('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'same' }] })
    expect(log.consoleText(true)).toBe('Сообщений консоли: 5, ошибок: 5\n[error] same ×3\n[error] other\n[error] same')
  })

  it('reports an empty journal and clear() resets it', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'x' }] })
    log.clear()
    expect(log.consoleText(true)).toBe('Сообщений консоли: 0, ошибок: 0\nПусто')
  })

  it('cuts long texts to 500 characters', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'x'.repeat(600) }] })
    const line = log.consoleText(true).split('\n')[1]
    expect(line).toBe(`[error] ${'x'.repeat(500)}…`)
  })

  it('maps Log.entryAdded levels', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Log.entryAdded', { entry: { level: 'error', text: 'Failed to load', url: 'http://localhost:8007/x' } })
    log.onCdpEvent('Log.entryAdded', { entry: { level: 'verbose', text: 'v' } })
    expect(log.counts().consoleErrors).toBe(1)
    expect(log.consoleText(false)).toContain('[error] Failed to load (http://localhost:8007/x)')
    expect(log.consoleText(false)).toContain('[info] v')
  })
})

describe('CrmBrowserLog network', () => {
  const request = (id: string, url: string, timestamp = 100, type = 'XHR') =>
    ({ requestId: id, request: { url, method: 'POST' }, type, timestamp })

  it('shows a 500 response with its body in the failed list', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'http://localhost:8007/ServiceModel/Svc.svc/Save?x=1', 100))
    log.onCdpEvent('Network.responseReceived', { requestId: '1', response: { status: 500 } })
    expect(log.needsBody('1')).toBe(true)
    log.setBody('1', '{ "Message":   "Ошибка\n сервера" }')
    log.onCdpEvent('Network.loadingFinished', { requestId: '1', timestamp: 100.25 })

    expect(log.counts().failedRequests).toBe(1)
    const text = log.networkText({ onlyFailed: true })
    expect(text).toContain('Запросов: 1, с ошибкой: 1')
    expect(text).toContain('POST 500 /ServiceModel/Svc.svc/Save?x=1 (250 мс)')
    expect(text).toContain('ответ: { "Message": "Ошибка сервера" }')
  })

  it('requests the body only once and only for error responses', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'http://localhost:8007/a'))
    log.onCdpEvent('Network.responseReceived', { requestId: '1', response: { status: 200 } })
    expect(log.needsBody('1')).toBe(false)

    log.onCdpEvent('Network.requestWillBeSent', request('2', 'http://localhost:8007/b'))
    log.onCdpEvent('Network.responseReceived', { requestId: '2', response: { status: 404 } })
    expect(log.needsBody('2')).toBe(true)
    expect(log.needsBody('2')).toBe(false)
  })

  it('excludes a 200 response when only failed requests are listed', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'http://localhost:8007/ok'))
    log.onCdpEvent('Network.responseReceived', { requestId: '1', response: { status: 200 } })
    log.onCdpEvent('Network.loadingFinished', { requestId: '1', timestamp: 101 })

    expect(log.networkText({ onlyFailed: true })).toBe('Запросов: 1, с ошибкой: 0\nПусто')
    expect(log.networkText({ onlyFailed: false })).toContain('POST 200 /ok (1000 мс)')
  })

  it('filters by a substring of the address', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'http://localhost:8007/ServiceModel/A.svc'))
    log.onCdpEvent('Network.responseReceived', { requestId: '1', response: { status: 500 } })
    log.onCdpEvent('Network.requestWillBeSent', request('2', 'http://localhost:8007/Other/B.svc'))
    log.onCdpEvent('Network.responseReceived', { requestId: '2', response: { status: 500 } })

    const text = log.networkText({ onlyFailed: true, filter: 'Other' })
    expect(text).toContain('/Other/B.svc')
    expect(text).not.toContain('/ServiceModel/A.svc')
  })

  it('treats a canceled request as not failed and a network error as failed', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'http://localhost:8007/c'))
    log.onCdpEvent('Network.loadingFailed', { requestId: '1', errorText: 'net::ERR_ABORTED', canceled: true, timestamp: 101 })
    log.onCdpEvent('Network.requestWillBeSent', request('2', 'http://localhost:8007/d'))
    log.onCdpEvent('Network.loadingFailed', { requestId: '2', errorText: 'net::ERR_CONNECTION_REFUSED', canceled: false, timestamp: 101 })

    expect(log.counts().failedRequests).toBe(1)
    expect(log.networkText({ onlyFailed: true })).toContain('ERR /d (1000 мс) — net::ERR_CONNECTION_REFUSED')
  })

  it('ignores data: and blob: addresses', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'data:text/plain,hi'))
    log.onCdpEvent('Network.requestWillBeSent', request('2', 'blob:http://localhost:8007/uuid'))
    expect(log.networkText({ onlyFailed: false })).toBe('Запросов: 0, с ошибкой: 0\nПусто')
  })

  it('a redirect with the same request id only updates the address', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'http://localhost:8007/old'))
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'http://localhost:8007/new'))
    expect(log.networkText({ onlyFailed: false })).toContain('/new')
    expect(log.networkText({ onlyFailed: false })).toContain('Запросов: 1')
  })

  it('pendingCount ignores WebSocket, EventSource and stale entries', () => {
    const log = new CrmBrowserLog()
    const now = Date.now()
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'http://localhost:8007/fresh'))
    log.onCdpEvent('Network.requestWillBeSent', request('2', 'ws://localhost:8007/socket', 100, 'WebSocket'))
    log.onCdpEvent('Network.requestWillBeSent', request('3', 'http://localhost:8007/sse', 100, 'EventSource'))
    log.onCdpEvent('Network.requestWillBeSent', request('4', 'http://localhost:8007/poll'))
    log.onCdpEvent('Network.loadingFinished', { requestId: '4', timestamp: 101 })

    expect(log.pendingCount(now)).toBe(1)
    expect(log.pendingCount(now + 20_000)).toBe(0)
  })

  it('pendingCount ignores a long poll started more than 10 s ago', () => {
    const log = new CrmBrowserLog()
    log.onCdpEvent('Network.requestWillBeSent', request('1', 'http://localhost:8007/poll'))
    const seenAt = Date.now()
    expect(log.pendingCount(seenAt + 9_000)).toBe(1)
    expect(log.pendingCount(seenAt + 11_000)).toBe(0)
  })
})
