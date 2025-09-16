import { useState } from 'react'
import { gameApi } from '../services/api-client'

export const TicTacToeDemo = () => {
  const [board, setBoard] = useState<Array<string | null>>(Array(9).fill(null))
  const [currentPlayer, setCurrentPlayer] = useState<'X' | 'O'>('X')
  const [gameId, setGameId] = useState<string | null>(null)
  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createGame = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await gameApi.create('tic-tac-toe')
      if (response.error) {
        setError(response.error)
        return
      }

      setGameId(response.data!.gameId)
      setBoard(Array(9).fill(null))
      setCurrentPlayer('X')
      setGameOver(false)
      setWinner(null)
    } catch {
      setError('Failed to create game')
    } finally {
      setLoading(false)
    }
  }

  const makeMove = async (index: number) => {
    if (!gameId || board[index] || gameOver || loading) return

    const row = Math.floor(index / 3)
    const col = index % 3
    setLoading(true)
    setError(null)

    try {
      const response = await gameApi.makeMove('tic-tac-toe', gameId, {
        row,
        col,
        player: currentPlayer,
      })

      if (response.error) {
        setError(response.error)
        return
      }

      const gameState = response.data!

      // Update board from server response
      const newBoard = [...board]
      newBoard[index] = currentPlayer
      setBoard(newBoard)

      if (gameState.gameOver) {
        setGameOver(true)
        setWinner(gameState.winner)
      } else {
        setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X')
      }
    } catch {
      setError('Failed to make move')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tic-tac-toe-demo">
      {error && <div className="error-message mb-4">{error}</div>}

      {!gameId ? (
        <button className="btn btn-primary" onClick={createGame} disabled={loading}>
          {loading ? 'creating...' : 'start new game'}
        </button>
      ) : (
        <>
          <div className="game-status mb-4">
            {gameOver ? (
              <div className="text-center">
                <div className="status-badge status-online mb-2">
                  {winner === 'draw' ? 'draw!' : `${winner} wins!`}
                </div>
                <button className="btn btn-secondary" onClick={createGame} disabled={loading}>
                  {loading ? 'creating...' : 'play again'}
                </button>
              </div>
            ) : (
              <div className="status-badge status-checking">
                {loading ? 'processing...' : `${currentPlayer}'s turn`}
              </div>
            )}
          </div>

          <div className="tic-tac-toe-board">
            {board.map((cell, index) => (
              <button
                key={index}
                className={`tic-tac-toe-cell ${cell ? 'filled' : ''}`}
                onClick={() => makeMove(index)}
                disabled={gameOver || !!cell || loading}
              >
                {cell}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
