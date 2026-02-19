import { useState, FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthTab = "login" | "register";

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { login, register, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function resetForm() {
    setUsername("");
    setEmail("");
    setPassword("");
    setError(null);
  }

  function switchTab(tab: AuthTab) {
    setActiveTab(tab);
    resetForm();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (activeTab === "login") {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="auth-modal-overlay" onClick={handleOverlayClick}>
      <div className="auth-modal">
        <div className="pill-tabs" style={{ width: "100%", marginBottom: "var(--space-6)" }}>
          <button
            className={`pill-tab ${activeTab === "login" ? "pill-tab--active" : ""}`}
            onClick={() => switchTab("login")}
            type="button"
            style={{ flex: 1, textAlign: "center" }}
          >
            Login
          </button>
          <button
            className={`pill-tab ${activeTab === "register" ? "pill-tab--active" : ""}`}
            onClick={() => switchTab("register")}
            type="button"
            style={{ flex: 1, textAlign: "center" }}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              className="v-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoComplete={activeTab === "login" ? "username" : "off"}
            />
          </div>

          {activeTab === "register" && (
            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                className="v-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
                required
                autoComplete="email"
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="v-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              autoComplete={activeTab === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            className="v-btn v-btn-primary auth-submit"
            type="submit"
            disabled={isLoading}
            style={{ width: "100%" }}
          >
            {isLoading
              ? "Processing..."
              : activeTab === "login"
                ? "Login"
                : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}
