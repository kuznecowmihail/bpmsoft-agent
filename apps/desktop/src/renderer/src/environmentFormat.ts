import type { DeviceInfo, EnvCheck, EnvironmentReport } from '../../shared/types'

/** Operating system line, e.g. «macOS 15.0.1» or «Windows 10.0.22631». */
export function osLabel(d: DeviceInfo): string {
  if (d.platform === 'darwin') {
    return `macOS ${d.osVersion}`
  }
  if (d.platform === 'win32') {
    return `Windows ${d.osVersion}`
  }
  return `${d.platform} ${d.osRelease}`
}

/** Processor line: Apple Silicon, Intel, Rosetta translation or the plain architecture name. */
export function chipLabel(d: DeviceInfo): string {
  if (d.platform === 'darwin' && d.arch === 'arm64') {
    return 'Apple Silicon (arm64)'
  }
  if (d.platform === 'darwin' && d.arch === 'x64' && d.rosetta) {
    return 'Apple Silicon через Rosetta (x64)'
  }
  if (d.platform === 'darwin' && d.arch === 'x64') {
    return 'Intel (x64)'
  }
  if (d.arch === 'x64') {
    return 'x64'
  }
  if (d.arch === 'arm64') {
    return 'ARM64'
  }
  if (d.arch === 'ia32') {
    return 'x86'
  }
  return d.arch
}

/** One line about the computer: system, chip, CPU model and memory. */
export function describeDevice(d: DeviceInfo): string {
  return [osLabel(d), chipLabel(d), d.cpuModel, `${d.memoryGb} ГБ`].filter((part) => part !== '').join(' · ')
}

/** Line about the application and its runtime versions. */
export function describeApp(d: DeviceInfo): string {
  return `Приложение ${d.appVersion} · Electron ${d.electronVersion}`
}

/** Checks that need attention: anything that is not ok. */
export function problemChecks(r: EnvironmentReport | null): EnvCheck[] {
  if (!r) {
    return []
  }
  return r.checks.filter((check) => check.status !== 'ok')
}

/**
 * Text explaining why the computer cannot open a project, or null when it can
 * (or there is no report yet). Uses the impact of each blocking problem, or its title.
 */
export function blockingReason(r: EnvironmentReport | null): string | null {
  if (!r || r.canOpenProject) {
    return null
  }
  const reasons = problemChecks(r)
    .filter((check) => check.blocking)
    .map((check) => check.impact ?? check.title)
  const text = reasons.join(' ')
  return text === '' ? null : text
}
