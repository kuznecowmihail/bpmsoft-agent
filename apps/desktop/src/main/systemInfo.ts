import { execFile } from 'child_process'
import * as os from 'os'
import { app } from 'electron'
import { resolveGitBash } from '@bpmsoft-agent/agent-runtime'
import type { DeviceInfo } from '../shared/types'

/** Runs a program without a shell; trimmed stdout, or null when it fails or prints nothing. */
function run(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 3000, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : stdout.toString().trim() || null)
    })
  })
}

/** Facts about the computer and the installed tools, for the environment check. */
export async function collectDeviceInfo(): Promise<DeviceInfo> {
  const platform = process.platform
  const [nodeVersion, gitVersion, translated] = await Promise.all([
    run('node', ['--version']),
    run('git', ['--version']),
    platform === 'darwin' ? run('/usr/sbin/sysctl', ['-n', 'sysctl.proc_translated']) : Promise.resolve(null)
  ])

  return {
    platform,
    arch: process.arch,
    rosetta: platform === 'darwin' && translated === '1',
    osVersion: process.getSystemVersion(),
    osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model ?? '',
    memoryGb: Math.round(os.totalmem() / 2 ** 30),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? '',
    nodeVersion,
    gitVersion,
    gitBashPath: platform === 'win32' ? resolveGitBash() : null
  }
}
