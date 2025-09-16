import { useState, useEffect } from 'react'
import { HomePage, PlaygroundPage, StatsPage } from './pages'
import { healthApi } from './services/api-client'
import './App.css'

type Section = 'home' | 'docs' | 'api' | 'playground' | 'stats'
type ServerStatus = 'online' | 'offline' | 'checking'

function App() {
  const [activeSection, setActiveSection] = useState<Section>('home')
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking')
  const [gamesCount, setGamesCount] = useState<number>(26) // Default fallback

  // Grid hover effect with trail
  useEffect(() => {
    let hoverOverlay: HTMLDivElement | null = null
    const trailOverlays: HTMLDivElement[] = []
    const maxTrailLength = 8
    let lastPosition = { x: -1, y: -1 }

    const createHoverOverlay = () => {
      hoverOverlay = document.createElement('div')
      hoverOverlay.className = 'grid-hover-overlay'
      document.body.appendChild(hoverOverlay)
    }

    const createTrailOverlay = (x: number, y: number) => {
      const trailOverlay = document.createElement('div')
      trailOverlay.className = 'grid-trail-overlay'
      trailOverlay.style.left = `${x}px`
      trailOverlay.style.top = `${y}px`
      document.body.appendChild(trailOverlay)

      // Add to trail array
      trailOverlays.push(trailOverlay)

      // Remove oldest trail if we exceed max length
      if (trailOverlays.length > maxTrailLength) {
        const oldestTrail = trailOverlays.shift()
        if (oldestTrail) {
          oldestTrail.remove()
        }
      }

      // Start fading animation
      requestAnimationFrame(() => {
        trailOverlay.classList.add('fading')

        // Remove after fade completes
        setTimeout(() => {
          trailOverlay.classList.remove('fading')
          setTimeout(() => {
            if (trailOverlay.parentNode) {
              trailOverlay.remove()
              const index = trailOverlays.indexOf(trailOverlay)
              if (index > -1) {
                trailOverlays.splice(index, 1)
              }
            }
          }, 500)
        }, 100)
      })
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!hoverOverlay) return

      const gridSize = 20
      const x = Math.floor(e.clientX / gridSize) * gridSize
      const y = Math.floor(e.clientY / gridSize) * gridSize

      // Only create trail if position changed
      if (x !== lastPosition.x || y !== lastPosition.y) {
        if (lastPosition.x !== -1 && lastPosition.y !== -1) {
          createTrailOverlay(lastPosition.x, lastPosition.y)
        }
        lastPosition = { x, y }
      }

      hoverOverlay.style.left = `${x}px`
      hoverOverlay.style.top = `${y}px`
      hoverOverlay.classList.add('active')
    }

    const handleMouseLeave = () => {
      // Keep the hover overlay visible for a longer time
      setTimeout(() => {
        if (hoverOverlay) {
          hoverOverlay.classList.remove('active')
        }
      }, 300)
      lastPosition = { x: -1, y: -1 }
    }

    createHoverOverlay()
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      if (hoverOverlay) {
        document.body.removeChild(hoverOverlay)
      }
      // Clean up all trail overlays
      trailOverlays.forEach(overlay => {
        if (overlay.parentNode) {
          overlay.remove()
        }
      })
      trailOverlays.length = 0
    }
  }, [])

  // Check server status and fetch games count
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const response = await healthApi.check()
        if (response.data) {
          setServerStatus('online')
        } else {
          setServerStatus('offline')
        }
      } catch {
        setServerStatus('offline')
      }
    }

    checkServerStatus()
    const interval = setInterval(checkServerStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  // Fetch games count only when needed
  useEffect(() => {
    const fetchGamesCount = async () => {
      try {
        const healthResponse = await healthApi.check()
        if (
          healthResponse.data &&
          typeof healthResponse.data === 'object' &&
          'gameTypes' in healthResponse.data
        ) {
          setGamesCount(healthResponse.data.gameTypes as number)
          return
        }

        // Fallback - use default value
      } catch {
        // Keep default value
      }
    }

    // Fetch on app start
    fetchGamesCount()

    // Fetch when visiting home section
    if (activeSection === 'home') {
      fetchGamesCount()
    }
  }, [activeSection])

  const sections = [
    { id: 'home' as Section, label: 'home' },
    { id: 'docs' as Section, label: 'docs' },
    { id: 'api' as Section, label: 'api' },
    { id: 'playground' as Section, label: 'play' },
    { id: 'stats' as Section, label: 'stats' },
  ]

  const renderContent = () => {
    switch (activeSection) {
      case 'home':
        return <HomePage gamesCount={gamesCount} setActiveSection={setActiveSection} />
      case 'docs':
        return (
          <div className="section">
            <div className="section-container">
              <h2>Documentation coming soon...</h2>
            </div>
          </div>
        )
      case 'api':
        return (
          <div className="section">
            <div className="section-container">
              <h2>API Explorer coming soon...</h2>
            </div>
          </div>
        )
      case 'playground':
        return <PlaygroundPage />
      case 'stats':
        return <StatsPage />
      default:
        return <HomePage gamesCount={gamesCount} setActiveSection={setActiveSection} />
    }
  }

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-container">
          <a href="#" className="nav-brand">
            versus
          </a>

          <div className="nav-links">
            {sections.map(section => (
              <a
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`nav-link ${activeSection === section.id ? 'active' : ''}`}
              >
                {section.label}
              </a>
            ))}
          </div>

          <div
            className={`status-badge ${
              serverStatus === 'online'
                ? 'status-online'
                : serverStatus === 'offline'
                  ? 'status-offline'
                  : 'status-checking'
            }`}
          >
            {serverStatus === 'online' && 'online'}
            {serverStatus === 'offline' && 'offline'}
            {serverStatus === 'checking' && '...'}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">{renderContent()}</main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-grid">
            <div className="footer-section">
              <h4 className="footer-title">versus</h4>
              <p className="footer-description">
                high-performance game server for competitive multiplayer experiences
              </p>
              <div className="footer-stats">
                <div className="footer-stat">
                  <span className="footer-stat-value">{gamesCount}+</span>
                  <span className="footer-stat-label">games</span>
                </div>
                <div className="footer-stat">
                  <span className="footer-stat-value">100%</span>
                  <span className="footer-stat-label">type safe</span>
                </div>
                <div className="footer-stat">
                  <span className="footer-stat-value">∞</span>
                  <span className="footer-stat-label">scalable</span>
                </div>
              </div>
            </div>

            <div className="footer-section">
              <h5 className="footer-subtitle">resources</h5>
              <ul className="footer-links">
                <li>
                  <a href="#" onClick={() => setActiveSection('docs')} className="footer-link">
                    documentation
                  </a>
                </li>
                <li>
                  <a href="#" onClick={() => setActiveSection('api')} className="footer-link">
                    api reference
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    onClick={() => setActiveSection('playground')}
                    className="footer-link"
                  >
                    playground
                  </a>
                </li>
                <li>
                  <a href="#" onClick={() => setActiveSection('stats')} className="footer-link">
                    statistics
                  </a>
                </li>
              </ul>
            </div>

            <div className="footer-section">
              <h5 className="footer-subtitle">community</h5>
              <ul className="footer-links">
                <li>
                  <a
                    href="https://github.com"
                    className="footer-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    github
                  </a>
                </li>
                <li>
                  <a
                    href="https://discord.gg"
                    className="footer-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    discord
                  </a>
                </li>
                <li>
                  <a
                    href="https://twitter.com"
                    className="footer-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    twitter
                  </a>
                </li>
                <li>
                  <a href="mailto:hello@phantasy.dev" className="footer-link">
                    contact
                  </a>
                </li>
              </ul>
            </div>

            <div className="footer-section">
              <h5 className="footer-subtitle">server status</h5>
              <div className="footer-status">
                <div className={`footer-status-indicator ${serverStatus}`}>
                  <span className="footer-status-dot"></span>
                  <span className="footer-status-text">
                    {serverStatus === 'online'
                      ? 'operational'
                      : serverStatus === 'offline'
                        ? 'offline'
                        : 'checking...'}
                  </span>
                </div>
                <div className="footer-uptime">
                  <span className="footer-uptime-label">uptime:</span>
                  <span className="footer-uptime-value">99.9%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <div className="footer-bottom-content">
              <p className="footer-copyright">
                © 2025 versus by <span className="footer-brand">phantasy</span>. all rights
                reserved.
              </p>
              <div className="footer-tech">
                <span className="footer-tech-item">typescript</span>
                <span className="footer-tech-item">bun</span>
                <span className="footer-tech-item">react</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
