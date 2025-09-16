import { useState } from 'react'
import { apiClient } from '../services/api-client'

export const ApiTester = () => {
  const [endpoint, setEndpoint] = useState('/api/games')
  const [method, setMethod] = useState('GET')
  const [body, setBody] = useState('')
  const [response, setResponse] = useState<{
    status?: number
    data?: unknown
    error?: string
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const testEndpoint = async () => {
    setLoading(true)
    setResponse(null)

    try {
      const result = await apiClient.testEndpoint(endpoint, method, body)
      if (result.error) {
        setResponse({ error: result.error })
      } else {
        setResponse({ status: 200, data: result.data })
      }
    } catch (error) {
      setResponse({ error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="api-tester">
      <div className="mb-4">
        <div className="grid grid-2 gap-2 mb-2">
          <select value={method} onChange={e => setMethod(e.target.value)} className="select-input">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            type="text"
            value={endpoint}
            onChange={e => setEndpoint(e.target.value)}
            placeholder="/api/games"
            className="text-input"
          />
        </div>

        {method !== 'GET' && (
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder='{"key": "value"}'
            className="textarea-input mb-2"
            rows={3}
          />
        )}

        <button className="btn btn-primary" onClick={testEndpoint} disabled={loading}>
          {loading ? 'testing...' : 'test api'}
        </button>
      </div>

      {response && (
        <div className="api-response">
          <h4>response</h4>
          <pre className="text-sm">
            <code>{JSON.stringify(response, null, 2)}</code>
          </pre>
        </div>
      )}
    </div>
  )
}
