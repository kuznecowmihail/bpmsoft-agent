import { BrowserWindow, WebContentsView, session } from 'electron'
import { errorMessage } from '@bpmsoft-agent/agent-runtime'
import type { AppTool, AppToolResult, CrmConnection } from '@bpmsoft-agent/agent-runtime'
import { CrmBrowserLog, isSameOrigin, resolveCrmUrl } from './crmBrowserLog'
import type { CrmBrowserState } from '../shared/types'

/**
 * Built-in CRM browser of the agent: a WebContentsView in the right-side panel of the main window,
 * with its own in-memory session. The agent reads pages (text, screenshot, console, network) and clicks
 * for navigation only; clicks are confirmed by the user when confirmations are on.
 */

export interface CrmBrowserRecord { tool: string; detail?: string; success: boolean; durationMs: number; error?: string }
export interface CrmBrowserOptions { connection: CrmConnection; confirm?: (action: string) => Promise<boolean>; onAction?: (record: CrmBrowserRecord) => void }

const PARTITION = 'crm-agent-browser'
const MAX_SCREENSHOT_WIDTH = 1280
const MAX_TEXT_LENGTH = 15000
const UNREACHABLE_HINT = /CRM недоступна|Вход в CRM/

let host: BrowserWindow | undefined
let view: WebContentsView | undefined
let bounds = { x: 0, y: 0, width: 0, height: 0 }
let panelVisible = false
let lastConnection: CrmConnection | undefined
const log = new CrmBrowserLog()
let loggedInFor: string | undefined
/** Options of the current turn; set by createCrmBrowserTools, read by the tools. */
let current: CrmBrowserOptions | undefined
/** Set after a schema update through the CRM tools: the next open clears the browser cache. */
let cacheStale = false

export function markCrmBrowserStale(): void {
  cacheStale = true
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Rejects with `message` when `promise` does not settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function baseOf(connection: CrmConnection): string {
  return connection.url.replace(/\/+$/, '')
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** The panel shows the page: the user keeps it open and it has a size. */
function panelShown(): boolean {
  return panelVisible && bounds.width > 0 && bounds.height > 0
}

function applyVisibility(): void {
  view?.setVisible(panelShown())
}

function sendState(): void {
  const wc = view?.webContents
  if (!wc || wc.isDestroyed() || !host || host.isDestroyed()) {
    return
  }
  const state: CrmBrowserState = { url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), hasPage: true }
  host.webContents.send('crmBrowser:state', state)
}

/** Tells the renderer that the agent uses the browser, so it opens the panel. */
/** Tells the renderer that there is no page any more, so the panel shows its empty state. */
function sendEmptyState(): void {
  if (!host || host.isDestroyed()) {
    return
  }
  const state: CrmBrowserState = { url: '', title: '', loading: false, hasPage: false }
  host.webContents.send('crmBrowser:state', state)
}

function notifyActivity(): void {
  if (host && !host.isDestroyed()) {
    host.webContents.send('crmBrowser:activity')
  }
}

/** Waits until the panel is open and has a size, or the timeout passes. */
async function waitForPanel(ms = 1500): Promise<void> {
  const deadline = Date.now() + ms
  while (!panelShown() && Date.now() < deadline) {
    await sleep(100)
  }
}

export function attachCrmBrowserHost(window: BrowserWindow): void {
  host = window
}

export function setCrmBrowserBounds(b: { x: number; y: number; width: number; height: number }): void {
  bounds = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }
  view?.setBounds(bounds)
  applyVisibility()
}

export function setCrmBrowserVisible(visible: boolean): void {
  panelVisible = visible
  applyVisibility()
  // the panel component is unmounted while hidden: resend the page state so a reopened panel is not empty
  if (visible && view) {
    sendState()
  }
}

function requireView(): WebContentsView {
  if (!view || view.webContents.isDestroyed()) {
    throw new Error('Страница не открыта — сначала crm_browser_open')
  }
  return view
}

