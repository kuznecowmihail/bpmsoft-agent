import { useEffect, useState } from 'react'
import type { EnvCheck, EnvironmentReport } from '../../../shared/types'
import { describeApp, describeDevice, problemChecks } from '../environmentFormat'
import { IconAlert, IconCheck, IconChevronRight, IconRefresh, IconX } from './icons'

interface EnvironmentPanelProps {
  report: EnvironmentReport | null
  onRecheck: () => void
  rechecking: boolean
  /** Show the details even when everything is ready. */
  defaultOpen?: boolean
}

/** Russian plural for the number of problems. */
function problemWord(count: number): string {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) {
    return 'проблем'
  }
  if (last === 1) {
    return 'проблема'
  }
  if (last >= 2 && last <= 4) {
    return 'проблемы'
  }
  return 'проблем'
}

function statusText(check: EnvCheck): string {
  return check.status === 'missing' ? 'не найден' : 'устарел'
}

function CheckRow({ check }: { check: EnvCheck }): React.JSX.Element {
  if (check.status === 'ok') {
    return (
      <li className="env-check">
        <IconCheck size={14} className="env-check-icon is-ok" />
        <div className="env-check-main">
          <div className="env-check-row">
            <span className="env-check-title">{check.title}</span>
            {check.found && <span className="env-check-found">{check.found}</span>}
          </div>
        </div>
      </li>
    )
  }

  const iconClass = check.blocking ? 'is-error' : 'is-warning'
  return (
    <li className="env-check">
      {check.blocking ? (
        <IconX size={14} className={`env-check-icon ${iconClass}`} />
      ) : (
        <IconAlert size={14} className={`env-check-icon ${iconClass}`} />
      )}
      <div className="env-check-main">
        <div className="env-check-row">
          <span className="env-check-title">{check.title}</span>
          <span className={`env-check-found ${iconClass}`}>{statusText(check)}</span>
        </div>
        {check.impact && <div className="env-check-impact">{check.impact}</div>}
        {check.hint && <div className="env-check-hint">{check.hint}</div>}
        {check.installUrl && (
          <a className="env-check-link" href={check.installUrl} target="_blank" rel="noreferrer">
            Скачать
          </a>
        )}
      </div>
    </li>
  )
}

/** Collapsible block with the computer and tools check: what is installed and what is missing. */
export function EnvironmentPanel({ report, onRecheck, rechecking, defaultOpen = false }: EnvironmentPanelProps): React.JSX.Element {
  const problems = problemChecks(report)
  const hasProblems = problems.length > 0
  const blocking = problems.some((check) => check.blocking)
  const reportReady = report !== null
  const [open, setOpen] = useState(defaultOpen || hasProblems)

  // the report arrives after mount: open the details once there is something to show
  useEffect(() => {
    if (reportReady && (defaultOpen || hasProblems)) {
      setOpen(true)
    }
  }, [reportReady, defaultOpen, hasProblems])

  let summaryClass = 'is-ok'
  let summaryText = 'всё готово'
  if (report && hasProblems) {
    summaryClass = blocking ? 'is-error' : 'is-warning'
    summaryText = `${problems.length} ${problemWord(problems.length)}`
  }

  return (
    <div className="env-panel">
      <button type="button" className="env-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <IconChevronRight size={14} className={`env-chevron${open ? ' is-open' : ''}`} />
        <span>Об устройстве</span>
        {report && <span className={`env-summary ${summaryClass}`}>{summaryText}</span>}
      </button>
      {open && (
        <div className="env-body">
          {report ? (
            <>
              <div className="env-device">{describeDevice(report.device)}</div>
              <div className="env-app">{describeApp(report.device)}</div>
              <ul className="env-checks">
                {report.checks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </ul>
              <div className="env-foot">
                <button type="button" className="btn btn-ghost btn-sm" onClick={onRecheck} disabled={rechecking}>
                  {rechecking ? <span className="spinner" /> : <IconRefresh size={13} />}
                  Проверить снова
                </button>
                <div className="env-note">После установки программы перезапустите приложение, если проверка её не видит.</div>
              </div>
            </>
          ) : (
            <div className="env-device">Проверяю компьютер…</div>
          )}
        </div>
      )}
    </div>
  )
}
