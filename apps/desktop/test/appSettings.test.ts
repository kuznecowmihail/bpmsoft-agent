import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { initAppSettings, getAppSettings, updateAppSettings, DEFAULT_SETTINGS } from '../src/main/appSettings'

describe('appSettings', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'))
  })

  it('has defaults before init', () => {
    const settings = getAppSettings()
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('init with a missing file loads defaults', () => {
    const filePath = path.join(tempDir, 'nonexistent.json')
    initAppSettings(filePath)
    expect(getAppSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('update writes JSON and a new init on the same file reads it back', () => {
    const filePath = path.join(tempDir, 'settings.json')
    initAppSettings(filePath)
    updateAppSettings({ provider: 'cursor', cursorModel: 'composer-2.6', cursorModelParams: [{ id: 'thinking', value: 'on' }], cursorModelName: 'Composer with Thinking' })

    // Verify file was written
    const written = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(written).toEqual({ provider: 'cursor', cursorModel: 'composer-2.6', cursorModelParams: [{ id: 'thinking', value: 'on' }], cursorModelName: 'Composer with Thinking', claudeModel: '', claudeEffort: '', claudeModelName: '', dbAccessEnabled: false, dbConfirmQueries: false, dbHost: '', dbPort: '', dbUser: '', crmActionsEnabled: false, crmConfirmActions: false, crmUrl: '', crmUser: '' })

    // Verify reading the file again loads the same settings
    initAppSettings(filePath)
    expect(getAppSettings()).toEqual({ provider: 'cursor', cursorModel: 'composer-2.6', cursorModelParams: [{ id: 'thinking', value: 'on' }], cursorModelName: 'Composer with Thinking', claudeModel: '', claudeEffort: '', claudeModelName: '', dbAccessEnabled: false, dbConfirmQueries: false, dbHost: '', dbPort: '', dbUser: '', crmActionsEnabled: false, crmConfirmActions: false, crmUrl: '', crmUser: '' })
  })

  it('broken JSON loads defaults', () => {
    const filePath = path.join(tempDir, 'broken.json')
    fs.writeFileSync(filePath, 'not valid json')
    initAppSettings(filePath)
    expect(getAppSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('provider other normalizes to claude', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ provider: 'other', cursorModel: 'composer-2.5' }))
    initAppSettings(filePath)
    expect(getAppSettings().provider).toBe('claude')
  })

  it('empty cursorModel normalizes to default', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ provider: 'cursor', cursorModel: '  ' }))
    initAppSettings(filePath)
    expect(getAppSettings().cursorModel).toBe(DEFAULT_SETTINGS.cursorModel)
  })

  it('cursorModelParams defaults to empty array', () => {
    const settings = getAppSettings()
    expect(settings.cursorModelParams).toEqual([])
  })

  it('cursorModelName defaults to empty string', () => {
    const settings = getAppSettings()
    expect(settings.cursorModelName).toBe('')
  })

  it('normalize drops invalid param items', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({
      provider: 'cursor',
      cursorModel: 'composer-2.5',
      cursorModelParams: [
        { id: 'thinking', value: 'on' },
        { id: 'invalid' },
        { value: 'missing-id' },
        'not-an-object'
      ],
      cursorModelName: 'Test'
    }))
    initAppSettings(filePath)
    const settings = getAppSettings()
    expect(settings.cursorModelParams).toEqual([{ id: 'thinking', value: 'on' }])
    expect(settings.cursorModelName).toBe('Test')
  })

  it('update and reinit round-trips cursorModelParams and cursorModelName', () => {
    const filePath = path.join(tempDir, 'settings.json')
    initAppSettings(filePath)
    const params = [{ id: 'thinking', value: 'on' }, { id: 'reasoning_effort', value: 'high' }]
    const name = 'Custom Model Variant'
    updateAppSettings({ cursorModelParams: params, cursorModelName: name })

    // Reinit and verify
    initAppSettings(filePath)
    const settings = getAppSettings()
    expect(settings.cursorModelParams).toEqual(params)
    expect(settings.cursorModelName).toBe(name)
  })

  it('updateAppSettings persists and getAppSettings returns claudeModel, claudeEffort, claudeModelName', () => {
    const filePath = path.join(tempDir, 'settings.json')
    initAppSettings(filePath)
    updateAppSettings({ claudeModel: 'claude-opus-5-5', claudeEffort: 'max', claudeModelName: 'Claude Opus 5.5 · Max' })

    // Verify settings are returned
    const settings = getAppSettings()
    expect(settings.claudeModel).toBe('claude-opus-5-5')
    expect(settings.claudeEffort).toBe('max')
    expect(settings.claudeModelName).toBe('Claude Opus 5.5 · Max')

    // Verify reinit reads them back
    initAppSettings(filePath)
    const reloaded = getAppSettings()
    expect(reloaded.claudeModel).toBe('claude-opus-5-5')
    expect(reloaded.claudeEffort).toBe('max')
    expect(reloaded.claudeModelName).toBe('Claude Opus 5.5 · Max')
  })

  it('unknown effort value normalizes to empty string', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ claudeModel: 'claude-opus', claudeEffort: 'turbo' }))
    initAppSettings(filePath)
    const settings = getAppSettings()
    expect(settings.claudeEffort).toBe('')
  })

  it('db settings default to disabled with empty connection overrides', () => {
    const settings = getAppSettings()
    expect(settings.dbAccessEnabled).toBe(false)
    expect(settings.dbConfirmQueries).toBe(false)
    expect(settings.dbHost).toBe('')
    expect(settings.dbPort).toBe('')
    expect(settings.dbUser).toBe('')
  })

  it('db flags are true only for boolean true', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ dbAccessEnabled: 'true', dbConfirmQueries: 1 }))
    initAppSettings(filePath)
    expect(getAppSettings().dbAccessEnabled).toBe(false)
    expect(getAppSettings().dbConfirmQueries).toBe(false)

    fs.writeFileSync(filePath, JSON.stringify({ dbAccessEnabled: true, dbConfirmQueries: true }))
    initAppSettings(filePath)
    expect(getAppSettings().dbAccessEnabled).toBe(true)
    expect(getAppSettings().dbConfirmQueries).toBe(true)
  })

  it('db host and user are trimmed, non-strings become empty', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ dbHost: '  db.local  ', dbUser: ' reader ' }))
    initAppSettings(filePath)
    expect(getAppSettings().dbHost).toBe('db.local')
    expect(getAppSettings().dbUser).toBe('reader')

    fs.writeFileSync(filePath, JSON.stringify({ dbHost: 42, dbUser: null }))
    initAppSettings(filePath)
    expect(getAppSettings().dbHost).toBe('')
    expect(getAppSettings().dbUser).toBe('')
  })

  it('db port keeps only 1 to 5 digits, invalid port becomes empty', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ dbPort: ' 5432 ' }))
    initAppSettings(filePath)
    expect(getAppSettings().dbPort).toBe('5432')

    for (const invalid of ['abc', '12a', '123456', '', 5432]) {
      fs.writeFileSync(filePath, JSON.stringify({ dbPort: invalid }))
      initAppSettings(filePath)
      expect(getAppSettings().dbPort).toBe('')
    }
  })

  it('crm settings default to disabled with empty connection', () => {
    const settings = getAppSettings()
    expect(settings.crmActionsEnabled).toBe(false)
    expect(settings.crmConfirmActions).toBe(false)
    expect(settings.crmUrl).toBe('')
    expect(settings.crmUser).toBe('')
  })

  it('crm flags are true only for boolean true', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ crmActionsEnabled: 'true', crmConfirmActions: 1 }))
    initAppSettings(filePath)
    expect(getAppSettings().crmActionsEnabled).toBe(false)
    expect(getAppSettings().crmConfirmActions).toBe(false)

    fs.writeFileSync(filePath, JSON.stringify({ crmActionsEnabled: true, crmConfirmActions: true }))
    initAppSettings(filePath)
    expect(getAppSettings().crmActionsEnabled).toBe(true)
    expect(getAppSettings().crmConfirmActions).toBe(true)
  })

  it('crm url is trimmed and loses trailing slashes', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ crmUrl: '  http://localhost:8007//  ' }))
    initAppSettings(filePath)
    expect(getAppSettings().crmUrl).toBe('http://localhost:8007')

    fs.writeFileSync(filePath, JSON.stringify({ crmUrl: 'HTTPS://crm.example.test/app' }))
    initAppSettings(filePath)
    expect(getAppSettings().crmUrl).toBe('HTTPS://crm.example.test/app')
  })

  it('crm url without http(s) scheme, with spaces or non-strings becomes empty', () => {
    const filePath = path.join(tempDir, 'settings.json')
    for (const invalid of ['localhost:8007', 'ftp://host', 'http://', 'http://ho st', 'http:/host', 42, null]) {
      fs.writeFileSync(filePath, JSON.stringify({ crmUrl: invalid }))
      initAppSettings(filePath)
      expect(getAppSettings().crmUrl).toBe('')
    }
  })

  it('crm user is trimmed, non-strings become empty', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ crmUser: ' admin ' }))
    initAppSettings(filePath)
    expect(getAppSettings().crmUser).toBe('admin')

    fs.writeFileSync(filePath, JSON.stringify({ crmUser: 7 }))
    initAppSettings(filePath)
    expect(getAppSettings().crmUser).toBe('')
  })
})
