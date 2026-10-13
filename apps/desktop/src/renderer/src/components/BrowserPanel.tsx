import { useEffect, useRef, useState } from 'react'
import type { CrmBrowserState } from '../../../shared/types'
import { IconGlobe, IconRefresh, IconX } from './icons'

interface BrowserPanelProps {
  open: boolean
  /** Settings popover or logs drawer is open: the native browser view would cover them, so it steps aside. */
  overlayOpen: boolean
  onClose: () => void
}

/** Right-side panel with the agent's CRM browser. The page itself is a native view placed over the content div. */
export function BrowserPanel({ open, overlayOpen, onClose }: BrowserPanelProps): React.JSX.Element {
  const [browserState, setBrowserState] = useState<CrmBrowserState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const viewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => window.api.onCrmBrowserState(setBrowserState), [])

  // the native view follows the content div: report its rectangle on mount, on resize and on window resize
  useEffect(() => {
    const element = viewRef.current
    if (!element) {
      return
    }
    const report = (): void => {
      const rect = element.getBoundingClientRect()
      void window.api.setCrmBrowserBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  useEffect(() => {
    void window.api.setCrmBrowserVisible(open && !overlayOpen)
  }, [open, overlayOpen])

  useEffect(() => {
    return () => {
      void window.api.setCrmBrowserVisible(false)
    }
  }, [])

  const openHome = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.api.openCrmBrowserHome()
    } catch (caught) {
      setError((caught as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="browser-panel">
      <div className="browser-panel-toolbar">
        <IconGlobe size={14} />
        <span className="browser-panel-title">Браузер CRM</span>
        <span className="browser-panel-url" title={browserState?.url ?? ''}>
          {browserState?.hasPage
            ? (browserState.loading ? 'Загрузка… ' : '') + (browserState.title || browserState.url)
            : 'Страница не открыта'}
        </span>
        <button className="btn btn-ghost btn-sm" title="Открыть главную CRM" onClick={openHome} disabled={busy}>
          Главная
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          title="Обновить страницу"
          onClick={() => window.api.reloadCrmBrowser()}
          disabled={!browserState?.hasPage}
        >
          <IconRefresh size={14} />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Скрыть панель" onClick={onClose}>
          <IconX size={14} />
        </button>
      </div>
      {error && <div className="browser-panel-error">{error}</div>}
      <div className="browser-panel-view" ref={viewRef}>
        {!browserState?.hasPage && (
          <div className="browser-panel-empty">
            <p>Здесь откроется CRM, когда агент начнёт проверять страницы. Можно открыть и самому — вход учётной записью из настроек.</p>
            <button className="btn btn-secondary btn-sm" onClick={openHome} disabled={busy}>
              Открыть CRM
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
