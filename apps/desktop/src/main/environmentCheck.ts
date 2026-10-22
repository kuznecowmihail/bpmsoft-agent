import type { AgentProvider, DeviceInfo, EnvCheck, EnvironmentReport } from '../shared/types'

/** Minimum macOS major version (Darwin kernel 22 = macOS 13). */
const MIN_MACOS_DARWIN_MAJOR = 22
/** Minimum Windows 10 build (1809). */
const MIN_WINDOWS_BUILD = 17763
const MIN_NODE_MAJOR = 18

/** Numbers of the first version-like text: 'v22.11.0' -> [22, 11, 0], 'git version 2.47.1.windows.1' -> [2, 47, 1]. */
export function parseVersion(text: string | null): number[] | null {
  if (!text) return null
  const match = text.match(/\d+(?:\.\d+)*/)
  return match ? match[0].split('.').map(Number) : null
}

function osCheck(device: DeviceInfo): EnvCheck {
  const check: EnvCheck = { id: 'os', title: 'Операционная система', status: 'ok', blocking: true, found: device.osVersion }
  const release = parseVersion(device.osRelease)
  let supported = true
  let hint = ''
  if (device.platform === 'darwin') {
    supported = (release?.[0] ?? 0) >= MIN_MACOS_DARWIN_MAJOR
    hint = 'Нужна macOS 13 или новее'
  } else if (device.platform === 'win32') {
    supported = (release?.[2] ?? 0) >= MIN_WINDOWS_BUILD
    hint = 'Нужна Windows 10 1809 (сборка 17763) или новее'
  }
  if (!supported) {
    check.status = 'outdated'
    check.impact = 'Claude Code и Cursor не запускаются на этой версии ОС'
    check.hint = hint
  }
  return check
}

function nodeCheck(device: DeviceInfo): EnvCheck {
  const check: EnvCheck = { id: 'node', title: 'Node.js', status: 'ok', blocking: false }
  if (device.nodeVersion === null) {
    check.status = 'missing'
  } else {
    check.found = device.nodeVersion
    if ((parseVersion(device.nodeVersion)?.[0] ?? 0) < MIN_NODE_MAJOR) {
      check.status = 'outdated'
    }
  }
  if (check.status !== 'ok') {
    check.impact = 'Без Node.js агент не строит полную иерархию клиентских схем и не выполняет разовые скрипты'
    check.hint =
      device.platform === 'darwin'
        ? 'Установите Node.js LTS с nodejs.org или командой brew install node и перезапустите приложение'
        : 'Установите Node.js LTS с nodejs.org и перезапустите приложение'
    check.installUrl = 'https://nodejs.org'
  }
  return check
}

function gitCheck(device: DeviceInfo): EnvCheck {
  const check: EnvCheck = { id: 'git', title: 'git', status: 'ok', blocking: false }
  if (device.gitVersion === null) {
    check.status = 'missing'
    check.impact = 'Агент пропустит git status и откат правок в Pkg'
    check.hint = 'Установите git и перезапустите приложение'
    check.installUrl = 'https://git-scm.com/downloads'
  } else {
    check.found = device.gitVersion
  }
  return check
}

function gitBashCheck(device: DeviceInfo, provider: AgentProvider): EnvCheck {
  const blocking = provider === 'cursor'
  const check: EnvCheck = { id: 'gitBash', title: 'Git Bash', status: 'ok', blocking }
  if (device.gitBashPath === null) {
    check.status = 'missing'
    check.impact =
      provider === 'cursor'
        ? 'Провайдер Cursor выполняет команды агента только через Git Bash — без него проект не откроется. Установите Git for Windows или переключитесь на Claude в «Настройках»'
        : 'Без Git Bash Claude Code выполняет команды через PowerShell и будет спрашивать разрешение на каждую'
    check.hint = 'Установите Git for Windows и перезапустите приложение'
    check.installUrl = 'https://git-scm.com/download/win'
  } else {
    check.found = device.gitBashPath
  }
  return check
}

/** Checks the computer for the agent's requirements; blocking problems prevent opening a project. */
export function evaluateEnvironment(device: DeviceInfo, provider: AgentProvider): EnvironmentReport {
  const checks: EnvCheck[] = [osCheck(device), nodeCheck(device), gitCheck(device)]
  if (device.platform === 'win32') {
    checks.push(gitBashCheck(device, provider))
  }
  return {
    device,
    checks,
    canOpenProject: !checks.some((check) => check.blocking && check.status !== 'ok')
  }
}
