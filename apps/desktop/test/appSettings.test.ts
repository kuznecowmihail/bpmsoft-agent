import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { initAppSettings, getAppSettings, updateAppSettings, addRecentProject, removeRecentProject, getProjectConnection, updateProjectConnection, DEFAULT_SETTINGS, EMPTY_PROJECT_CONNECTION } from '../src/main/appSettings'

/** Writes connection fields of project '/p' to the settings file and reloads it. */
function writeProjectFields(filePath: string, fields: Record<string, unknown>): void {
  fs.writeFileSync(filePath, JSON.stringify({ projectConnections: { '/p': fields } }))
  initAppSettings(filePath)
}

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
    expect(written).toEqual({ provider: 'cursor', cursorModel: 'composer-2.6', cursorModelParams: [{ id: 'thinking', value: 'on' }], cursorModelName: 'Composer with Thinking', claudeModel: '', claudeEffort: '', claudeModelName: '', dbAccessEnabled: false, dbConfirmQueries: false, crmActionsEnabled: false, crmConfirmActions: false, crmBrowserEnabled: false, jiraUrl: '', jiraEmail: '', jiraAcceptanceField: '', confluenceUrl: '', confluenceEmail: '', recentProjects: [], projectConnections: {} })

    // Verify reading the file again loads the same settings
    initAppSettings(filePath)
    expect(getAppSettings()).toEqual({ provider: 'cursor', cursorModel: 'composer-2.6', cursorModelParams: [{ id: 'thinking', value: 'on' }], cursorModelName: 'Composer with Thinking', claudeModel: '', claudeEffort: '', claudeModelName: '', dbAccessEnabled: false, dbConfirmQueries: false, crmActionsEnabled: false, crmConfirmActions: false, crmBrowserEnabled: false, jiraUrl: '', jiraEmail: '', jiraAcceptanceField: '', confluenceUrl: '', confluenceEmail: '', recentProjects: [], projectConnections: {} })
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

  it('db settings default to disabled and the project has no connection', () => {
    const settings = getAppSettings()
    expect(settings.dbAccessEnabled).toBe(false)
    expect(settings.dbConfirmQueries).toBe(false)
    expect(getProjectConnection('/p')).toEqual(EMPTY_PROJECT_CONNECTION)
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
    writeProjectFields(filePath, { dbHost: '  db.local  ', dbUser: ' reader ' })
    expect(getProjectConnection('/p').dbHost).toBe('db.local')
    expect(getProjectConnection('/p').dbUser).toBe('reader')

    writeProjectFields(filePath, { dbHost: 42, dbUser: null })
    expect(getProjectConnection('/p').dbHost).toBe('')
    expect(getProjectConnection('/p').dbUser).toBe('')
  })

  it('db port keeps only 1 to 5 digits, invalid port becomes empty', () => {
    const filePath = path.join(tempDir, 'settings.json')
    writeProjectFields(filePath, { dbPort: ' 5432 ' })
    expect(getProjectConnection('/p').dbPort).toBe('5432')

    for (const invalid of ['abc', '12a', '123456', '', 5432]) {
      writeProjectFields(filePath, { dbPort: invalid })
      expect(getProjectConnection('/p').dbPort).toBe('')
    }
  })

  it('crm flags default to disabled and are true only for boolean true', () => {
    expect(getAppSettings().crmActionsEnabled).toBe(false)
    expect(getAppSettings().crmConfirmActions).toBe(false)

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
    writeProjectFields(filePath, { crmUrl: '  http://localhost:8007//  ' })
    expect(getProjectConnection('/p').crmUrl).toBe('http://localhost:8007')

    writeProjectFields(filePath, { crmUrl: 'HTTPS://crm.example.test/app' })
    expect(getProjectConnection('/p').crmUrl).toBe('HTTPS://crm.example.test/app')
  })

  it('crm url without http(s) scheme, with spaces or non-strings becomes empty', () => {
    const filePath = path.join(tempDir, 'settings.json')
    for (const invalid of ['localhost:8007', 'ftp://host', 'http://', 'http://ho st', 'http:/host', 42, null]) {
      writeProjectFields(filePath, { crmUrl: invalid })
      expect(getProjectConnection('/p').crmUrl).toBe('')
    }
  })

  it('crm browser is off by default and on only for boolean true', () => {
    expect(getAppSettings().crmBrowserEnabled).toBe(false)

    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ crmBrowserEnabled: 'true' }))
    initAppSettings(filePath)
    expect(getAppSettings().crmBrowserEnabled).toBe(false)

    fs.writeFileSync(filePath, JSON.stringify({ crmBrowserEnabled: true }))
    initAppSettings(filePath)
    expect(getAppSettings().crmBrowserEnabled).toBe(true)
  })

  it('crm user is trimmed, non-strings become empty', () => {
    const filePath = path.join(tempDir, 'settings.json')
    writeProjectFields(filePath, { crmUser: ' admin ' })
    expect(getProjectConnection('/p').crmUser).toBe('admin')

    writeProjectFields(filePath, { crmUser: 7 })
    expect(getProjectConnection('/p').crmUser).toBe('')
  })

  it('connection settings of two projects are kept separately and survive a reload', () => {
    const filePath = path.join(tempDir, 'settings.json')
    initAppSettings(filePath)
    updateProjectConnection('/a', { dbHost: 'db-a', crmUrl: 'http://a.test' })
    updateProjectConnection('/b', { dbHost: 'db-b', crmUser: 'bob' })

    expect(getProjectConnection('/a')).toEqual({ ...EMPTY_PROJECT_CONNECTION, dbHost: 'db-a', crmUrl: 'http://a.test' })
    expect(getProjectConnection('/b')).toEqual({ ...EMPTY_PROJECT_CONNECTION, dbHost: 'db-b', crmUser: 'bob' })

    initAppSettings(filePath)
    expect(getProjectConnection('/a').dbHost).toBe('db-a')
    expect(getProjectConnection('/b').crmUser).toBe('bob')
  })

  it('unknown or missing project key gives an empty connection', () => {
    const filePath = path.join(tempDir, 'settings.json')
    initAppSettings(filePath)
    updateProjectConnection('/a', { dbHost: 'db-a' })
    expect(getProjectConnection('/unknown')).toEqual(EMPTY_PROJECT_CONNECTION)
    expect(getProjectConnection(undefined)).toEqual(EMPTY_PROJECT_CONNECTION)
  })

  it('legacy top-level connection fields are ignored', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ dbHost: 'x', crmUser: 'admin' }))
    initAppSettings(filePath)
    expect(getProjectConnection('/p').dbHost).toBe('')
    expect(getProjectConnection('/p').crmUser).toBe('')
  })

  it('jira and confluence urls are trimmed, lose trailing slashes and invalid values become empty', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ jiraUrl: '  https://jira.company.ru//  ', confluenceUrl: 'HTTPS://company.atlassian.net/wiki/' }))
    initAppSettings(filePath)
    expect(getAppSettings().jiraUrl).toBe('https://jira.company.ru')
    expect(getAppSettings().confluenceUrl).toBe('HTTPS://company.atlassian.net/wiki')

    for (const invalid of ['jira.company.ru', 'ftp://jira', 'https://', 'https://ji ra', 42, null]) {
      fs.writeFileSync(filePath, JSON.stringify({ jiraUrl: invalid, confluenceUrl: invalid }))
      initAppSettings(filePath)
      expect(getAppSettings().jiraUrl).toBe('')
      expect(getAppSettings().confluenceUrl).toBe('')
    }
  })

  it('jira and confluence emails are trimmed, non-strings become empty', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ jiraEmail: ' bob@company.ru ', confluenceEmail: '  wiki@company.ru' }))
    initAppSettings(filePath)
    expect(getAppSettings().jiraEmail).toBe('bob@company.ru')
    expect(getAppSettings().confluenceEmail).toBe('wiki@company.ru')

    fs.writeFileSync(filePath, JSON.stringify({ jiraEmail: 7, confluenceEmail: null }))
    initAppSettings(filePath)
    expect(getAppSettings().jiraEmail).toBe('')
    expect(getAppSettings().confluenceEmail).toBe('')
  })

  it('jira acceptance field is kept only in the customfield_<number> form', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ jiraAcceptanceField: ' customfield_10010 ' }))
    initAppSettings(filePath)
    expect(getAppSettings().jiraAcceptanceField).toBe('customfield_10010')

    for (const invalid of ['10010', 'customfield_', 'customfield_10a', 'Customfield_1', 'customfield_1 2', 5]) {
      fs.writeFileSync(filePath, JSON.stringify({ jiraAcceptanceField: invalid }))
      initAppSettings(filePath)
      expect(getAppSettings().jiraAcceptanceField).toBe('')
    }
  })

  it('addRecentProject moves an existing path to the top without duplicates', () => {
    const filePath = path.join(tempDir, 'settings.json')
    initAppSettings(filePath)
    addRecentProject('/projects/a')
    addRecentProject('/projects/b')
    addRecentProject('/projects/a')
    expect(getAppSettings().recentProjects).toEqual(['/projects/a', '/projects/b'])
  })

  it('recent projects list is capped at 10, newest first', () => {
    const filePath = path.join(tempDir, 'settings.json')
    initAppSettings(filePath)
    for (let i = 0; i < 12; i++) {
      addRecentProject(`/projects/${i}`)
    }
    const recent = getAppSettings().recentProjects
    expect(recent).toHaveLength(10)
    expect(recent[0]).toBe('/projects/11')
    expect(recent[9]).toBe('/projects/2')
  })

  it('removeRecentProject removes the path from the list', () => {
    const filePath = path.join(tempDir, 'settings.json')
    initAppSettings(filePath)
    addRecentProject('/projects/a')
    addRecentProject('/projects/b')
    removeRecentProject('/projects/a')
    expect(getAppSettings().recentProjects).toEqual(['/projects/b'])
  })

  it('normalize drops non-string, blank and duplicate recent projects', () => {
    const filePath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(filePath, JSON.stringify({ recentProjects: ['/projects/a', 42, null, '   ', '/projects/a', '/projects/b'] }))
    initAppSettings(filePath)
    expect(getAppSettings().recentProjects).toEqual(['/projects/a', '/projects/b'])
  })
})
