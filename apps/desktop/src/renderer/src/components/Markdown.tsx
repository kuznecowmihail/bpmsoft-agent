import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { IconCheck, IconCopy } from './icons'

function CodeBlock({ language, code }: { language: string; code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — nothing to do
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-head">
        <span>{language || 'text'}</span>
        <button type="button" className="code-copy" onClick={handleCopy}>
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? '')
    const match = /language-([\w-]+)/.exec(className ?? '')
    if (!match && !text.includes('\n')) {
      return <code>{children}</code>
    }
    return <CodeBlock language={match?.[1] ?? ''} code={text.replace(/\n$/, '')} />
  },
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

/** Agent reply rendered as GitHub-flavoured markdown (no raw HTML). */
export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
