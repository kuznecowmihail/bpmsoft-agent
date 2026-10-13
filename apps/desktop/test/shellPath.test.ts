import { describe, it, expect } from 'vitest'
import { extractMarkedPath } from '../src/main/shellPath'

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
