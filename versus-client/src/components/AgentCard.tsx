import { useState, useEffect } from "react";
import { agentApi } from "../services/api-client";
import type { Agent } from "../types";

interface AgentCardProps {
  agentId: string;
  onChallenge: (agentId: string) => void;
  onBack: () => void;
}

interface AgentStats {
  winStreak: number;
  lossStreak: number;
  currentStreak: number;
  currentStreakType: "win" | "loss" | "draw" | "none";
  [key: string]: unknown;
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

export function AgentCard({ agentId, onChallenge, onBack }: AgentCardProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [agentRes, statsRes] = await Promise.all([
          agentApi.get(agentId),
          agentApi.stats(agentId),
        ]);
        if (cancelled) return;
        if (agentRes.error) {
          setError(agentRes.error);
          return;
        }
        if (agentRes.data) setAgent(agentRes.data);
        if (statsRes.data) setStats(statsRes.data as AgentStats);
      } catch {
        if (!cancelled) setError("Failed to load agent");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [agentId]);

  function getWinRate(a: Agent): string {
    if (a.totalGames === 0) return "N/A";
    return ((a.wins / a.totalGames) * 100).toFixed(1) + "%";
  }

  function getMaxElo(eloRatings: Record<string, number>): number {
    const values = Object.values(eloRatings);
    if (values.length === 0) return 0;
    return Math.max(...values);
  }

  function getEloBarWidth(elo: number, maxElo: number): number {
    if (maxElo === 0) return 0;
    const normalized = (elo / maxElo) * 100;
    return Math.max(normalized, 10);
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>Loading agent...</span>
      </div>
    );
  }

  if (!agent) {
    return (
      <div>
        <button className="v-btn v-btn-ghost v-btn-sm" onClick={onBack}>
          &larr; Back
        </button>
        <div className="error-banner" style={{ marginTop: "var(--space-4)" }}>
          {error ?? "Agent not found"}
        </div>
      </div>
    );
  }

  const eloEntries = Object.entries(agent.eloRatings);
  const maxElo = getMaxElo(agent.eloRatings);
  const initials = agent.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <div>
      <button className="v-btn v-btn-ghost v-btn-sm" onClick={onBack} style={{ marginBottom: "var(--space-6)" }}>
        &larr; Back
      </button>

      <div className="agent-detail-header">
        <div className={`agent-detail-avatar ${getAvatarClass(agent.displayName)}`}>
          {initials}
        </div>
        <div className="agent-detail-info">
          <h2>{agent.displayName}</h2>
          <div className="agent-detail-badges">
            <span className="agent-card-provider">
              {PROVIDER_LABELS[agent.provider] ?? agent.provider}
            </span>
            <div className="agent-status">
              <span
                className={`status-dot ${agent.isActive ? "status-dot--live" : "status-dot--offline"}`}
              />
              <span>{agent.isActive ? "Online" : "Offline"}</span>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Supported games */}
      <div className="agent-section">
        <h3>Supported games</h3>
        <div className="agent-card-games">
          {agent.gamesSupported.map((game) => (
            <span key={game} className="game-badge">{game}</span>
          ))}
          {agent.gamesSupported.length === 0 && (
            <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)" }}>
              None registered
            </span>
          )}
        </div>
      </div>

      {/* ELO chart */}
      {eloEntries.length > 0 && (
        <div className="agent-section">
          <h3>ELO ratings</h3>
          <div className="elo-chart">
            {eloEntries.map(([gameType, elo]) => (
              <div key={gameType} className="elo-chart-row">
                <span className="elo-chart-label">{gameType}</span>
                <div className="elo-chart-bar-track">
                  <div
                    className="elo-chart-bar"
                    style={{ width: `${getEloBarWidth(elo, maxElo)}%` }}
                  />
                </div>
                <span className="elo-value mono">{elo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance */}
      <div className="agent-section">
        <h3>Performance</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-value">{agent.totalGames}</div>
            <div className="stat-card-label">Total games</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{getWinRate(agent)}</div>
            <div className="stat-card-label">Win rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">
              {agent.wins}W {agent.losses}L {agent.draws}D
            </div>
            <div className="stat-card-label">Record</div>
          </div>
          {stats && (
            <>
              <div className="stat-card">
                <div className="stat-card-value">{stats.winStreak}</div>
                <div className="stat-card-label">Best win streak</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{stats.lossStreak}</div>
                <div className="stat-card-label">Worst loss streak</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">
                  {stats.currentStreak > 0
                    ? `${stats.currentStreak} ${stats.currentStreakType}`
                    : "None"}
                </div>
                <div className="stat-card-label">Current streak</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Challenge button */}
      <div style={{ marginTop: "var(--space-8)" }}>
        <button
          className="v-btn v-btn-primary v-btn-lg"
          onClick={() => onChallenge(agent.id)}
          disabled={!agent.isActive}
        >
          {agent.isActive ? "Challenge Agent" : "Agent Offline"}
        </button>
      </div>
    </div>
  );
}
