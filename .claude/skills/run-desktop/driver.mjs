#!/usr/bin/env node
// Drives apps/desktop through Playwright's Electron support: one process runs a scenario of commands.
// Usage: node .claude/skills/run-desktop/driver.mjs "launch" "stand off" "pick" "ss card" "close"
// Without arguments the commands are read from stdin, one per line (lines starting with # are skipped).
import { _electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, delimiter } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const appDir = join(repoRoot, 'apps', 'desktop')
const outDir = process.env.RUN_DESKTOP_OUT || mkdtempSync(join(tmpdir(), 'bpmsoft-agent-run-desktop-'))
mkdirSync(outDir, { recursive: true })

let app = null
let page = null
let lastStand = null

/** Path of the Electron binary for this platform, as the electron package reports it. */
function electronBinary() {
  return createRequire(join(appDir, 'package.json'))('electron')
}

/** PATH with only system folders, to simulate a computer without Node and other tools. */
function minimalPath() {
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || 'C:\\Windows'
    return [join(root, 'System32'), root, join(root, 'System32', 'Wbem')].join(delimiter)
  }
  return ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter)
}

/** Creates a fake BPMSoft app root with a test package; mode on|off sets fileDesignMode and UseStaticFileContent. */
function createStand(name, mode) {
  const root = join(outDir, name)
  mkdirSync(join(root, 'BPMSoft.Configuration', 'Pkg', 'TestPkg', 'Schemas'), { recursive: true })
  const on = mode !== 'off'
  const config = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<configuration>',
    '  <appSettings>',
    `    <add key="UseStaticFileContent" value="${on ? 'false' : 'true'}" />`,
    '  </appSettings>',
    '  <bpmsoft>',
    `    <fileDesignMode enabled="${on ? 'true' : 'false'}" />`,
    '  </bpmsoft>',
    '</configuration>',
    ''
  ].join('\n')
  writeFileSync(join(root, 'BPMSoft.WebHost.dll.config'), config)
  lastStand = root
  return root
}

function requirePage() {
  if (!page) throw new Error('Приложение не запущено: сначала launch')
  return page
}

const commands = {
  async launch(args) {
    const env = { ...process.env, BPMSOFT_AGENT_LOG_DIR: join(outDir, 'logs') }
    if (args.includes('--minimal-path')) env.PATH = minimalPath()
    app = await _electron.launch({
      executablePath: electronBinary(),
      args: [appDir, `--user-data-dir=${join(outDir, 'userData')}`],
      env
    })
    page = await app.firstWindow()
    page.setDefaultTimeout(10000)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)
    console.log(`launched, userData: ${join(outDir, 'userData')}`)
  },
  async stand([name = 'stand-on', mode = 'on']) {
    if (name === 'on' || name === 'off') { mode = name; name = `stand-${mode}` }
    console.log(`stand: ${createStand(name, mode)}`)
  },
  async pick([target]) {
    const p = requirePage()
    const folder = target ? resolve(target) : lastStand
    if (!folder) throw new Error('pick: укажите папку или сначала stand')
    await app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
    }, folder)
    await p.getByRole('button', { name: 'Открыть проект' }).click()
    await p.waitForTimeout(3000)
    console.log(`picked: ${folder}`)
  },
  async click(args) {
    const text = args.join(' ')
    await requirePage().getByText(text, { exact: false }).first().click()
    await page.waitForTimeout(1000)
    console.log(`clicked: ${text}`)
  },
  async wait([ms = '1000']) {
    await requirePage().waitForTimeout(Number(ms))
  },
  async ss([name = `shot-${Date.now()}`]) {
    const file = join(outDir, `${name}.png`)
    await requirePage().screenshot({ path: file })
    console.log(`screenshot: ${file}`)
  },
  async text(args) {
    const selector = args.join(' ') || 'body'
    console.log(await requirePage().locator(selector).first().innerText())
  },
  async eval(args) {
    const result = await requirePage().evaluate(args.join(' '))
    console.log(JSON.stringify(result, null, 2))
  },
  async close() {
    if (app) await app.close()
    app = null
    page = null
    console.log('closed')
  }
}

async function readStdinLines() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)
}

const lines = process.argv.length > 2 ? process.argv.slice(2) : await readStdinLines()
console.log(`out: ${outDir}`)
let failed = false
try {
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [name, ...args] = line.split(/\s+/)
    const command = commands[name]
    if (!command) throw new Error(`Неизвестная команда: ${name}`)
    console.log(`> ${line}`)
    await command(args)
  }
} catch (error) {
  failed = true
  console.error(`ошибка: ${error.message}`)
  if (page) {
    const file = join(outDir, 'error.png')
    await page.screenshot({ path: file }).catch(() => {})
    console.error(`screenshot: ${file}`)
  }
} finally {
  if (app) await app.close().catch(() => {})
}
process.exit(failed ? 1 : 0)
