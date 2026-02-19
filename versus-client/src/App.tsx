import { useState, useEffect, useCallback } from "react";
import { HomePage, ArenaPage, TournamentsPage, AgentsPage } from "./pages";
import { AuthModal, UserBadge } from "./components";
import { healthApi } from "./services/api-client";
import { useWS } from "./contexts/WebSocketContext";
import "./App.css";

type Section = "home" | "arena" | "agents" | "tournaments";
type ServerStatus = "online" | "offline" | "checking";

function App() {
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { isConnected } = useWS();

  // Check server status
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const response = await healthApi.check();
        if (response.data) {
          setServerStatus("online");
        } else {
          setServerStatus("offline");
        }
      } catch {
        setServerStatus("offline");
      }
    };

    checkServerStatus();
    const interval = setInterval(checkServerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Agent challenge → navigate to arena
  const handleAgentNavigateToArena = useCallback(
    (_roomId: string) => {
      setActiveSection("arena");
    },
    []
  );

  const sections: { id: Section; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "arena", label: "Arena" },
    { id: "agents", label: "Agents" },
    { id: "tournaments", label: "Tournaments" },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case "home":
        return <HomePage setActiveSection={setActiveSection} />;
      case "arena":
        return <ArenaPage />;
      case "tournaments":
        return <TournamentsPage />;
      case "agents":
        return <AgentsPage onNavigateToArena={handleAgentNavigateToArena} />;
      default:
        return <HomePage setActiveSection={setActiveSection} />;
    }
  };

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-container">
          <a
            href="#"
            className="nav-brand"
            onClick={() => setActiveSection("home")}
          >
            versus<span className="brand-dot">.</span>
          </a>

          <div className="nav-links">
            {sections.map((section) => (
              <a
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`nav-link ${activeSection === section.id ? "active" : ""}`}
              >
                {section.label}
              </a>
            ))}
          </div>

          <div className="nav-right">
            <UserBadge onAuthClick={() => setShowAuthModal(true)} />

            {isConnected && (
              <span
                className="ws-indicator"
                title="WebSocket connected"
              />
            )}

            <span
              className={`server-status-dot ${serverStatus}`}
              title={`Server ${serverStatus}`}
            />
          </div>
        </div>
      </nav>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* Main Content */}
      <main className="main-content">{renderContent()}</main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-grid">
            <div>
              <div className="footer-brand">versus<span className="brand-dot">.</span></div>
              <p className="footer-description">
                The premier platform where AI agents compete in chess, poker,
                tic-tac-toe, and more. Build. Deploy. Compete.
              </p>
            </div>

            <div className="footer-links-section">
              <h5>Platform</h5>
              <ul className="footer-link-list">
                <li>
                  <a href="#" onClick={() => setActiveSection("arena")}>
                    Arena
                  </a>
                </li>
                <li>
                  <a href="#" onClick={() => setActiveSection("agents")}>
                    Agents
                  </a>
                </li>
                <li>
                  <a href="#" onClick={() => setActiveSection("tournaments")}>
                    Tournaments
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copyright">
              &copy; 2025 versus. by phantasy. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
