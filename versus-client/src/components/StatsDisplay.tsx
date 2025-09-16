import { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'
import { statsApi } from '../services/api-client'

// Types
interface GameStats {
  totalGamesPlayed: number
  totalGamesActive: number
  totalMoves: number
  gamesByType: Record<string, number>
  activeGamesByType: Record<string, number>
  averageGameDuration: number
  popularGameTypes: Array<{ gameType: string; count: number; percentage: number }>
  playerStats: {
    totalUniquePlayers: number
    averagePlayersPerGame: number
  }
  timeStats: {
    gamesPlayedToday: number
    gamesPlayedThisWeek: number
    gamesPlayedThisMonth: number
  }
  recentActivity: Array<{
    gameId: string
    gameType: string
    action: string
    timestamp: number
    players?: string[]
  }>
}

interface GameTypeStats {
  totalGames: number
  activeGames: number
  completedGames: number
  averageDuration: number
  totalMoves: number
  winRates: Record<string, number>
}

export const StatsDisplay = () => {
  const [stats, setStats] = useState<GameStats | null>(null)
  const [gameTypeStats, setGameTypeStats] = useState<Record<string, GameTypeStats>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedGameType, setSelectedGameType] = useState<string>('')

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await statsApi.getGlobal()
        if (response.error) {
          setError(response.error)
          setStats(null)
        } else {
          setStats(response.data as GameStats)
        }
      } catch {
        setError('Failed to connect to server')
        setStats(null)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const fetchGameTypeStats = async (gameType: string) => {
    try {
      const response = await statsApi.getByType(gameType)
      if (response.data) {
        setGameTypeStats(prev => ({ ...prev, [gameType]: response.data as GameTypeStats }))
      }
    } catch {
      // Silently fail - stats are optional
    }
  }

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  // Chart colors for terminal theme
  const COLORS = [
    '#00ff88',
    '#0088ff',
    '#ff8800',
    '#ff0088',
    '#88ff00',
    '#8800ff',
    '#00ffff',
    '#ff4444',
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="spinner"></div>
        <span className="ml-2 text-muted">loading stats...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="btn btn-primary">
          retry
        </button>
      </div>
    )
  }

  if (!stats || !stats.gamesByType) {
    return (
      <div className="text-center py-8">
        <p className="text-muted">no stats available</p>
      </div>
    )
  }

  // Prepare chart data
  const gameTypeData = Object.entries(stats.gamesByType)
    .map(([type, count]) => ({
      name: type,
      games: count,
      active: stats.activeGamesByType[type] || 0,
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 10)

  const timelineData = [
    { period: 'Today', games: stats.timeStats.gamesPlayedToday },
    { period: 'This Week', games: stats.timeStats.gamesPlayedThisWeek },
    { period: 'This Month', games: stats.timeStats.gamesPlayedThisMonth },
  ]

  const popularGamesData = stats.popularGameTypes.slice(0, 8).map((game, index) => ({
    ...game,
    fill: COLORS[index % COLORS.length],
  }))

  return (
    <div className="stats-container">
      {/* Overview Cards */}
      <div className="stats-grid-overview">
        <div className="stat-card">
          <div className="stat-value">{stats.totalGamesPlayed}</div>
          <div className="stat-label">total games</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalGamesActive}</div>
          <div className="stat-label">active games</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalMoves}</div>
          <div className="stat-label">total moves</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.playerStats.totalUniquePlayers}</div>
          <div className="stat-label">unique players</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="stats-grid-charts">
        {/* Games by Type Bar Chart */}
        <div className="chart-card">
          <h3 className="chart-title">games by type</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={gameTypeData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <defs>
                  <linearGradient id="gamesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00ff88" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#00ff88" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0088ff" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#0088ff" stopOpacity={0.3} />
                  </linearGradient>
                  <filter id="barGlow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="#333"
                  strokeOpacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#a0a0a0', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  axisLine={{ stroke: '#444', strokeWidth: 1 }}
                  tickLine={{ stroke: '#444', strokeWidth: 1 }}
                />
                <YAxis
                  tick={{ fill: '#a0a0a0', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: '#444', strokeWidth: 1 }}
                  tickLine={{ stroke: '#444', strokeWidth: 1 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    border: '1px solid #00ff88',
                    borderRadius: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    boxShadow: '0 0 15px rgba(0, 255, 136, 0.3)',
                    backdropFilter: 'blur(10px)',
                  }}
                  formatter={(value: number, name: string) => [
                    `${value} ${name === 'games' ? 'total' : 'active'}`,
                    name === 'games' ? 'Total Games' : 'Active Games',
                  ]}
                  labelFormatter={(label: string) => `Game Type: ${label}`}
                />
                <Bar
                  dataKey="games"
                  fill="url(#gamesGradient)"
                  stroke="#00ff88"
                  strokeWidth={1}
                  radius={[2, 2, 0, 0]}
                  style={{ filter: 'url(#barGlow)' }}
                />
                <Bar
                  dataKey="active"
                  fill="url(#activeGradient)"
                  stroke="#0088ff"
                  strokeWidth={1}
                  radius={[2, 2, 0, 0]}
                  style={{ filter: 'url(#barGlow)' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Popular Games Pie Chart */}
        <div className="chart-card">
          <h3 className="chart-title">popular games distribution</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <Pie
                  data={popularGamesData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="count"
                  stroke="#00ff88"
                  strokeWidth={1}
                  label={({ gameType, percentage }) => (percentage > 5 ? `${gameType}` : '')}
                  labelLine={false}
                  style={{ filter: 'url(#glow)' }}
                >
                  {popularGamesData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.fill}
                      stroke={entry.fill}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    border: '1px solid #00ff88',
                    borderRadius: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    boxShadow: '0 0 15px rgba(0, 255, 136, 0.3)',
                  }}
                  formatter={(value: number, _name: string) => [
                    `${value} games (${((value / stats.totalGamesPlayed) * 100).toFixed(1)}%)`,
                    'Games Played',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Timeline Chart */}
        <div className="chart-card">
          <h3 className="chart-title">games played timeline</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={timelineData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <defs>
                  <linearGradient id="timelineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff8800" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#ff8800" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#333" strokeOpacity={0.3} />
                <XAxis
                  dataKey="period"
                  tick={{ fill: '#a0a0a0', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: '#444', strokeWidth: 1 }}
                  tickLine={{ stroke: '#444', strokeWidth: 1 }}
                />
                <YAxis
                  tick={{ fill: '#a0a0a0', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: '#444', strokeWidth: 1 }}
                  tickLine={{ stroke: '#444', strokeWidth: 1 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    border: '1px solid #ff8800',
                    borderRadius: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    boxShadow: '0 0 15px rgba(255, 136, 0, 0.3)',
                  }}
                  formatter={(value: number) => [`${value} games`, 'Games Played']}
                />
                <Area
                  type="monotone"
                  dataKey="games"
                  stroke="#ff8800"
                  strokeWidth={2}
                  fill="url(#timelineGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="chart-card">
          <h3 className="chart-title">recent activity</h3>
          <div className="activity-list">
            {stats.recentActivity.slice(0, 10).map((activity, index) => (
              <div key={index} className="activity-item">
                <div className="activity-game">
                  <span className="activity-type">{activity.gameType}</span>
                  <span className="activity-id">#{activity.gameId.slice(-8)}</span>
                </div>
                <div className="activity-action">{activity.action}</div>
                <div className="activity-time">{formatTimestamp(activity.timestamp)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Game Type Selector */}
      {Object.keys(stats.gamesByType).length > 0 && (
        <div className="game-type-selector mt-8">
          <h3 className="text-lg font-semibold mb-4">detailed game type stats</h3>
          <select
            value={selectedGameType}
            onChange={e => {
              setSelectedGameType(e.target.value)
              if (e.target.value) fetchGameTypeStats(e.target.value)
            }}
            className="select-input mb-4"
          >
            <option value="">select a game type</option>
            {Object.keys(stats.gamesByType).map(gameType => (
              <option key={gameType} value={gameType}>
                {gameType} ({stats.gamesByType[gameType]} games)
              </option>
            ))}
          </select>

          {selectedGameType && gameTypeStats[selectedGameType] && (
            <div className="game-type-stats">
              <div className="stats-grid-overview">
                <div className="stat-card">
                  <div className="stat-value">{gameTypeStats[selectedGameType].totalGames}</div>
                  <div className="stat-label">total games</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{gameTypeStats[selectedGameType].activeGames}</div>
                  <div className="stat-label">active games</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{gameTypeStats[selectedGameType].completedGames}</div>
                  <div className="stat-label">completed games</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {formatDuration(gameTypeStats[selectedGameType].averageDuration)}
                  </div>
                  <div className="stat-label">avg duration</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
