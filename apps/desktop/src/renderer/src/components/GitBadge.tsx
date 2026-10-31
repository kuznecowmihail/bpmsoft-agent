import { useEffect, useRef, useState } from 'react'
import type { GitRepoState, GitState } from '../../../shared/types'
import { IconBranch } from './icons'

interface GitBadgeProps {
  /** Pkg folder: the git repositories are read from here. */
  pkgRoot?: string
  isRunning: boolean
  onOpenChange?: (open: boolean) => void
}

type GitBadgeState = 'checking' | 'ok' | 'warn' | 'error' | 'off'

const GIT_MISSING_TEXT = 'git не установлен — ветку и MR не сделать'
const NO_REPOS_TEXT = 'Pkg и пакеты не в git-репозитории'

/** Russian plural of «ветка»: 1 ветка, 2 ветки, 5 веток. */
function branchWord(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return 'ветка'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'ветки'
  return 'веток'
}

function repoHint(repo: GitRepoState): string {
  const parts: string[] = [repo.target ? `MR в ${repo.target}` : 'целевая ветка не найдена']
  if (repo.ahead > 0) parts.push(`впереди на ${repo.ahead}`)
  if (repo.behind > 0) parts.push(`отстаёт на ${repo.behind}`)
  if (repo.changed > 0) parts.push(`изменено файлов: ${repo.changed}`)
  if (repo.branch === 'HEAD') parts.push('detached HEAD')
  return parts.join(' · ')
}

/** Header badge with the git branch of the Pkg repositories; click opens the branch details. */
export function GitBadge({ pkgRoot, isRunning, onOpenChange }: GitBadgeProps): React.JSX.Element | null {
  const [git, setGit] = useState<GitState | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  // only the latest request may update the state
  const requestRef = useRef(0)
  const prevRunningRef = useRef(isRunning)

  const refresh = async (): Promise<void> => {
    if (!pkgRoot) {
      return
    }
    const request = ++requestRef.current
    setLoading(true)
    try {
      const result = await window.api.gitStatus(pkgRoot)
      if (request !== requestRef.current) return
      setGit(result)
      setError('')
    } catch (caught) {
      if (request !== requestRef.current) return
      setError((caught as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      if (request === requestRef.current) {
        setLoading(false)
      }
    }
  }

  // a new Pkg folder: drop the old state and read the new one
  useEffect(() => {
    setGit(null)
    setError('')
    void refresh()
  }, [pkgRoot])

  // the branch may change in a terminal or in the CRM while the window is in the background
  useEffect(() => {
    const handleFocus = (): void => {
      void refresh()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [pkgRoot])

  // the agent may have switched the branch or changed files during its turn
  useEffect(() => {
    if (prevRunningRef.current && !isRunning) {
      void refresh()
    }
    prevRunningRef.current = isRunning
  }, [isRunning])

  useEffect(() => {
    onOpenChange?.(open)
    if (open) {
      void refresh()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const handleMouseDown = (event: MouseEvent): void => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!pkgRoot) {
    return null
  }

  let state: GitBadgeState
  let text: string
  let title: string
  if (!git && !error) {
    state = 'checking'
    text = 'git…'
    title = 'Проверяю ветки git…'
  } else if (error) {
    state = 'error'
    text = 'git: ошибка'
    title = error
  } else if (!git || git.gitMissing) {
    state = 'off'
    text = 'git не найден'
    title = GIT_MISSING_TEXT
  } else if (git.repos.length === 0) {
    state = 'off'
    text = 'без git'
    title = NO_REPOS_TEXT
  } else {
    const branches = Array.from(new Set(git.repos.map((repo) => repo.branch)))
    text = branches.length === 1 ? branches[0] : `${branches.length} ${branchWord(branches.length)}`
    const hasWarning = git.repos.some((repo) => repo.behind > 0 || repo.branch === 'HEAD' || repo.branch === '?')
    state = hasWarning ? 'warn' : 'ok'
    title = [...git.repos.map((repo) => `${repo.label}: ${repo.branch}`), 'Нажмите, чтобы посмотреть подробности'].join('\n')
  }

  return (
    <div className="popover-anchor env-anchor" ref={anchorRef}>
      <button
        type="button"
        className={`db-badge git-badge is-${state}`}
        title={title}
        disabled={state === 'checking'}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <IconBranch size={11} />
        {text}
      </button>
      {open && (
        <div className="popover env-popover git-popover" role="dialog" aria-label="Ветки git">
          <div className="popover-section">
            <div className="popover-label">Ветки git</div>
            {error && <div className="popover-error">{error}</div>}
            {!error && git && (git.gitMissing || git.repos.length === 0) && (
              <div className="popover-note">{git.gitMissing ? GIT_MISSING_TEXT : NO_REPOS_TEXT}</div>
            )}
            {!error &&
              git &&
              git.repos.map((repo) => (
                <div key={repo.dir} className="git-repo">
                  <div className="popover-row-title">
                    <b>{repo.label}</b> · {repo.branch}
                  </div>
                  <div className="popover-row-hint">{repoHint(repo)}</div>
                </div>
              ))}
            {!error && git && git.withoutGit.length > 0 && <div className="popover-note">Без git: {git.withoutGit.join(', ')}</div>}
            <div className="popover-note">Сравнение с origin — по данным последнего git fetch.</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Обновляю…' : 'Обновить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
