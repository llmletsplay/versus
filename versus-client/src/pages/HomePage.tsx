import { useEffect } from 'react'

interface HomePageProps {
  gamesCount: number
  setActiveSection: (section: 'home' | 'docs' | 'api' | 'playground' | 'stats') => void
}

export const HomePage = ({ gamesCount, setActiveSection }: HomePageProps) => {
  // Feature cards hover disclosure effect
  useEffect(() => {
    const grid = document.getElementById('feature-cards-grid')
    const cards = grid?.querySelectorAll('.feature-card')

    if (!grid || !cards) return

    const setActiveCard = (event: Event) => {
      const closest = (event.target as Element)?.closest('.feature-card')
      if (closest) {
        const index = Array.from(cards).indexOf(closest)
        const cols = Array.from(cards)
          .map((_, i) => {
            const card = cards[i] as HTMLElement
            card.dataset.active = (index === i).toString()
            return index === i ? '10fr' : '1fr'
          })
          .join(' ')
        grid.style.setProperty('grid-template-columns', cols)
      }
    }

    grid.addEventListener('focus', setActiveCard, true)
    grid.addEventListener('click', setActiveCard)
    grid.addEventListener('pointermove', setActiveCard)

    return () => {
      grid.removeEventListener('focus', setActiveCard, true)
      grid.removeEventListener('click', setActiveCard)
      grid.removeEventListener('pointermove', setActiveCard)
    }
  }, [])

  return (
    <div className="section">
      <div className="section-container">
        <div className="hero">
          <h1 className="hero-title">versus-server</h1>
          <p className="hero-subtitle">
            typescript game server with mcp integration.
            <br />
            enables ai agents to play games with users.
          </p>

          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => setActiveSection('api')}>
              explore api
            </button>
            <button className="btn btn-secondary" onClick={() => setActiveSection('docs')}>
              docs
            </button>
          </div>
        </div>

        <div className="hero-features">
          <div className="feature-cards-grid" id="feature-cards-grid">
            <div className="feature-card" data-active="true">
              <div className="card-content">
                <h3 className="card-title">{gamesCount}+ Games</h3>
                <p className="card-description">
                  Master chess, poker, tic-tac-toe, battleship, scrabble, uno, catan and many more
                  classic games with AI integration.
                </p>
                <svg className="card-icon" viewBox="0 0 24 24">
                  <path d="M6 3h12l4 6-10 13L2 9Z" />
                  <path d="M11 3 8 9l4 13 4-13-3-6" />
                  <path d="M2 9h20" />
                </svg>
                <a href="#" className="card-link">
                  <span>Explore Games</span>
                </a>
                <div
                  className="card-background"
                  style={{
                    background: 'linear-gradient(45deg, rgba(0,255,136,0.1), rgba(0,136,255,0.1))',
                  }}
                ></div>
              </div>
            </div>

            <div className="feature-card">
              <div className="card-content">
                <h3 className="card-title">AI Ready</h3>
                <p className="card-description">
                  Model Context Protocol integration enables AI agents to play games, analyze
                  positions, and learn strategies.
                </p>
                <svg className="card-icon" viewBox="0 0 24 24">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M7 3v18" />
                  <path d="M3 7.5h4" />
                  <path d="M3 12h18" />
                  <path d="M3 16.5h4" />
                  <path d="M17 3v18" />
                  <path d="M17 7.5h4" />
                  <path d="M17 16.5h4" />
                </svg>
                <a href="#" className="card-link">
                  <span>Learn More</span>
                </a>
                <div
                  className="card-background"
                  style={{
                    background: 'linear-gradient(45deg, rgba(255,136,0,0.1), rgba(255,68,68,0.1))',
                  }}
                ></div>
              </div>
            </div>

            <div className="feature-card">
              <div className="card-content">
                <h3 className="card-title">Fast API</h3>
                <p className="card-description">
                  TypeScript Express server with real-time game state management, WebSocket support,
                  and comprehensive REST endpoints.
                </p>
                <svg className="card-icon" viewBox="0 0 24 24">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <a href="#" className="card-link">
                  <span>View API</span>
                </a>
                <div
                  className="card-background"
                  style={{
                    background: 'linear-gradient(45deg, rgba(0,255,255,0.1), rgba(136,0,255,0.1))',
                  }}
                ></div>
              </div>
            </div>

            <div className="feature-card">
              <div className="card-content">
                <h3 className="card-title">Analytics</h3>
                <p className="card-description">
                  Comprehensive game statistics, player insights, performance metrics, and detailed
                  match analysis with visual dashboards.
                </p>
                <svg className="card-icon" viewBox="0 0 24 24">
                  <path d="M19 17V5a2 2 0 0 0-2-2H4" />
                  <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
                </svg>
                <a href="#" className="card-link">
                  <span>View Stats</span>
                </a>
                <div
                  className="card-background"
                  style={{
                    background: 'linear-gradient(45deg, rgba(255,0,136,0.1), rgba(136,255,0,0.1))',
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-terminal">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="terminal-title">versus-server</span>
            <button
              className="copy-btn terminal-copy"
              onClick={() =>
                navigator.clipboard.writeText(
                  'git clone <repository-url>\ncd versus-server\nbun install\ncp env.example .env\nbun dev'
                )
              }
            >
              copy setup
            </button>
          </div>
          <div className="terminal-content">
            <div className="terminal-line">
              <span className="terminal-prompt">$</span>
              <span className="terminal-command">bun run dev</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-output">🚀 server running on localhost:4444</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-output">📦 {gamesCount} games loaded</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-output">🤖 mcp server ready</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-prompt">$</span>
              <span className="terminal-cursor">_</span>
            </div>
          </div>
        </div>

        {/* Sponsored Card */}
        <div className="sponsored-card">
          <div className="sponsored-header">
            <span className="sponsored-label">sponsored</span>
          </div>
          <div className="sponsored-content">
            <h3 className="sponsored-title">phantasy games</h3>
            <p className="sponsored-description">
              premium game server hosting with enterprise support, custom integrations, and 99.9%
              uptime guarantee.
            </p>
            <div className="sponsored-features">
              <span className="sponsored-feature">⚡ instant deployment</span>
              <span className="sponsored-feature">🔒 enterprise security</span>
              <span className="sponsored-feature">📊 advanced analytics</span>
            </div>
            <a href="#" className="btn btn-primary sponsored-cta">
              learn more
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
