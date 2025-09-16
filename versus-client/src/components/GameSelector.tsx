import { useState, useEffect } from 'react'
import { gameApi } from '../services/api-client'
import type { GameMetadata } from '../services/api-client'
import { GameRules } from './GameRules'

export const GameSelector = () => {
  const [games, setGames] = useState<Record<string, GameMetadata>>({})
  const [selectedGame, setSelectedGame] = useState<string>('')
  const [gameData, setGameData] = useState<object | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await gameApi.getMetadata()
        if (response.error) {
          setError(response.error)
          return
        }

        const data = response.data as Record<string, GameMetadata>
        setGames(data)
        const gameTypes = Object.keys(data)
        if (gameTypes.length > 0) setSelectedGame(gameTypes[0])
      } catch {
        setError('Failed to fetch games')
      }
    }
    fetchGames()
  }, [])

  const createGame = async () => {
    if (!selectedGame) return

    setLoading(true)
    setError(null)

    try {
      const response = await gameApi.create(selectedGame)
      if (response.error) {
        setError(response.error)
        return
      }

      // Fetch game state
      const stateResponse = await gameApi.getState(selectedGame, response.data!.gameId)
      if (stateResponse.error) {
        setError(stateResponse.error)
        return
      }

      setGameData(stateResponse.data || null)
    } catch {
      setError('Failed to create game')
    } finally {
      setLoading(false)
    }
  }

  const selectedGameMetadata = selectedGame ? games[selectedGame] : null

  return (
    <div className="game-selector">
      {error && <div className="error-message mb-4">{error}</div>}

      <div className="mb-4">
        <select
          value={selectedGame}
          onChange={e => setSelectedGame(e.target.value)}
          className="select-input"
          disabled={loading}
        >
          {Object.entries(games).map(([gameType, metadata]) => (
            <option key={gameType} value={gameType}>
              {metadata.name} ({metadata.complexity})
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary ml-2"
          onClick={createGame}
          disabled={loading || !selectedGame}
        >
          {loading ? 'creating...' : 'create game'}
        </button>
        <button
          className="btn btn-info ml-2"
          onClick={() => setShowRules(true)}
          disabled={!selectedGame}
        >
          rules
        </button>
      </div>

      {selectedGameMetadata && (
        <div className="game-info mb-4">
          <h4>{selectedGameMetadata.name}</h4>
          <p className="text-muted mb-2">{selectedGameMetadata.description}</p>
          <div className="game-details">
            <span className="detail-badge">
              👥 {selectedGameMetadata.minPlayers}-{selectedGameMetadata.maxPlayers} players
            </span>
            <span className="detail-badge">⏱️ {selectedGameMetadata.estimatedDuration}</span>
            <span className="detail-badge">🎯 {selectedGameMetadata.complexity}</span>
          </div>
          <div className="game-categories">
            {selectedGameMetadata.categories.map(category => (
              <span key={category} className="category-tag">
                {category}
              </span>
            ))}
          </div>
        </div>
      )}

      {gameData && (
        <div className="game-data">
          <h4>game state</h4>
          <pre className="text-sm">
            <code>{JSON.stringify(gameData, null, 2)}</code>
          </pre>
        </div>
      )}

      {showRules && selectedGame && (
        <div className="rules-modal">
          <div className="rules-overlay" onClick={() => setShowRules(false)} />
          <div className="rules-container">
            <GameRules gameType={selectedGame} onClose={() => setShowRules(false)} />
          </div>
        </div>
      )}

      <style jsx>{`
        .rules-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .rules-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          cursor: pointer;
        }

        .rules-container {
          position: relative;
          z-index: 1001;
          max-width: 90vw;
          max-height: 90vh;
          overflow: auto;
        }

        .btn-info {
          background: #0066cc;
          color: white;
          border: 1px solid #0066cc;
        }

        .btn-info:hover:not(:disabled) {
          background: #0080ff;
          border-color: #00ff88;
        }

        .btn-info:disabled {
          background: #333;
          color: #666;
          border-color: #333;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
