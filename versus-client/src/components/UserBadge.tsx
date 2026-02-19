import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface UserBadgeProps {
  onAuthClick: () => void;
}

export function UserBadge({ onAuthClick }: UserBadgeProps) {
  const { user, logout, isLoading } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="user-badge">
        <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="user-badge">
        <button className="user-badge-signin" onClick={onAuthClick} type="button">
          Sign in
        </button>
      </div>
    );
  }

  function handleLogout() {
    setDropdownOpen(false);
    logout();
  }

  return (
    <div className="user-badge">
      <button
        className="user-badge-trigger"
        onClick={() => setDropdownOpen((prev) => !prev)}
        type="button"
      >
        <span className="user-badge-username">{user.username}</span>
        <span className="user-badge-role">{user.role}</span>
      </button>

      {dropdownOpen && (
        <>
          <div
            className="user-badge-backdrop"
            onClick={() => setDropdownOpen(false)}
          />
          <div className="user-badge-dropdown">
            <div className="user-badge-dropdown-header">
              <span className="user-badge-dropdown-name">{user.username}</span>
              <span className="user-badge-dropdown-email">{user.email}</span>
            </div>
            <button
              className="user-badge-dropdown-item"
              onClick={handleLogout}
              type="button"
            >
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
