import { describe, it, expect } from 'vitest'
import { extractMarkedPath, usesLoginShellPath, defaultLoginShell } from '../src/main/shellPath'

const MARKER = '__BPMSOFT_AGENT_PATH__'

describe('extractMarkedPath', () => {
  it('returns PATH between markers ignoring surrounding shell output', () => {
    const output = `welcome banner\n${MARKER}/opt/homebrew/bin:/usr/bin${MARKER}\nbye`
    expect(extractMarkedPath(output)).toBe('/opt/homebrew/bin:/usr/bin')
  })

  it('returns null when there are no markers', () => {
    expect(extractMarkedPath('/usr/bin:/bin')).toBeNull()
  })

  it('returns null when markers enclose an empty value', () => {
    expect(extractMarkedPath(`${MARKER}${MARKER}`)).toBeNull()
  })
})

describe('login shell PATH', () => {
  it('is used on macOS and Linux, where GUI launchers give a minimal PATH, but not on Windows', () => {
    expect(usesLoginShellPath('darwin')).toBe(true)
    expect(usesLoginShellPath('linux')).toBe(true)
    expect(usesLoginShellPath('win32')).toBe(false)
  })

  it('takes the user shell, else zsh on macOS and bash on Linux', () => {
    expect(defaultLoginShell('linux', { SHELL: '/usr/bin/fish' })).toBe('/usr/bin/fish')
    expect(defaultLoginShell('darwin', {})).toBe('/bin/zsh')
    expect(defaultLoginShell('linux', {})).toBe('/bin/bash')
  })
})
