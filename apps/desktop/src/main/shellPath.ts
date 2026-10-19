import { execFileSync } from 'child_process'

const MARKER = '__BPMSOFT_AGENT_PATH__'

/** Extracts PATH printed between markers; rc files of the shell may print extra text around it. */
export function extractMarkedPath(output: string): string | null {
  const match = output.match(new RegExp(`${MARKER}(.*)${MARKER}`, 's'))
  const value = match?.[1].trim()
  return value ? value : null
}

/** macOS (Finder) and Linux (desktop launchers) start apps with a minimal PATH; Windows apps inherit the full user PATH. */
export function usesLoginShellPath(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin' || platform === 'linux'
}

/** The user's shell, or the usual default of the platform (zsh on macOS, bash on Linux). */
export function defaultLoginShell(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  return env['SHELL'] || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
}

/**
 * An app started from Finder or a Linux desktop launcher gets a minimal PATH without Homebrew, nvm or ~/.local/bin,
 * so the agent cannot run node or git. Takes PATH from the user's login shell (macOS and Linux).
 */
export function loadLoginShellPath(): void {
  if (!usesLoginShellPath()) return
  const shell = defaultLoginShell()
  try {
    const output = execFileSync(shell, ['-ilc', `printf '%s%s%s' ${MARKER} "$PATH" ${MARKER}`], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const shellPath = extractMarkedPath(output)
    if (shellPath) process.env['PATH'] = shellPath
  } catch {
    // keep the inherited PATH
  }
}
