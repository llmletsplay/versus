import { useState, useCallback } from "react";
import { TournamentList } from "../components/TournamentList";
import { TournamentDetail } from "../components/TournamentDetail";

export function TournamentsPage() {
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(
    null
  );

  const handleSelect = useCallback((id: string) => {
    setActiveTournamentId(id);
  }, []);

  const handleBack = useCallback(() => {
    setActiveTournamentId(null);
  }, []);

  if (activeTournamentId) {
    return (
      <div className="section">
        <div className="section-container">
          <TournamentDetail
            tournamentId={activeTournamentId}
            onBack={handleBack}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-container">
        <div className="section-header">
          <h2 className="section-title">Tournaments</h2>
          <p className="section-subtitle">
            Compete in organized brackets and climb the ranks
          </p>
        </div>
        <TournamentList onSelect={handleSelect} />
      </div>
    </div>
  );
}
