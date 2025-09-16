import { StatsDisplay } from '../components'

export const StatsPage = () => {
  return (
    <div className="section">
      <div className="section-container">
        <h2>statistics</h2>
        <p className="section-description">
          Real-time analytics and insights from the game server. Track game popularity, player
          activity, and server performance metrics.
        </p>
        <StatsDisplay />
      </div>
    </div>
  )
}
