/** Connection check results shared by the settings menu and the header badges. */
export type ConnectionKind = 'db' | 'crm' | 'jira' | 'confluence'
export type ConnectionResult = { ok: boolean; text: string }

type Listener = (result: ConnectionResult) => void

const listeners = new Map<ConnectionKind, Set<Listener>>()

/** Called after a check in the settings menu, so the header badge shows the same result. */
export function reportConnection(kind: ConnectionKind, result: ConnectionResult): void {
  listeners.get(kind)?.forEach((listener) => listener(result))
}

export function subscribeConnection(kind: ConnectionKind, listener: Listener): () => void {
  let set = listeners.get(kind)
  if (!set) {
    set = new Set()
    listeners.set(kind, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
  }
}
