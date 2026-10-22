import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { parseFileDesignMode, checkFileDesignMode, ConfigFileSystem } from '../src/main/fileDesignMode'

const APP_ROOT = path.join('/stand', 'app')
const WEBHOST = path.join(APP_ROOT, 'BPMSoft.WebHost.dll.config')
const PARENT_WEB = path.join('/stand', 'Web.config')
const APP_WEB = path.join(APP_ROOT, 'Web.config')

/** Fake file system: a map from path to file text. */
function fakeFs(files: Record<string, string>): ConfigFileSystem {
  return {
    exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
    read: (p) => files[p]
  }
}

const ENABLED = `<configuration>
  <fileDesignMode enabled="true" />
  <add key="UseStaticFileContent" value="false" />
</configuration>`

describe('parseFileDesignMode', () => {
  it('reads enabled fileDesignMode and UseStaticFileContent false', () => {
    expect(parseFileDesignMode(ENABLED)).toEqual({ fileDesignMode: true, useStaticFileContent: false })
  })

  it('reads disabled fileDesignMode', () => {
    const xml = '<configuration><fileDesignMode enabled="false" /></configuration>'
    expect(parseFileDesignMode(xml)).toEqual({ fileDesignMode: false, useStaticFileContent: null })
  })

  it('treats a commented-out enabled element as absent', () => {
    const xml = '<configuration>\n<!--\n  <fileDesignMode enabled="true" />\n-->\n</configuration>'
    expect(parseFileDesignMode(xml).fileDesignMode).toBeNull()
  })

  it('handles BOM and CRLF line endings', () => {
    const xml = `\uFEFF<configuration>\r\n  <fileDesignMode enabled="true" />\r\n  <add key="UseStaticFileContent" value="false" />\r\n</configuration>\r\n`
    expect(parseFileDesignMode(xml)).toEqual({ fileDesignMode: true, useStaticFileContent: false })
  })

  it('accepts single quotes, free attribute order and case-insensitive value', () => {
    const xml = "<configuration><fileDesignMode name='x' enabled='TRUE'/><add value='false' key='UseStaticFileContent'/></configuration>"
    expect(parseFileDesignMode(xml)).toEqual({ fileDesignMode: true, useStaticFileContent: false })
  })

  it('reads UseStaticFileContent true', () => {
    const xml = '<add key="UseStaticFileContent" value="true" />'
    expect(parseFileDesignMode(xml).useStaticFileContent).toBe(true)
  })

  it('returns null for UseStaticFileContent when the key is absent', () => {
    expect(parseFileDesignMode('<configuration />')).toEqual({ fileDesignMode: null, useStaticFileContent: null })
  })
})

describe('checkFileDesignMode', () => {
  it('is ok when the settings are enabled', () => {
    const result = checkFileDesignMode(APP_ROOT, fakeFs({ [WEBHOST]: ENABLED }))
    expect(result).toEqual({ status: 'ok', configPath: WEBHOST, problems: [] })
  })

  it('is disabled with both problems when the settings are absent', () => {
    const result = checkFileDesignMode(APP_ROOT, fakeFs({ [WEBHOST]: '<configuration />' }))
    expect(result.status).toBe('disabled')
    expect(result.configPath).toBe(WEBHOST)
    expect(result.problems).toHaveLength(2)
  })

  it('is disabled when UseStaticFileContent is true', () => {
    const xml = '<configuration><fileDesignMode enabled="true" /><add key="UseStaticFileContent" value="true" /></configuration>'
    const result = checkFileDesignMode(APP_ROOT, fakeFs({ [WEBHOST]: xml }))
    expect(result.status).toBe('disabled')
    expect(result.problems).toEqual(['Нужен ключ <add key="UseStaticFileContent" value="false" />'])
  })

  it('is disabled when fileDesignMode is commented out', () => {
    const xml = '<configuration><!-- <fileDesignMode enabled="true" /> --><add key="UseStaticFileContent" value="false" /></configuration>'
    const result = checkFileDesignMode(APP_ROOT, fakeFs({ [WEBHOST]: xml }))
    expect(result.status).toBe('disabled')
    expect(result.problems).toEqual([
      'Нужен <fileDesignMode enabled="true" />'
    ])
  })

  it('is notFound when no config file exists', () => {
    const result = checkFileDesignMode(APP_ROOT, fakeFs({}))
    expect(result.status).toBe('notFound')
    expect(result.configPath).toBeUndefined()
    expect(result.problems).toEqual([
      'Не найден файл конфигурации стенда (BPMSoft.WebHost.dll.config или Web.config) рядом с BPMSoft.Configuration'
    ])
  })

  it('chooses the parent Web.config over an application Web.config without settings', () => {
    const files = {
      [APP_WEB]: '<configuration />',
      [PARENT_WEB]: ENABLED
    }
    const result = checkFileDesignMode(APP_ROOT, fakeFs(files))
    expect(result).toEqual({ status: 'ok', configPath: PARENT_WEB, problems: [] })
  })
})