/** Creates the browser view once: DevTools-protocol capture and navigation guards. */
async function ensureView(): Promise<WebContentsView> {
  if (view && !view.webContents.isDestroyed()) {
    return view
  }
  if (!host || host.isDestroyed()) {
    throw new Error('Окно приложения закрыто')
  }
  const created = new WebContentsView({
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  host.contentView.addChildView(created)
  created.setBounds(bounds)
  view = created
  applyVisibility()

  const wc = created.webContents
  const base = (): string => {
    const connection = current?.connection ?? lastConnection
    return connection ? baseOf(connection) : ''
  }

  wc.on('will-navigate', (event, url) => {
    if (!isSameOrigin(url, base())) {
      event.preventDefault()
    }
  })
  wc.on('will-redirect', (event, url) => {
    if (!isSameOrigin(url, base())) {
      event.preventDefault()
    }
  })
  wc.setWindowOpenHandler(({ url }) => {
    if (isSameOrigin(url, base())) {
      void wc.loadURL(url)
    }
    return { action: 'deny' }
  })

  const syncState = (): void => sendState()
  wc.on('did-navigate', syncState)
  wc.on('did-navigate-in-page', syncState)
  wc.on('page-title-updated', syncState)
  wc.on('did-start-loading', syncState)
  wc.on('did-stop-loading', syncState)

  wc.once('destroyed', () => {
    if (view === created) {
      view = undefined
      loggedInFor = undefined
      sendEmptyState()
    }
  })

  try {
    // a page must exist before the DevTools commands
    await withTimeout(wc.loadURL('about:blank'), 10000, 'Окно браузера не открылось за 10 с').catch(() => {})

    try {
      wc.debugger.attach('1.3')
    } catch (e) {
      throw new Error(`Не удалось подключиться к DevTools окна: ${errorMessage(e)}`)
    }
    wc.debugger.on('message', (_event, method: string, params: any) => {
      log.onCdpEvent(method, params)
      if (method === 'Network.loadingFinished' && log.needsBody(params.requestId)) {
        wc.debugger
          .sendCommand('Network.getResponseBody', { requestId: params.requestId })
          .then((response: { body: string; base64Encoded: boolean }) => {
            log.setBody(params.requestId, response.base64Encoded ? '<двоичные данные>' : String(response.body))
          })
          .catch(() => {})
      }
    })
    await withTimeout(
      Promise.all([
        wc.debugger.sendCommand('Network.enable'),
        wc.debugger.sendCommand('Runtime.enable'),
        wc.debugger.sendCommand('Log.enable')
      ]),
      10000,
      'DevTools окна не ответил за 10 с'
    )
  } catch (error) {
    try {
      host?.contentView.removeChildView(created)
    } catch {
      // host already gone
    }
    try {
      created.webContents.close()
    } catch {
      // already destroyed
    }
    view = undefined
    loggedInFor = undefined
    throw error
  }
  return created
}

/** Signs in through the CRM auth service inside the browser session; the password is never echoed in any text. */
async function login(connection: CrmConnection): Promise<void> {
  const base = baseOf(connection)
  const ses = session.fromPartition(PARTITION)
  const response = await ses
    .fetch(`${base}/ServiceModel/AuthService.svc/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ UserName: connection.user, UserPassword: connection.password }),
      credentials: 'include',
      signal: AbortSignal.timeout(30000)
    })
    .catch((error: unknown) => {
      throw new Error(`CRM недоступна: ${errorMessage(error)}`)
    })

  let result: { Code?: number; Message?: string }
  try {
    result = await response.json()
  } catch {
    throw new Error(`Вход в CRM не выполнен: сервер вернул не JSON (код ${response.status})`)
  }
  if (result?.Code !== 0) {
    throw new Error(`Вход в CRM не выполнен: ${result?.Message ?? `код ${response.status}`}`)
  }

  // the auth cookies must land in the browser session; if they did not, copy them from the response
  const cookies = await withTimeout(ses.cookies.get({ url: base }), 5000, 'Сессия браузера не ответила')
  if (!cookies.some((cookie) => cookie.name === '.ASPXAUTH' || cookie.name === 'BPMSESSIONID')) {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';')
      const separator = pair.indexOf('=')
      if (separator > 0) {
        await withTimeout(
          ses.cookies.set({
            url: base,
            name: pair.slice(0, separator).trim(),
            value: pair.slice(separator + 1).trim(),
            path: '/'
          }),
          5000,
          'Сессия браузера не ответила'
        )
      }
    }
  }
}

/** Waits until no request is in flight for `quietMs` in a row, or the timeout passes. */
async function waitForIdle(timeoutMs = 20000, quietMs = 1200): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let quietSince: number | undefined
  while (Date.now() < deadline) {
    if (log.pendingCount() === 0) {
      if (quietSince === undefined) {
        quietSince = Date.now()
      }
      if (Date.now() - quietSince >= quietMs) {
        return
      }
    } else {
      quietSince = undefined
    }
    await sleep(200)
  }
}

/**
 * Always a full load: the previous JS modules of the page must not survive a schema update.
 * If only the #hash differs (or nothing does), the page is first replaced by about:blank, because Chromium
 * treats loadURL with the same path and search as a fragment navigation. loadURL is capped at 30 s.
 */
async function loadPage(target: string): Promise<void> {
  const wc = requireView().webContents
  const samePath = (() => {
    try {
      const from = new URL(wc.getURL())
      const to = new URL(target)
      return from.origin === to.origin && from.pathname === to.pathname && from.search === to.search
    } catch {
      return false
    }
  })()
  if (samePath) {
    await withTimeout(wc.loadURL('about:blank'), 10000, 'Страница не ответила').catch(() => {})
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, 30000)
  })
  const load = wc.loadURL(target).catch((error: unknown) => {
    if (!/ERR_ABORTED/.test(String(error))) {
      throw error
    }
  })
  try {
    await Promise.race([load, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Opens a CRM page in the browser view: login if needed, load, wait for the network to settle. Returns the result text. */
async function openPage(connection: CrmConnection, path: string | undefined, fresh = false): Promise<string> {
  lastConnection = connection
  const base = baseOf(connection)
  const key = `${base}|${connection.user}`
  const target = resolveCrmUrl(base, path)
  const page = await ensureView()
  const wc = page.webContents

  const clearCache = fresh || cacheStale
  if (clearCache) {
    await withTimeout(session.fromPartition(PARTITION).clearCache(), 10000, 'Кэш браузера не очистился за 10 с')
    cacheStale = false
  }

  if (loggedInFor !== key) {
    await login(connection)
    loggedInFor = key
  }
  log.clear()
  await loadPage(target)
  if (wc.getURL().includes('/Login/')) {
    await login(connection)
    loggedInFor = key
    await loadPage(target)
  }
  await waitForIdle()
  await sleep(1500)
  sendState()

  const counts = log.counts()
  const cleared = clearCache ? ' Кэш браузера сброшен.' : ''
  return `Открыто: ${wc.getURL()}\nЗаголовок: ${wc.getTitle()}\nОшибок консоли: ${counts.consoleErrors}, запросов с ошибкой: ${counts.failedRequests}.${cleared}`
}

/** Runs one tool call: measures it, turns a thrown error into an error result and reports it to the chat log. */
async function run(
  tool: string,
  detail: string | undefined,
  fn: (options: CrmBrowserOptions) => Promise<AppToolResult>,
  capMs: number | undefined = 120000
): Promise<AppToolResult> {
  const options = current
  if (!options) {
    return { text: 'Браузер CRM выключен', isError: true }
  }
  notifyActivity()
  const startedAt = Date.now()
  try {
    const result = typeof capMs === 'number'
      ? await withTimeout(fn(options), capMs, `Браузер CRM не ответил за ${Math.round(capMs / 1000)} с`)
      : await fn(options)
    options.onAction?.({ tool, detail, success: true, durationMs: Date.now() - startedAt })
    return result
  } catch (error) {
    const message = errorMessage(error)
    options.onAction?.({ tool, detail, success: false, durationMs: Date.now() - startedAt, error: message })
    const hint = UNREACHABLE_HINT.test(message) ? '. Не повторяй: попроси пользователя проверить страницу самому.' : ''
    return { text: `${message}${hint}`, isError: true }
  }
}

function openTool(): AppTool {
  return {
    name: 'crm_browser_open',
    description: 'Открывает страницу CRM во встроенном окне приложения (вход — учётной записью из настроек) и ждёт загрузки. Сбрасывает накопленные консоль и сеть.',
    params: {
      path: {
        type: 'string',
        optional: true,
        description: 'Путь страницы CRM: /Nui/ViewModule.aspx, #SectionModuleV2/<Схема раздела>/ или #CardModuleV2/<Схема карточки>/edit/<Id>; пусто — главная'
      },
      fresh: {
        type: 'boolean',
        optional: true,
        description: 'Сбросить кэш браузера перед открытием (нужно после правки клиентских схем; после обновления CRM инструментом делается само)'
      }
    },
    execute: (args) =>
      run('crm_browser_open', optionalString(args.path), async (options) => ({
        text: await openPage(options.connection, optionalString(args.path), args.fresh === true),
        isError: false
      }))
  }
}

function screenshotTool(): AppTool {
  return {
    name: 'crm_browser_screenshot',
    description: 'Снимок окна браузера CRM (JPEG). Дороже по токенам, чем текст — используй, когда нужно увидеть вёрстку.',
    params: {},
    execute: () =>
      run('crm_browser_screenshot', undefined, async () => {
        const page = requireView()
        await waitForPanel()
        if (!panelShown()) {
          throw new Error('Панель браузера закрыта — снимок недоступен; откройте панель (кнопка с глобусом) и повторите')
        }
        const wc = page.webContents
        let image = await withTimeout(wc.capturePage(), 15000, 'Снимок не получен за 15 с')
        if (image.isEmpty()) {
          throw new Error('Снимок пустой: страница ещё не отрисована')
        }
        const size = image.getSize()
        if (size.width > MAX_SCREENSHOT_WIDTH) {
          image = image.resize({ width: MAX_SCREENSHOT_WIDTH })
        }
        const jpeg = image.toJPEG(70)
        return {
          text: `Снимок ${size.width}×${size.height}: ${wc.getURL()}`,
          isError: false,
          image: { data: jpeg.toString('base64'), mimeType: 'image/jpeg' }
        }
      })
  }
}

function textTool(): AppTool {
  return {
    name: 'crm_browser_text',
    description: 'Видимый текст страницы CRM или элемента.',
    params: {
      selector: { type: 'string', optional: true, description: 'CSS-селектор элемента; пусто — вся страница' }
    },
    execute: (args) =>
      run('crm_browser_text', optionalString(args.selector), async () => {
        const wc = requireView().webContents
        const selector = optionalString(args.selector)
        const literal = JSON.stringify(selector ?? '')
        const script = `(() => { const el = ${literal} ? document.querySelector(${literal}) : document.body; return el ? el.innerText : null })()`
        const raw: string | null = await withTimeout(
          wc.executeJavaScript(script),
          15000,
          'Страница не ответила за 15 с'
        )
        if (raw === null) {
          throw new Error(`Элемент не найден: ${selector}`)
        }
        const collapsed = raw.replace(/\n{3,}/g, '\n\n')
        const text = collapsed.length > MAX_TEXT_LENGTH ? `${collapsed.slice(0, MAX_TEXT_LENGTH)}\n… [обрезано]` : collapsed
        return { text, isError: false }
      })
  }
}

function consoleTool(): AppTool {
  return {
    name: 'crm_browser_console',
    description: 'Сообщения и ошибки консоли браузера CRM с последнего открытия страницы.',
    params: {
      onlyErrors: { type: 'boolean', optional: true, description: 'Только ошибки (по умолчанию да)' }
    },
    execute: (args) =>
      run('crm_browser_console', undefined, async () => ({
        text: log.consoleText(args.onlyErrors !== false),
        isError: false
      }))
  }
}

function networkTool(): AppTool {
  return {
    name: 'crm_browser_network',
    description: 'Сетевые запросы страницы CRM с последнего открытия: метод, код, адрес, время; для ответов с ошибкой — тело ответа.',
    params: {
      onlyFailed: { type: 'boolean', optional: true, description: 'Только ответы с ошибкой (по умолчанию да)' },
      filter: { type: 'string', optional: true, description: 'Подстрока адреса' }
    },
    execute: (args) =>
      run('crm_browser_network', optionalString(args.filter), async () => ({
        text: log.networkText({ onlyFailed: args.onlyFailed !== false, filter: optionalString(args.filter) }),
        isError: false
      }))
  }
}

function clickTool(): AppTool {
  return {
    name: 'crm_browser_click',
    description: 'Клик по элементу страницы CRM — только для навигации и проверки; если пользователь включил подтверждение действий, каждый клик он разрешает сам.',
    params: {
      selector: { type: 'string', optional: true, description: 'CSS-селектор элемента' },
      text: { type: 'string', optional: true, description: 'Видимый текст кнопки, вкладки, пункта меню' }
    },
    execute: (args) => {
      const selector = optionalString(args.selector)
      const text = optionalString(args.text)
      return run('crm_browser_click', selector ?? text, async (options) => {
        if (!selector && !text) {
          throw new Error('Укажите selector или text')
        }
        const target = selector ?? `«${text}»`
        if (options.confirm) {
          const approved = await options.confirm(`Клик в CRM: ${target}`)
          if (!approved) {
            throw new Error('Пользователь отклонил клик')
          }
        }

        // the cap starts after the user's confirmation, so waiting for the answer does not count
        return withTimeout((async (): Promise<AppToolResult> => {
          const wc = requireView().webContents
          const selectorLiteral = JSON.stringify(selector ?? '')
          const textLiteral = JSON.stringify(text ?? '')
          const script = `(() => {
          const SELECTOR = ${selectorLiteral};
          const norm = (value) => (value || '').replace(/\\s+/g, ' ').trim();
          const TEXT = norm(${textLiteral});
          let el = null;
          if (SELECTOR) {
            el = document.querySelector(SELECTOR);
          } else {
            const candidates = [...document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="menuitem"], li, span, label, div')]
              .filter((node) => node.offsetParent !== null);
            const exact = candidates.filter((node) => norm(node.innerText) === TEXT);
            const pool = exact.length > 0 ? exact : candidates.filter((node) => norm(node.innerText).includes(TEXT));
            pool.sort((a, b) => norm(a.innerText).length - norm(b.innerText).length);
            el = pool[0] || null;
          }
          if (!el) return null;
          const description = el.tagName.toLowerCase() + ' «' + norm(el.innerText).slice(0, 80) + '»';
          el.scrollIntoView({ block: 'center' });
          el.click();
          return description;
        })()`
          const described: string | null = await withTimeout(
            wc.executeJavaScript(script),
            15000,
            'Страница не ответила за 15 с'
          )
          if (!described) {
            throw new Error('Элемент не найден')
          }
          await waitForIdle(6000, 800)
          await sleep(500)
          return { text: `Нажато: ${described}. Адрес: ${wc.getURL()}`, isError: false }
        })(), 60000, 'Браузер CRM не ответил за 60 с')
      }, undefined)
    }
  }
}

/** The six browser tools of the agent for one turn; they read the connection and the confirmation of this turn. */
export function createCrmBrowserTools(options: CrmBrowserOptions): AppTool[] {
  current = options
  return [openTool(), screenshotTool(), textTool(), consoleTool(), networkTool(), clickTool()]
}

/** Opens the CRM home page from the user's own button in the panel; no agent turn is needed. */
export async function openCrmBrowserHome(connection: CrmConnection): Promise<void> {
  await openPage(connection, undefined)
}

export function reloadCrmBrowser(): void {
  view?.webContents.reload()
}

export function closeCrmBrowser(): void {
  if (view) {
    try {
      host?.contentView.removeChildView(view)
    } catch {
      // host already gone
    }
    try {
      view.webContents.close()
    } catch {
      // already destroyed
    }
  }
  view = undefined
  loggedInFor = undefined
  sendEmptyState()
}
