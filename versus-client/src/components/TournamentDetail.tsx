import { useState, useEffect, useCallback } from "react";
import { tournamentApi } from "../services/api-client";
import { useAuth } from "../hooks/useAuth";
import type { Tournament, TournamentMatch, TournamentStanding } from "../types";

interface TournamentDetailProps {
  tournamentId: string;
  onBack: () => void;
}

export function TournamentDetail({ tournamentId, onBack }: TournamentDetailProps) {
  const { user } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const fetchTournament = useCallback(async () => {
    try {
      const response = await tournamentApi.get(tournamentId);
      if (response.error) {
        setError(response.error);
        return;
      }
      if (response.data) {
        setTournament(response.data);
        setCurrentRound(response.data.currentRound || 1);
      }
    } catch {
      setError("Failed to load tournament");
    }
  }, [tournamentId]);

  const fetchRoundMatches = useCallback(
    async (round: number) => {
      try {
        const response = await tournamentApi.roundMatches(tournamentId, round);
        if (response.data) setMatches(response.data);
      } catch {
        setMatches([]);
      }
    },
    [tournamentId]
  );

  const fetchStandings = useCallback(async () => {
    try {
      const response = await tournamentApi.standings(tournamentId);
      if (response.data) setStandings(response.data);
    } catch {
      setStandings([]);
    }
  }, [tournamentId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      await fetchTournament();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [fetchTournament]);

  useEffect(() => {
    if (!tournament) return;
    if (tournament.format === "single_elimination") {
      fetchRoundMatches(currentRound);
    } else {
      fetchStandings();
      fetchRoundMatches(currentRound);
    }
  }, [tournament, currentRound, fetchRoundMatches, fetchStandings]);

  async function handleRegister() {
    setRegistering(true);
    setError(null);
    try {
      const response = await tournamentApi.register(tournamentId);
      if (response.error) {
        setError(response.error);
      } else {
        await fetchTournament();
      }
    } catch {
      setError("Registration failed");
    } finally {
      setRegistering(false);
    }
  }

  function getMatchStatusLabel(status: TournamentMatch["status"]): string {
    switch (status) {
      case "pending": return "Pending";
      case "in_progress": return "Live";
      case "completed": return "Done";
      case "bye": return "Bye";
      default: return status;
    }
  }

  function getMatchStatusClass(status: TournamentMatch["status"]): string {
    switch (status) {
      case "in_progress": return "live";
      case "completed": return "completed";
      default: return "";
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>Loading tournament...</span>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div>
        <button className="v-btn v-btn-ghost" onClick={onBack}>
          &larr; Back
        </button>
        <div className="error-banner" style={{ marginTop: "var(--space-4)" }}>
          {error ?? "Tournament not found"}
        </div>
      </div>
    );
  }

  const isSingleElimination = tournament.format === "single_elimination";
  const showStandings = !isSingleElimination;

  return (
    <div>
      <button className="v-btn v-btn-ghost v-btn-sm" onClick={onBack} style={{ marginBottom: "var(--space-4)" }}>
        &larr; Back
      </button>

      <div className="tournament-detail-header">
        <h2 className="section-title">{tournament.name}</h2>
        <div className="tournament-meta">
          <span className="meta-badge">
            {tournament.status.replace("_", " ")}
          </span>
          <span className="meta-badge">
            {tournament.format.replace("_", " ")}
          </span>
          <span className="meta-badge">{tournament.gameType}</span>
          <span className="meta-badge">
            {tournament.currentParticipants}/{tournament.maxParticipants} players
          </span>
          <span className="meta-badge">
            Prize: <span className="mono" style={{ color: "var(--color-accent)" }}>
              {tournament.prizePool} {tournament.entryFeeToken}
            </span>
          </span>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tournament.status === "registration" && (
        <div className="tournament-actions">
          <button
            className="v-btn v-btn-primary"
            onClick={handleRegister}
            disabled={registering || tournament.currentParticipants >= tournament.maxParticipants}
          >
            {registering
              ? "Registering..."
              : tournament.currentParticipants >= tournament.maxParticipants
                ? "Tournament Full"
                : `Register (${tournament.entryFee > 0 ? `${tournament.entryFee} ${tournament.entryFeeToken}` : "Free"})`}
          </button>
        </div>
      )}

      {/* Round navigation */}
      {tournament.totalRounds > 0 && (
        <div className="round-nav">
          <button
            className="v-btn v-btn-ghost v-btn-sm"
            onClick={() => setCurrentRound((r) => r - 1)}
            disabled={currentRound <= 1}
          >
            &larr; Prev
          </button>
          <span className="round-label">
            Round {currentRound} / {tournament.totalRounds}
          </span>
          <button
            className="v-btn v-btn-ghost v-btn-sm"
            onClick={() => setCurrentRound((r) => r + 1)}
            disabled={currentRound >= tournament.totalRounds}
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Bracket */}
      {isSingleElimination && (
        <div className="bracket-grid">
          {matches.length === 0 ? (
            <div className="empty-state">No matches for round {currentRound}</div>
          ) : (
            matches.map((match) => (
              <div key={match.id} className="bracket-match">
                <div className="bracket-match-header">
                  <span>Match #{match.matchNumber}</span>
                  <span className={`bracket-match-status ${getMatchStatusClass(match.status)}`}>
                    {getMatchStatusLabel(match.status)}
                  </span>
                </div>
                <div className="bracket-players">
                  <div className={`bracket-player ${match.winnerId === match.playerAId ? "winner" : ""}`}>
                    <span className="bracket-player-id">{match.playerAId.slice(0, 8)}...</span>
                    {match.winnerId === match.playerAId && <span className="winner-badge">W</span>}
                  </div>
                  <div className="bracket-vs">vs</div>
                  <div className={`bracket-player ${match.winnerId === match.playerBId ? "winner" : ""}`}>
                    {match.playerBId ? (
                      <>
                        <span className="bracket-player-id">{match.playerBId.slice(0, 8)}...</span>
                        {match.winnerId === match.playerBId && <span className="winner-badge">W</span>}
                      </>
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)" }}>Bye</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Standings */}
      {showStandings && (
        <div className="standings-section">
          <h3>Standings</h3>
          {standings.length === 0 ? (
            <div className="empty-state">No standings available</div>
          ) : (
            <table className="standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>W</th>
                  <th>L</th>
                  <th>D</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing) => (
                  <tr
                    key={standing.userId}
                    className={`${standing.userId === user?.id ? "standings-row-self" : ""} ${standing.eliminated ? "standings-row-eliminated" : ""}`}
                  >
                    <td className="rank-cell">{standing.rank}</td>
                    <td>
                      <span className="mono">{standing.userId.slice(0, 8)}...</span>
                      {standing.eliminated && <span className="eliminated-mark">X</span>}
                    </td>
                    <td>{standing.wins}</td>
                    <td>{standing.losses}</td>
                    <td>{standing.draws}</td>
                    <td className="points-cell">{standing.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Round matches */}
          {matches.length > 0 && (
            <div className="round-matches">
              <h3>Round {currentRound} matches</h3>
              <div className="match-list">
                {matches.map((match) => (
                  <div key={match.id} className="bracket-match">
                    <div className="bracket-players">
                      <div className={`bracket-player ${match.winnerId === match.playerAId ? "winner" : ""}`}>
                        <span className="mono">{match.playerAId.slice(0, 8)}...</span>
                      </div>
                      <div className="bracket-vs">vs</div>
                      <div className={`bracket-player ${match.winnerId === match.playerBId ? "winner" : ""}`}>
                        <span className="mono">
                          {match.playerBId ? `${match.playerBId.slice(0, 8)}...` : "Bye"}
                        </span>
                      </div>
                    </div>
                    <span className={`bracket-match-status ${getMatchStatusClass(match.status)}`} style={{ marginTop: "var(--space-2)", display: "block", textAlign: "right", fontSize: "var(--text-xs)" }}>
                      {getMatchStatusLabel(match.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
