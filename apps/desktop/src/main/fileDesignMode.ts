import * as fs from 'fs'
import * as path from 'path'
import type { FileDesignModeCheck } from '../shared/types'

export interface FileDesignModeSettings {
  /** null when the fileDesignMode element is absent. */
  fileDesignMode: boolean | null
  /** null when the UseStaticFileContent key is absent. */
  useStaticFileContent: boolean | null
}

export interface ConfigFileSystem {
  exists(p: string): boolean
  read(p: string): string
}

const defaultFileSystem: ConfigFileSystem = {
  exists: (p) => fs.existsSync(p),
  read: (p) => fs.readFileSync(p, 'utf8')
}

const NOT_FOUND_PROBLEM = 'Не найден файл конфигурации стенда (BPMSoft.WebHost.dll.config или Web.config) рядом с BPMSoft.Configuration'
const FILE_DESIGN_MODE_PROBLEM = 'Нужен <fileDesignMode enabled="true" />'
const USE_STATIC_FILE_CONTENT_PROBLEM = 'Нужен ключ <add key="UseStaticFileContent" value="false" />'

/** Value of an attribute of an XML start tag, quotes may be single or double; null when absent. */
function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
  return match ? match[2] : null
}

/** Reads the two settings of the file design mode from the text of a .NET config file. */
export function parseFileDesignMode(xml: string): FileDesignModeSettings {
  const text = xml
    .replace(/^\uFEFF/, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  let fileDesignMode: boolean | null = null
  const fileDesignModeTag = text.match(/<fileDesignMode\b[^>]*>/i)
  if (fileDesignModeTag) {
    fileDesignMode = (readAttribute(fileDesignModeTag[0], 'enabled') ?? '').trim().toLowerCase() === 'true'
  }

  let useStaticFileContent: boolean | null = null
  for (const addTag of text.match(/<add\b[^>]*>/gi) ?? []) {
    if ((readAttribute(addTag, 'key') ?? '').toLowerCase() === 'usestaticfilecontent') {
      useStaticFileContent = (readAttribute(addTag, 'value') ?? '').trim().toLowerCase() === 'true'
      break
    }
  }

  return { fileDesignMode, useStaticFileContent }
}

/**
 * Checks that the stand reads its files from the file system (fileDesignMode enabled, UseStaticFileContent false).
 * Config candidates: BPMSoft.WebHost.dll.config and Web.config in the application folder, Web.config in its parent folder.
 */
export function checkFileDesignMode(appRoot: string, fsApi: ConfigFileSystem = defaultFileSystem): FileDesignModeCheck {
  const candidates = [
    path.join(appRoot, 'BPMSoft.WebHost.dll.config'),
    path.join(path.dirname(appRoot), 'Web.config'),
    path.join(appRoot, 'Web.config')
  ]
  const existing = candidates.filter((candidate) => fsApi.exists(candidate))
  if (existing.length === 0) {
    return { status: 'notFound', problems: [NOT_FOUND_PROBLEM] }
  }

  // The first file that mentions the settings wins; otherwise the first existing file is reported.
  let chosenPath = existing[0]
  let settings: FileDesignModeSettings | null = null
  for (const candidate of existing) {
    const parsed = parseFileDesignMode(fsApi.read(candidate))
    if (parsed.fileDesignMode !== null || parsed.useStaticFileContent !== null) {
      chosenPath = candidate
      settings = parsed
      break
    }
  }
  if (!settings) {
    settings = parseFileDesignMode(fsApi.read(chosenPath))
  }

  const problems: string[] = []
  if (settings.fileDesignMode !== true) {
    problems.push(FILE_DESIGN_MODE_PROBLEM)
  }
  if (settings.useStaticFileContent !== false) {
    problems.push(USE_STATIC_FILE_CONTENT_PROBLEM)
  }

  return { status: problems.length === 0 ? 'ok' : 'disabled', configPath: chosenPath, problems }
}
