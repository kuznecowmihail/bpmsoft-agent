import { useState } from 'react'
import type { ChoiceAnswer, ChoiceQuestion } from '../chatFormat'
import { formatChoiceAnswers } from '../chatFormat'

interface ChoicesCardProps {
  questions: ChoiceQuestion[]
  interactive: boolean
  onSubmit: (text: string) => void
}

interface Selection {
  selected: number[]
  custom: string
}

function initialSelections(questions: ChoiceQuestion[]): Selection[] {
  return questions.map((question) => {
    const preselected = question.options.flatMap((option, index) => (option.preselected ? [index] : []))
    return { selected: question.multi ? preselected : preselected.slice(0, 1), custom: '' }
  })
}

function toAnswers(questions: ChoiceQuestion[], selections: Selection[]): ChoiceAnswer[] {
  return questions.map((question, index) => ({
    selected: selections[index].selected.map((optionIndex) => question.options[optionIndex].text),
    custom: selections[index].custom.trim()
  }))
}

/**
 * Agent questions from a <choices> block as clickable options. One single-choice question:
 * a click sends the answer at once. Otherwise options are toggled and sent by «Отправить ответы».
 * Every question also has a free-text «Свой ответ» field.
 */
export function ChoicesCard({ questions, interactive, onSubmit }: ChoicesCardProps): React.JSX.Element {
  const [selections, setSelections] = useState<Selection[]>(() => initialSelections(questions))
  const quick = questions.length === 1 && !questions[0].multi
  const allAnswered = selections.every((selection) => selection.selected.length > 0 || selection.custom.trim().length > 0)

  const submit = (next: Selection[]): void => {
    if (interactive) {
      onSubmit(formatChoiceAnswers(questions, toAnswers(questions, next)))
    }
  }

  const update = (questionIndex: number, change: Partial<Selection>): Selection[] => {
    const next = selections.map((selection, index) => (index === questionIndex ? { ...selection, ...change } : selection))
    setSelections(next)
    return next
  }

  const handleOption = (questionIndex: number, optionIndex: number): void => {
    if (!interactive) {
      return
    }
    const question = questions[questionIndex]
    const current = selections[questionIndex].selected
    if (quick) {
      submit([{ selected: [optionIndex], custom: '' }])
      return
    }
    const selected = question.multi
      ? current.includes(optionIndex)
        ? current.filter((index) => index !== optionIndex)
        : [...current, optionIndex]
      : current.includes(optionIndex)
        ? []
        : [optionIndex]
    update(questionIndex, { selected })
  }

  const handleCustomKey = (event: React.KeyboardEvent<HTMLInputElement>, questionIndex: number): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    if (quick) {
      if (selections[questionIndex].custom.trim()) {
        submit([{ selected: [], custom: selections[questionIndex].custom }])
      }
    } else if (allAnswered) {
      submit(selections)
    }
  }

  return (
    <div className={`choices${interactive ? '' : ' is-readonly'}`}>
      {questions.map((question, questionIndex) => {
        const selection = selections[questionIndex]
        return (
          <div key={questionIndex} className="choice-question">
            <div className="choice-question-text">
              {question.text}
              {question.multi && <span className="choice-hint"> · можно несколько</span>}
            </div>
            {question.options.length > 0 && (
              <div className="choice-options">
                {question.options.map((option, optionIndex) => (
                  <button
                    key={optionIndex}
                    type="button"
                    className={`choice-option${selection.selected.includes(optionIndex) ? ' is-selected' : ''}`}
                    onClick={() => handleOption(questionIndex, optionIndex)}
                    disabled={!interactive}
                  >
                    {option.text}
                  </button>
                ))}
              </div>
            )}
            {interactive && (
              <div className="choice-custom-row">
                <input
                  type="text"
                  className="choice-custom"
                  placeholder="Свой ответ"
                  value={selection.custom}
                  onChange={(event) => update(questionIndex, { custom: event.target.value })}
                  onKeyDown={(event) => handleCustomKey(event, questionIndex)}
                />
                {quick && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!selection.custom.trim()}
                    onClick={() => submit([{ selected: [], custom: selection.custom }])}
                  >
                    Отправить
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {interactive && !quick && (
        <div className="choices-footer">
          <button type="button" className="btn btn-primary" disabled={!allAnswered} onClick={() => submit(selections)}>
            Отправить ответы
          </button>
        </div>
      )}
    </div>
  )
}
