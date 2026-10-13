import { execFileSync } from 'child_process'

const MARKER = '__BPMSOFT_AGENT_PATH__'

/** Extracts PATH printed between markers; rc files of the shell may print extra text around it. */
export function extractMarkedPath(output: string): string | null {
  const match = output.match(new RegExp(`${MARKER}(.*)${MARKER}`, 's'))
  const value = match?.[1].trim()
  return value ? value : null
}

/**
 * An app started from Finder gets a minimal PATH without Homebrew or nvm, so the agent
 * cannot run node or git. Takes PATH from the user's login shell (macOS only).
 */
export function loadLoginShellPath(): void {
  if (process.platform !== 'darwin') return
  const shell = process.env['SHELL'] || '/bin/zsh'
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
