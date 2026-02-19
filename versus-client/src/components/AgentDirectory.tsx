import { useState, useEffect } from "react";
import { agentApi } from "../services/api-client";
import type { Agent } from "../types";

interface AgentDirectoryProps {
  onChallenge: (agentId: string) => void;
  onSelect?: (agentId: string) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  openclaw: "OpenClaw",
  mcp: "MCP",
  api: "API",
};

const AVATAR_COLORS = ["agent-avatar-a", "agent-avatar-b", "agent-avatar-c", "agent-avatar-d"];

function getAvatarClass(name: string): string {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index]!;
}

export function AgentDirectory({ onChallenge, onSelect }: AgentDirectoryProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAgents() {
      setLoading(true);
      setError(null);
      try {
        const response = await agentApi.list();
        if (cancelled) return;
        if (response.error) {
          setError(response.error);
          setAgents([]);
        } else {
          setAgents(response.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to fetch agents");
          setAgents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAgents();
    return () => { cancelled = true; };
  }, []);

  function getWinRate(agent: Agent): number {
    if (agent.totalGames === 0) return 0;
    return (agent.wins / agent.totalGames) * 100;
  }

  function getPrimaryElo(agent: Agent): number | null {
    const gameTypes = Object.keys(agent.eloRatings);
    if (gameTypes.length === 0) return null;
    return agent.eloRatings[gameTypes[0]!]!;
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
          <span>Loading agents...</span>
        </div>
      ) : agents.length === 0 ? (
        <div className="empty-state">No agents registered</div>
      ) : (
        <div className="agent-grid">
          {agents.map((agent) => {
            const winRate = getWinRate(agent);
            const primaryElo = getPrimaryElo(agent);
            const initials = agent.displayName
              .split(" ")
              .map((w) => w[0])
              .join("")
              .substring(0, 2)
              .toUpperCase();

            return (
              <div
                key={agent.id}
                className="v-card agent-card"
                onClick={() => onSelect?.(agent.id)}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onSelect && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelect(agent.id);
                  }
                }}
              >
                <div className="agent-card-header">
                  <div className={`agent-avatar ${getAvatarClass(agent.displayName)}`}>
                    {initials}
                  </div>
                  <div>
                    <div className="agent-card-name">{agent.displayName}</div>
                  </div>
                  <span className="agent-card-provider">
                    {PROVIDER_LABELS[agent.provider] ?? agent.provider}
                  </span>
                </div>

                <div className="agent-card-games">
                  {agent.gamesSupported.map((game) => (
                    <span key={game} className="game-badge">{game}</span>
                  ))}
                </div>

                <div className="agent-card-stats">
                  <div className="agent-stat">
                    <span className="agent-stat-label">Win rate</span>
                    <span className="agent-stat-value">
                      {agent.totalGames > 0 ? `${winRate.toFixed(1)}%` : "N/A"}
                    </span>
                    <div className="agent-winrate-bar">
                      <div
                        className="agent-winrate-fill"
                        style={{ width: `${winRate}%` }}
                      />
                    </div>
                  </div>
                  <div className="agent-stat">
                    <span className="agent-stat-label">Record</span>
                    <span className="agent-stat-value">
                      {agent.wins}W {agent.losses}L {agent.draws}D
                    </span>
                  </div>
                  {primaryElo !== null && (
                    <div className="agent-stat">
                      <span className="agent-stat-label">ELO</span>
                      <span className="agent-stat-value mono">{primaryElo}</span>
                    </div>
                  )}
                  <div className="agent-stat">
                    <span className="agent-stat-label">Games</span>
                    <span className="agent-stat-value">{agent.totalGames}</span>
                  </div>
                </div>

                <div className="agent-card-footer">
                  <div className="agent-status">
                    <span
                      className={`status-dot ${agent.isActive ? "status-dot--live" : "status-dot--offline"}`}
                    />
                    <span>{agent.isActive ? "Online" : "Offline"}</span>
                  </div>
                  <button
                    className="v-btn v-btn-primary v-btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChallenge(agent.id);
                    }}
                    disabled={!agent.isActive}
                  >
                    {agent.isActive ? "Challenge" : "Offline"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
