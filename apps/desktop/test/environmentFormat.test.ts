import { describe, it, expect } from 'vitest'
import {
  osLabel,
  chipLabel,
  describeDevice,
  describeApp,
  problemChecks,
  blockingReason
} from '../src/renderer/src/environmentFormat'
import type { DeviceInfo, EnvCheck, EnvironmentReport } from '../src/shared/types'

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

function check(overrides: Partial<EnvCheck> = {}): EnvCheck {
  return { id: 'git', title: 'Git', status: 'ok', blocking: false, ...overrides }
}

function report(checks: EnvCheck[], canOpenProject = true): EnvironmentReport {
  return { device: device(), checks, canOpenProject }
}

describe('osLabel', () => {
  it('shows macOS with its version', () => {
    expect(osLabel(device({ platform: 'darwin', osVersion: '15.0.1' }))).toBe('macOS 15.0.1')
  })

  it('shows Windows with its version', () => {
    expect(osLabel(device({ platform: 'win32', osVersion: '10.0.22631' }))).toBe('Windows 10.0.22631')
  })

  it('shows other platforms with the kernel release', () => {
    expect(osLabel(device({ platform: 'linux', osRelease: '6.8.0-45' }))).toBe('linux 6.8.0-45')
  })
})

describe('chipLabel', () => {
  it('names Apple Silicon for arm64 on macOS', () => {
    expect(chipLabel(device({ platform: 'darwin', arch: 'arm64' }))).toBe('Apple Silicon (arm64)')
  })

  it('names Rosetta for x64 on macOS when translated', () => {
    expect(chipLabel(device({ platform: 'darwin', arch: 'x64', rosetta: true }))).toBe('Apple Silicon через Rosetta (x64)')
  })

  it('names Intel for x64 on macOS without Rosetta', () => {
    expect(chipLabel(device({ platform: 'darwin', arch: 'x64', rosetta: false }))).toBe('Intel (x64)')
  })

  it('maps x64 outside macOS to x64', () => {
    expect(chipLabel(device({ platform: 'win32', arch: 'x64' }))).toBe('x64')
  })

  it('maps arm64 outside macOS to ARM64', () => {
    expect(chipLabel(device({ platform: 'win32', arch: 'arm64' }))).toBe('ARM64')
  })

  it('maps ia32 to x86', () => {
    expect(chipLabel(device({ platform: 'win32', arch: 'ia32' }))).toBe('x86')
  })

  it('returns an unknown architecture as is', () => {
    expect(chipLabel(device({ platform: 'linux', arch: 'riscv64' }))).toBe('riscv64')
  })
})

describe('describeDevice', () => {
  it('joins system, chip, CPU model and memory', () => {
    expect(describeDevice(device())).toBe('macOS 15.0.1 · Apple Silicon (arm64) · Apple M2 · 16 ГБ')
  })

  it('skips an empty CPU model', () => {
    expect(describeDevice(device({ cpuModel: '' }))).toBe('macOS 15.0.1 · Apple Silicon (arm64) · 16 ГБ')
  })
})

describe('describeApp', () => {
  it('shows the app and Electron versions', () => {
    expect(describeApp(device())).toBe('Приложение 0.1.2 · Electron 33.0.0')
  })
})

describe('problemChecks', () => {
  it('returns an empty list without a report', () => {
    expect(problemChecks(null)).toEqual([])
  })

  it('keeps only checks that are not ok', () => {
    const missing = check({ id: 'node', status: 'missing', blocking: true })
    const outdated = check({ id: 'git', status: 'outdated' })
    const ok = check({ id: 'os', status: 'ok' })
    expect(problemChecks(report([ok, missing, outdated]))).toEqual([missing, outdated])
  })

  it('returns an empty list when all checks are ok', () => {
    expect(problemChecks(report([check({ id: 'os' })]))).toEqual([])
  })
})

describe('blockingReason', () => {
  it('returns null without a report', () => {
    expect(blockingReason(null)).toBeNull()
  })

  it('returns null when the computer can open a project', () => {
    const optional = check({ status: 'missing', blocking: false, impact: 'Не будет команд git' })
    expect(blockingReason(report([optional], true))).toBeNull()
  })

  it('joins impacts of blocking problems', () => {
    const first = check({ id: 'node', status: 'missing', blocking: true, impact: 'Агент не запустится.', title: 'Node.js' })
    const second = check({ id: 'gitBash', status: 'missing', blocking: true, impact: 'Нет Git Bash.', title: 'Git Bash' })
    expect(blockingReason(report([first, second], false))).toBe('Агент не запустится. Нет Git Bash.')
  })

  it('falls back to the title when a blocking problem has no impact', () => {
    const blocking = check({ id: 'node', status: 'outdated', blocking: true, title: 'Node.js 22' })
    expect(blockingReason(report([blocking], false))).toBe('Node.js 22')
  })

  it('ignores optional problems', () => {
    const blocking = check({ id: 'node', status: 'missing', blocking: true, impact: 'Нет Node.js.' })
    const optional = check({ id: 'git', status: 'missing', blocking: false, impact: 'Нет git.' })
    expect(blockingReason(report([blocking, optional], false))).toBe('Нет Node.js.')
  })

  it('returns null when the report blocks but no blocking check is failing', () => {
    expect(blockingReason(report([check({ id: 'os' })], false))).toBeNull()
  })
})
