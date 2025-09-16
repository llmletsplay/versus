import { TicTacToeDemo, GameSelector } from '../components'

export const PlaygroundPage = () => {
  return (
    <div className="section">
      <div className="section-container">
        <h2>playground</h2>
        <p className="section-description">
          Interactive demos and game testing environment. Try out games directly in your browser and
          explore the API responses.
        </p>

        <div className="playground-grid">
          <div className="playground-card">
            <h3>tic-tac-toe demo</h3>
            <p className="card-description">
              Play a quick game of tic-tac-toe to see the API in action. Each move is sent to the
              server and the game state is updated in real-time.
            </p>
            <TicTacToeDemo />
          </div>

          <div className="playground-card">
            <h3>game selector</h3>
            <p className="card-description">
              Browse all available games and create new instances. Explore different game types and
              see their initial states.
            </p>
            <GameSelector />
          </div>
        </div>
      </div>
    </div>
  )
}
