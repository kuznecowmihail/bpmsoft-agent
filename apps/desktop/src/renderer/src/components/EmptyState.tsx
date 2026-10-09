import type { ReactNode } from 'react'
import { IconBox, IconFlow, IconLayout, IconLogo, IconSearch } from './icons'

interface Suggestion {
  icon: ReactNode
  title: string
  text: string
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <IconBox size={15} />,
    title: 'Новый справочник',
    text: 'Создай справочник «Тип доставки» с записями «Курьер» и «Самовывоз»'
  },
  {
    icon: <IconLayout size={15} />,
    title: 'Поле на странице',
    text: 'Добавь на страницу контрагента поле «Тип доставки»'
  },
  {
    icon: <IconFlow size={15} />,
    title: 'Бизнес-процесс',
    text: 'Создай процесс, который при добавлении записи создаёт задачу ответственному'
  },
  {
    icon: <IconSearch size={15} />,
    title: 'Анализ',
    text: 'Объясни, как устроена страница контрагента и откуда берутся её поля'
  }
]

interface EmptyStateProps {
  projectName: string
  onPick: (text: string) => void
}

export function EmptyState({ projectName, onPick }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="empty">
      <div className="logo-lg">
        <IconLogo size={24} />
      </div>
      <h2>Что будем делать?</h2>
      <p>
        Агент работает с пакетами проекта <b>{projectName}</b>: уточнит требования, предложит план и внесёт изменения
        после вашего подтверждения.
      </p>
      <div className="suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion.title} type="button" className="suggestion" onClick={() => onPick(suggestion.text)}>
            <div className="suggestion-title">
              <span className="suggestion-icon">{suggestion.icon}</span>
              {suggestion.title}
            </div>
            <div className="suggestion-text">{suggestion.text}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
