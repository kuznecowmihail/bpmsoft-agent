import { describe, it, expect } from 'vitest'
import { parseVersion, evaluateEnvironment } from '../src/main/environmentCheck'
import type { DeviceInfo } from '../src/shared/types'

function device(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    platform: 'darwin',
    arch: 'arm64',
    rosetta: false,
    osVersion: '15.0.1',
    osRelease: '24.0.0',
    cpuModel: 'Apple M2',
    memoryGb: 16,
    appVersion: '0.1.2',
    electronVersion: '33.0.0',
    nodeVersion: 'v22.11.0',
    gitVersion: 'git version 2.47.1',
    gitBashPath: null,
    ...overrides
  }
}

const WIN_GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe'

function winDevice(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return device({ platform: 'win32', osVersion: '10.0.22631', osRelease: '10.0.22631', gitBashPath: WIN_GIT_BASH, ...overrides })
}

describe('parseVersion', () => {
  it('reads the first version in the text', () => {
    expect(parseVersion('v22.11.0')).toEqual([22, 11, 0])
    expect(parseVersion('git version 2.47.1.windows.1')).toEqual([2, 47, 1])
    expect(parseVersion('Darwin 21.6.0')).toEqual([21, 6, 0])
  })

  it('returns null for empty or non-version text', () => {
    expect(parseVersion(null)).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('no digits here')).toBeNull()
  })
})

describe('evaluateEnvironment: operating system', () => {
  it('blocks macOS 12 (Darwin 21.6.0)', () => {
    const report = evaluateEnvironment(device({ osRelease: '21.6.0', osVersion: '12.7.6' }), 'claude')
    const os = report.checks.find((c) => c.id === 'os')!
    expect(os.status).toBe('outdated')
    expect(os.blocking).toBe(true)
    expect(os.hint).toBe('Нужна macOS 13 или новее')
    expect(os.found).toBe('12.7.6')
    expect(report.canOpenProject).toBe(false)
  })

  it('accepts macOS 15 (Darwin 24.0.0)', () => {
    const os = evaluateEnvironment(device({ osRelease: '24.0.0' }), 'claude').checks.find((c) => c.id === 'os')!
    expect(os.status).toBe('ok')
  })

  it('blocks Windows build 17134', () => {
    const report = evaluateEnvironment(winDevice({ osRelease: '10.0.17134', osVersion: '10.0.17134' }), 'claude')
    const os = report.checks.find((c) => c.id === 'os')!
    expect(os.status).toBe('outdated')
    expect(os.blocking).toBe(true)
    expect(report.canOpenProject).toBe(false)
  })

  it('accepts Windows build 22631', () => {
    const os = evaluateEnvironment(winDevice(), 'claude').checks.find((c) => c.id === 'os')!
    expect(os.status).toBe('ok')
  })
})

describe('evaluateEnvironment: node and git', () => {
  it('reports missing node as non-blocking and keeps the project open', () => {
    const report = evaluateEnvironment(device({ nodeVersion: null }), 'claude')
    const node = report.checks.find((c) => c.id === 'node')!
    expect(node.status).toBe('missing')
    expect(node.blocking).toBe(false)
    expect(node.installUrl).toBe('https://nodejs.org')
    expect(node.hint).toBe('Установите Node.js LTS с nodejs.org или командой brew install node и перезапустите приложение')
    expect(report.canOpenProject).toBe(true)
  })

  it('reports node v16 as outdated', () => {
    const node = evaluateEnvironment(device({ nodeVersion: 'v16.20.0' }), 'claude').checks.find((c) => c.id === 'node')!
    expect(node.status).toBe('outdated')
    expect(node.found).toBe('v16.20.0')
    expect(node.blocking).toBe(false)
  })

  it('reports missing git as non-blocking', () => {
    const report = evaluateEnvironment(device({ gitVersion: null }), 'claude')
    const git = report.checks.find((c) => c.id === 'git')!
    expect(git.status).toBe('missing')
    expect(git.blocking).toBe(false)
    expect(report.canOpenProject).toBe(true)
  })
})

describe('evaluateEnvironment: Git Bash', () => {
  it('has no Git Bash check on macOS', () => {
    const report = evaluateEnvironment(device(), 'cursor')
    expect(report.checks.some((c) => c.id === 'gitBash')).toBe(false)
  })

  it('blocks a Windows project with Cursor when Git Bash is missing', () => {
    const report = evaluateEnvironment(winDevice({ gitBashPath: null }), 'cursor')
    const bash = report.checks.find((c) => c.id === 'gitBash')!
    expect(bash.status).toBe('missing')
    expect(bash.blocking).toBe(true)
    expect(report.canOpenProject).toBe(false)
  })

  it('keeps a Windows project open with Claude when Git Bash is missing', () => {
    const report = evaluateEnvironment(winDevice({ gitBashPath: null }), 'claude')
    const bash = report.checks.find((c) => c.id === 'gitBash')!
    expect(bash.status).toBe('missing')
    expect(bash.blocking).toBe(false)
    expect(bash.impact).toBe('Без Git Bash Claude Code выполняет команды через PowerShell и будет спрашивать разрешение на каждую')
    expect(report.canOpenProject).toBe(true)
  })

  it('reports the found Git Bash path', () => {
    const bash = evaluateEnvironment(winDevice(), 'cursor').checks.find((c) => c.id === 'gitBash')!
    expect(bash.status).toBe('ok')
    expect(bash.found).toBe(WIN_GIT_BASH)
  })
})
