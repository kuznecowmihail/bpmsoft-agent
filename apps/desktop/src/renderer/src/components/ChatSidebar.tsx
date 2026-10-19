import type { ChatSummary } from '../../../shared/types'
import { IconPlus } from './icons'

interface ChatSidebarProps {
  chats: ChatSummary[]
  activeChatId: string | null
  disabled: boolean
  onSelect: (id: string) => void
  onNewChat: () => void
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** Today → HH:MM, otherwise DD.MM HH:MM. */
function formatChatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const now = new Date()
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  return isToday ? time : `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${time}`
}

const PROVIDER_LABELS: Record<ChatSummary['provider'], string> = { claude: 'Claude', cursor: 'Cursor' }

export function ChatSidebar({ chats, activeChatId, disabled, onSelect, onNewChat }: ChatSidebarProps): React.JSX.Element {
  return (
    <aside className="sidebar">
      <button type="button" className="btn btn-primary sidebar-new" onClick={onNewChat} disabled={disabled} title={disabled ? 'Дождитесь окончания ответа агента' : 'Начать новый чат'}>
        <IconPlus size={14} />
        <span>Новый чат</span>
      </button>
      <div className="sidebar-list">
        {chats.length === 0 ? (
          <div className="sidebar-empty">Здесь появятся чаты этого стенда</div>
        ) : (
          chats.map((chat) => {
            const classes = ['sidebar-item']
            if (chat.id === activeChatId) classes.push('is-active')
            if (chat.contextLost) classes.push('is-lost')
            return (
              <button
                key={chat.id}
                type="button"
                className={classes.join(' ')}
                onClick={() => onSelect(chat.id)}
                disabled={disabled}
                title={chat.title}
              >
                <span className="sidebar-title">{chat.title}</span>
                <span className="sidebar-meta">
                  <span className="sidebar-time">{formatChatTime(chat.updatedAt)}</span>
                  <span className={`sidebar-provider is-${chat.provider}`}>{PROVIDER_LABELS[chat.provider]}</span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}
