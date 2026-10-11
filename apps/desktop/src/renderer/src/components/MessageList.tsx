import { useState } from 'react'
import { buildBlocks, describeToolCall, permissionSubject, parseChoices, isPlanWithoutChoices, PLAN_CONFIRM_QUESTIONS } from '../chatFormat'
import type { ChatEntry } from '../chatFormat'
import { ChoicesCard } from './ChoicesCard'
import { Markdown } from './Markdown'
import { IconAlert, IconCheck, IconChevronRight, IconLogo } from './icons'

export interface PermissionRequestEntry {
  id: string
  toolName: string
  input: unknown
}

function ActivityItem({ item }: { item: ChatEntry }): React.JSX.Element {
  const className = `activity-item${item.role === 'agent-other' ? ' is-service' : ''}${item.level === 'warn' ? ' is-warn' : ''}`
  return (
    <div className={className}>
      {item.details ? (
        <details>
          <summary>{item.content}</summary>
          <pre>{item.details}</pre>
        </details>
      ) : (
        <span>{item.content}</span>
      )}
    </div>
  )
}

function ActivityGroup({ items, live }: { items: ChatEntry[]; live: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const toolCount = items.filter((item) => item.role === 'agent-tool').length
  const warnCount = items.filter((item) => item.level === 'warn').length
  const last = items[items.length - 1]
  let label = live ? last.content : toolCount > 0 ? `Выполнено действий: ${toolCount}` : `Служебные события: ${items.length}`
  if (!live && warnCount > 0) {
    label += ` · предупреждений: ${warnCount}`
  }
  return (
    <div className={`activity${open ? ' open' : ''}`}>
      <button type="button" className="activity-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
        {live && <span className="pulse-dot" />}
        <span className="activity-label">{label}</span>
        <IconChevronRight size={13} className="activity-chevron" />
      </button>
      {open && (
        <div className="activity-list">
          {items.map((item) => (
            <ActivityItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function PermissionCard({
  request,
  onRespond
}: {
  request: PermissionRequestEntry
  onRespond: (id: string, approved: boolean) => void
}): React.JSX.Element {
  const [showDetails, setShowDetails] = useState(false)
  const subject = permissionSubject(request.toolName, request.input)
  return (
    <div className="permission">
      <div className="permission-title">
        <IconAlert size={15} />
        <span>
          Агент хочет: <b>{describeToolCall(request.toolName, request.input)}</b>
        </span>
      </div>
      {subject && <pre className="permission-subject">{subject}</pre>}
      {showDetails && <pre className="permission-subject">{JSON.stringify(request.input, null, 2)}</pre>}
      <div className="permission-actions">
        <button type="button" className="btn btn-primary" onClick={() => onRespond(request.id, true)}>
          Разрешить
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onRespond(request.id, false)}>
          Отклонить
        </button>
        <button type="button" className="btn btn-ghost btn-sm permission-more" onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? 'Скрыть детали' : 'Подробнее'}
        </button>
      </div>
    </div>
  )
}

interface MessageListProps {
  entries: ChatEntry[]
  isRunning: boolean
  permissionRequests: PermissionRequestEntry[]
  onPermissionResponse: (id: string, approved: boolean) => void
  onChoiceSubmit?: (text: string) => void
}

export function MessageList({
  entries,
  isRunning,
  permissionRequests,
  onPermissionResponse,
  onChoiceSubmit
}: MessageListProps): React.JSX.Element {
  const blocks = buildBlocks(entries)
  const lastBlock = blocks[blocks.length - 1]
  const showThinking =
    isRunning && permissionRequests.length === 0 && (!lastBlock || (lastBlock.kind !== 'activity' && lastBlock.kind !== 'result'))

  // Find the index of the last text block
  let lastTextIndex = -1
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind === 'text') {
      lastTextIndex = i
      break
    }
  }

  // Check if there's a user block after the current index
  const hasUserBlockAfter = (index: number): boolean => {
    return blocks.slice(index + 1).some((block) => block.kind === 'user')
  }

  return (
    <div className="feed-inner">
      {blocks.map((block, index) => {
        if (block.kind === 'user') {
          return (
            <div key={block.entry.id} className="msg msg-user">
              {block.entry.content}
            </div>
          )
        }
        if (block.kind === 'text') {
          const parsed = parseChoices(block.entry.content)
          const interactive = !isRunning && onChoiceSubmit != null && index === lastTextIndex && !hasUserBlockAfter(index)

          return (
            <div key={block.entry.id} className="msg msg-agent">
              {block.showAvatar ? (
                <div className="avatar">
                  <IconLogo size={14} />
                </div>
              ) : (
                <div className="avatar-spacer" />
              )}
              <div className="msg-agent-body">
                {parsed ? (
                  <>
                    {parsed.before && <Markdown text={parsed.before} />}
                    <ChoicesCard
                      questions={parsed.questions}
                      interactive={interactive}
                      onSubmit={onChoiceSubmit || (() => {})}
                    />
                    {parsed.after && <Markdown text={parsed.after} />}
                  </>
                ) : (
                  <>
                    <Markdown text={block.entry.content} />
                    {interactive && isPlanWithoutChoices(block.entry.content) && (
                      <ChoicesCard
                        questions={PLAN_CONFIRM_QUESTIONS}
                        interactive
                        onSubmit={onChoiceSubmit || (() => {})}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )
        }
        if (block.kind === 'result') {
          const isError = block.entry.level === 'error'
          return (
            <div key={block.entry.id} className={`turn-result${isError ? ' is-error' : ''}`}>
              {isError ? <IconAlert size={13} /> : <IconCheck size={13} />}
              {block.entry.content}
            </div>
          )
        }
        return <ActivityGroup key={block.id} items={block.items} live={isRunning && index === blocks.length - 1} />
      })}
      {showThinking && (
        <div className="activity">
          <span className="activity-summary is-static">
            <span className="pulse-dot" />
            <span className="activity-label">Думает…</span>
          </span>
        </div>
      )}
      {permissionRequests.map((request) => (
        <PermissionCard key={request.id} request={request} onRespond={onPermissionResponse} />
      ))}
    </div>
  )
}
