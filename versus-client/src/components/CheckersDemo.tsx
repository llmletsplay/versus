import { useState } from 'react'
import { gameApi } from '../services/api-client'

interface CheckersPiece {
  type: 'man' | 'king'
  color: 'red' | 'black'
}

type CheckersBoard = (CheckersPiece | null)[][]

interface CheckersState {
  gameId: string
  gameType: string
  board: CheckersBoard
  currentPlayer: 'red' | 'black'
  gameOver: boolean
  winner: string | null
  mustJump: boolean
  jumpingPiece: { row: number; col: number } | null
}

const PIECE_SYMBOLS: Record<string, Record<string, string>> = {
  red: {
    man: '🔴',
    king: '👑'
  },
  black: {
    man: '⚫',
    king: '♔'
  }
}

export const CheckersDemo = () => {
  const [gameState, setGameState] = useState<CheckersState | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<{row: number, col: number} | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createGame = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await gameApi.create('checkers')
      if (response.error) {
        setError(response.error)
        return
      }

      setGameId(response.data!.gameId)
      await loadGameState(response.data!.gameId)
    } catch {
      setError('Failed to create game')
    } finally {
      setLoading(false)
    }
  }

  const loadGameState = async (id: string) => {
    try {
      const response = await gameApi.getState('checkers', id)
      if (response.error) {
        setError(response.error)
        return
      }

      setGameState(response.data as CheckersState)
    } catch {
      setError('Failed to load game state')
    }
  }

  const makeMove = async (from: {row: number, col: number}, to: {row: number, col: number}) => {
    if (!gameId || loading) return

    setLoading(true)
    setError(null)

    try {
      const response = await gameApi.makeMove('checkers', gameId, {
        from,
        to,
        player: gameState!.currentPlayer
      })

      if (response.error) {
        setError(response.error)
        return
      }

      await loadGameState(gameId)
      setSelectedSquare(null)
    } catch {
      setError('Failed to make move')
    } finally {
      setLoading(false)
    }
  }

  const handleSquareClick = (row: number, col: number) => {
    if (!gameState || gameState.gameOver || loading) return

    // Checkers only uses dark squares
    if ((row + col) % 2 === 0) return

    if (selectedSquare) {
      // If clicking on the same square, deselect
      if (selectedSquare.row === row && selectedSquare.col === col) {
        setSelectedSquare(null)
        return
      }

      // Try to make a move
      makeMove(selectedSquare, {row, col})
    } else {
      // Select the square if it has a piece of the current player
      const piece = gameState.board[row]?.[col]
      if (piece && piece.color === gameState.currentPlayer) {
        setSelectedSquare({row, col})
      }
    }
  }

  const isSquareSelected = (row: number, col: number) => {
    return selectedSquare?.row === row && selectedSquare?.col === col
  }

  const isSquareDark = (row: number, col: number) => {
    return (row + col) % 2 === 1
  }

  return (
    <div className="checkers-demo">
      {error && <div className="error-message mb-4">{error}</div>}

      {!gameId ? (
        <button className="btn btn-primary" onClick={createGame} disabled={loading}>
          {loading ? 'creating...' : 'start new checkers game'}
        </button>
      ) : gameState ? (
        <>
          <div className="game-status mb-4">
            {gameState.gameOver ? (
              <div className="text-center">
                <div className="status-badge status-online mb-2">
                  {gameState.winner === 'draw' ? 'draw!' : `${gameState.winner} wins!`}
                </div>
                <button className="btn btn-secondary" onClick={createGame} disabled={loading}>
                  {loading ? 'creating...' : 'play again'}
                </button>
              </div>
            ) : (
              <div className="status-badge status-checking">
                {loading ? 'processing...' : `${gameState.currentPlayer}'s turn${gameState.mustJump ? ' (must jump!)' : ''}`}
              </div>
            )}
          </div>

          <div className="checkers-board">
            {gameState.board.map((row, rowIndex) => (
              <div key={rowIndex} className="checkers-row">
                {row.map((piece, colIndex) => (
                  <button
                    key={colIndex}
                    className={`checkers-square ${isSquareDark(rowIndex, colIndex) ? 'dark' : 'light'} ${isSquareSelected(rowIndex, colIndex) ? 'selected' : ''}`}
                    onClick={() => handleSquareClick(rowIndex, colIndex)}
                    disabled={gameState.gameOver || loading || !isSquareDark(rowIndex, colIndex)}
                  >
                    {piece && PIECE_SYMBOLS[piece.color][piece.type]}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-secondary">
            Click a piece to select it, then click a destination square to move. Only dark squares are playable.
          </div>
        </>
      ) : (
        <div>Loading game...</div>
      )}
    </div>
  )
}