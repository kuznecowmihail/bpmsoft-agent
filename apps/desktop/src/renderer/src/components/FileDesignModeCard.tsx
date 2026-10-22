import { useEffect, useState } from 'react'
import type { FileDesignModeCheck } from '../../../shared/types'
import { IconAlert, IconCopy } from './icons'

interface FileDesignModeCardProps {
  check: FileDesignModeCheck
  onRecheck: () => void
  rechecking: boolean
}

/** Settings the BPMSoft site needs to read its files from the file system. */
const CONFIG_LINES = ['<fileDesignMode enabled="true" />', '<add key="UseStaticFileContent" value="false" />']

const DISABLED_STEPS = [
  'Откройте файл в редакторе',
  'Поставьте значения выше (fileDesignMode — в разделе configuration, ключ — в appSettings)',
  'Перезапустите сайт BPMSoft (пул IIS или службу)',
  'Нажмите «Проверить снова»'
]

const NOT_FOUND_STEPS = [
  'Выберите корень приложения BPMSoft — папку, где лежат BPMSoft.Configuration и BPMSoft.WebHost.dll.config (или Web.config)',
  'Если файл на месте, проверьте права на чтение'
]

/** Warning card for a stand where the file design mode is off or its config is not found. */
export function FileDesignModeCard({ check, onRecheck, rechecking }: FileDesignModeCardProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const notFound = check.status === 'notFound'
  const steps = notFound ? NOT_FOUND_STEPS : DISABLED_STEPS

  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(CONFIG_LINES.join('\n'))
      setCopied(true)
    } catch {
      // clipboard unavailable — the lines are shown on screen
    }
  }

  return (
    <div className="fdm-card">
      <div className="fdm-title">
        <IconAlert size={14} />
        <span>{notFound ? 'Не найден конфиг стенда' : 'Не включён режим разработки в файловой системе'}</span>
      </div>
      <div className="fdm-text">Без него «Обновить из файловой системы» не подхватит правки агента, поэтому проект не открывается.</div>
      {check.configPath && (
        <div className="fdm-path">
          Файл: <span className="fdm-mono">{check.configPath}</span>
        </div>
      )}
      {check.problems.length > 0 && (
        <ul className="fdm-problems">
          {check.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {!notFound && (
        <div className="fdm-code">
          <div className="fdm-code-head">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopy}>
              <IconCopy size={13} />
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <pre>{CONFIG_LINES.join('\n')}</pre>
        </div>
      )}
      <ol className="fdm-steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <button type="button" className="btn btn-primary btn-block" onClick={onRecheck} disabled={rechecking}>
        {rechecking && <span className="spinner" />}
        Проверить снова
      </button>
    </div>
  )
}
