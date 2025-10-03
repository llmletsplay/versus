import { useState } from 'react'
import { gameApi } from '../services/api-client'

interface ChessPiece {
  type: 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn'
  color: 'white' | 'black'
}

type ChessBoard = (ChessPiece | null)[][]

interface ChessState {
  gameId: string
  gameType: string
  board: ChessBoard
  currentPlayer: 'white' | 'black'
  gameOver: boolean
  winner: string | null
  inCheck: boolean
}

const PIECE_SYMBOLS: Record<string, Record<string, string>> = {
  white: {
    king: '♔',
    queen: '♕',
    rook: '♖',
    bishop: '♗',
    knight: '♘',
    pawn: '♙'
  },
  black: {
    king: '♚',
    queen: '♛',
    rook: '♜',
    bishop: '♝',
    knight: '♞',
    pawn: '♟'
  }
}

export const ChessDemo = () => {
  const [gameState, setGameState] = useState<ChessState | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<{row: number, col: number} | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createGame = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await gameApi.create('chess')
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
      const response = await gameApi.getState('chess', id)
      if (response.error) {
        setError(response.error)
        return
      }

      setGameState(response.data as ChessState)
    } catch {
      setError('Failed to load game state')
    }
  }

  const makeMove = async (from: {row: number, col: number}, to: {row: number, col: number}) => {
    if (!gameId || loading) return

    setLoading(true)
    setError(null)

    try {
      const response = await gameApi.makeMove('chess', gameId, {
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

  const isSquareLight = (row: number, col: number) => {
    return (row + col) % 2 === 0
  }

  return (
    <div className="chess-demo">
      {error && <div className="error-message mb-4">{error}</div>}

      {!gameId ? (
        <button className="btn btn-primary" onClick={createGame} disabled={loading}>
          {loading ? 'creating...' : 'start new chess game'}
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
                {loading ? 'processing...' : `${gameState.currentPlayer}'s turn${gameState.inCheck ? ' (in check!)' : ''}`}
              </div>
            )}
          </div>

          <div className="chess-board">
            {gameState.board.map((row, rowIndex) => (
              <div key={rowIndex} className="chess-row">
                {row.map((piece, colIndex) => (
                  <button
                    key={colIndex}
                    className={`chess-square ${isSquareLight(rowIndex, colIndex) ? 'light' : 'dark'} ${isSquareSelected(rowIndex, colIndex) ? 'selected' : ''}`}
                    onClick={() => handleSquareClick(rowIndex, colIndex)}
                    disabled={gameState.gameOver || loading}
                  >
                    {piece && PIECE_SYMBOLS[piece.color][piece.type]}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-secondary">
            Click a piece to select it, then click a destination square to move.
          </div>
        </>
      ) : (
        <div>Loading game...</div>
      )}
    </div>
  )
}