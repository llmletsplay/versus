import { useState, useEffect } from 'react'
import { gameApi } from '../services/api-client'

interface GameRulesProps {
  gameType: string
  onClose?: () => void
}

export const GameRules = ({ gameType, onClose }: GameRulesProps) => {
  const [rules, setRules] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRules = async () => {
      if (!gameType) return

      setLoading(true)
      setError(null)

      try {
        const response = await gameApi.getRules(gameType)
        if (response.error) {
          setError(response.error)
          return
        }

        if (response.data?.rules) {
          setRules(response.data.rules)
        } else {
          setError('No rules found for this game')
        }
      } catch {
        setError('Failed to load game rules')
      } finally {
        setLoading(false)
      }
    }

    fetchRules()
  }, [gameType])

  const formatMarkdown = (markdown: string): string => {
    // Simple markdown to HTML conversion for basic formatting
    const html = markdown
      // Headers
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      // Bold and italic
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/```[\s\S]*?```/g, match => {
        const code = match.replace(/```(\w+)?\n?/g, '').replace(/```$/g, '')
        return `<pre><code>${code}</code></pre>`
      })
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Lists
      .replace(/^[\s]*[-*+]\s+(.*)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      // Line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')

    return `<p>${html}</p>`
  }

  if (loading) {
    return (
      <div className="game-rules loading">
        <div className="rules-header">
          <h2>Loading Rules...</h2>
          {onClose && (
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="rules-content">
          <div className="loading-spinner">Loading game rules...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="game-rules error">
        <div className="rules-header">
          <h2>Rules Error</h2>
          {onClose && (
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="rules-content">
          <div className="error-message">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="game-rules">
      <div className="rules-header">
        <h2>{gameType.charAt(0).toUpperCase() + gameType.slice(1)} Rules</h2>
        {onClose && (
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <div className="rules-content">
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{ __html: formatMarkdown(rules) }}
        />
      </div>
      <style jsx>{`
        .game-rules {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background: #1a1a1a;
          border-radius: 8px;
          border: 1px solid #333;
        }

        .rules-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid #333;
        }

        .rules-header h2 {
          color: #00ff88;
          margin: 0;
          font-family: var(--font-mono);
        }

        .rules-content {
          max-height: 70vh;
          overflow-y: auto;
          padding-right: 10px;
        }

        .markdown-content {
          color: #e0e0e0;
          line-height: 1.6;
        }

        .markdown-content h1,
        .markdown-content h2,
        .markdown-content h3 {
          color: #00ff88;
          margin-top: 30px;
          margin-bottom: 15px;
        }

        .markdown-content h1 {
          font-size: 1.8rem;
          border-bottom: 2px solid #00ff88;
          padding-bottom: 5px;
        }

        .markdown-content h2 {
          font-size: 1.5rem;
        }

        .markdown-content h3 {
          font-size: 1.2rem;
        }

        .markdown-content strong {
          color: #00ff88;
          font-weight: bold;
        }

        .markdown-content em {
          color: #ffaa00;
          font-style: italic;
        }

        .markdown-content code {
          background: #2a2a2a;
          color: #00ff88;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: var(--font-mono);
        }

        .markdown-content pre {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 5px;
          padding: 15px;
          overflow-x: auto;
          margin: 15px 0;
        }

        .markdown-content pre code {
          background: none;
          padding: 0;
        }

        .markdown-content ul {
          margin: 10px 0;
          padding-left: 20px;
        }

        .markdown-content li {
          margin: 5px 0;
          list-style-type: disc;
        }

        .loading-spinner {
          text-align: center;
          color: #888;
          padding: 40px;
        }

        .error-message {
          color: #ff6b6b;
          text-align: center;
          padding: 40px;
        }

        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 0.9rem;
        }

        .btn-secondary {
          background: #333;
          color: #e0e0e0;
          border: 1px solid #555;
        }

        .btn-secondary:hover {
          background: #444;
          border-color: #00ff88;
        }

        /* Scrollbar styling */
        .rules-content::-webkit-scrollbar {
          width: 8px;
        }

        .rules-content::-webkit-scrollbar-track {
          background: #2a2a2a;
          border-radius: 4px;
        }

        .rules-content::-webkit-scrollbar-thumb {
          background: #555;
          border-radius: 4px;
        }

        .rules-content::-webkit-scrollbar-thumb:hover {
          background: #666;
        }
      `}</style>
    </div>
  )
}
