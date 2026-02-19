import { useState, useEffect } from "react";
import { tournamentApi } from "../services/api-client";
import type { Tournament, TournamentStatus } from "../types";

interface TournamentListProps {
  onSelect: (id: string) => void;
}

const STATUS_TABS: { label: string; value: TournamentStatus }[] = [
  { label: "Registration", value: "registration" },
  { label: "Active", value: "in_progress" },
  { label: "Completed", value: "completed" },
];

const FORMAT_LABELS: Record<string, { label: string; className: string }> = {
  single_elimination: { label: "SE", className: "format-badge-se" },
  round_robin: { label: "RR", className: "format-badge-rr" },
  swiss: { label: "SW", className: "format-badge-sw" },
};

export function TournamentList({ onSelect }: TournamentListProps) {
  const [activeTab, setActiveTab] = useState<TournamentStatus>("registration");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTournaments() {
      setLoading(true);
      setError(null);
      try {
        const response = await tournamentApi.list(activeTab);
        if (cancelled) return;
        if (response.error) {
          setError(response.error);
          setTournaments([]);
        } else {
          setTournaments(response.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to fetch tournaments");
          setTournaments([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTournaments();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  async function handleRegister(e: React.MouseEvent, tournamentId: string) {
    e.stopPropagation();
    setRegisteringId(tournamentId);
    try {
      const response = await tournamentApi.register(tournamentId);
      if (response.error) {
        setError(response.error);
      } else {
        const refreshed = await tournamentApi.list(activeTab);
        if (refreshed.data) {
          setTournaments(refreshed.data);
        }
      }
    } catch {
      setError("Registration failed");
    } finally {
      setRegisteringId(null);
    }
  }

  function getFormatInfo(format: string) {
    return FORMAT_LABELS[format] ?? { label: format, className: "" };
  }

  return (
    <div>
      {/* Pill Tabs */}
      <div className="tournament-tabs">
        <div className="pill-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              className={`pill-tab ${activeTab === tab.value ? "pill-tab--active" : ""}`}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
          <span>Loading tournaments...</span>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="empty-state">
          No {activeTab.replace("_", " ")} tournaments found
        </div>
      ) : (
        <div className="tournament-grid">
          {tournaments.map((tournament) => {
            const formatInfo = getFormatInfo(tournament.format);
            const fillPercent =
              tournament.maxParticipants > 0
                ? (tournament.currentParticipants / tournament.maxParticipants) * 100
                : 0;

            return (
              <div
                key={tournament.id}
                className="v-card tournament-card"
                onClick={() => onSelect(tournament.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(tournament.id);
                  }
                }}
              >
                <div className="tournament-card-header">
                  <span className="tournament-card-name">{tournament.name}</span>
                  <span className={`format-badge ${formatInfo.className}`}>
                    {formatInfo.label}
                  </span>
                </div>

                <div className="tournament-card-prize mono">
                  {tournament.prizePool} {tournament.entryFeeToken}
                </div>

                <div className="tournament-card-details">
                  <div className="tournament-detail-row">
                    <span>Game</span>
                    <span>{tournament.gameType}</span>
                  </div>
                  <div className="tournament-detail-row">
                    <span>Players</span>
                    <span>
                      {tournament.currentParticipants}/{tournament.maxParticipants}
                    </span>
                  </div>
                  <div className="participant-progress">
                    <div
                      className="participant-progress-fill"
                      style={{ width: `${fillPercent}%` }}
                    />
                  </div>
                  <div className="tournament-detail-row">
                    <span>Entry fee</span>
                    <span>
                      {tournament.entryFee > 0
                        ? `${tournament.entryFee} ${tournament.entryFeeToken}`
                        : "Free"}
                    </span>
                  </div>
                </div>

                {activeTab === "registration" && (
                  <div className="tournament-card-footer">
                    <button
                      className="v-btn v-btn-primary v-btn-sm"
                      onClick={(e) => handleRegister(e, tournament.id)}
                      disabled={
                        registeringId === tournament.id ||
                        tournament.currentParticipants >= tournament.maxParticipants
                      }
                    >
                      {registeringId === tournament.id
                        ? "Registering..."
                        : tournament.currentParticipants >= tournament.maxParticipants
                          ? "Full"
                          : "Register"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
