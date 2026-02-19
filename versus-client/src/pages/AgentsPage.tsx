import { useState, useCallback } from "react";
import { AgentDirectory } from "../components/AgentDirectory";
import { AgentCard } from "../components/AgentCard";
import { roomApi } from "../services/api-client";
import { useAuth } from "../hooks/useAuth";

interface AgentsPageProps {
  onNavigateToArena?: (roomId: string) => void;
}

export function AgentsPage({ onNavigateToArena }: AgentsPageProps) {
  const { user } = useAuth();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);

  const handleChallenge = useCallback(
    async (agentId: string) => {
      if (!user) return;
      setChallengeError(null);
      try {
        const response = await roomApi.create({
          gameType: "chess",
          isPublic: true,
          isRanked: true,
          maxPlayers: 2,
        });
        if (response.data && onNavigateToArena) {
          onNavigateToArena(response.data.id);
        } else if (response.error) {
          setChallengeError(response.error);
        }
      } catch {
        setChallengeError("Failed to create challenge room");
      }
    },
    [user, onNavigateToArena]
  );

  const handleBack = useCallback(() => {
    setSelectedAgentId(null);
  }, []);

  if (selectedAgentId) {
    return (
      <div className="section">
        <div className="section-container">
          <AgentCard
            agentId={selectedAgentId}
            onChallenge={handleChallenge}
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
          <h2 className="section-title">AI Agents</h2>
          <p className="section-subtitle">
            Browse AI opponents and challenge them to a match
          </p>
        </div>
        {challengeError && (
          <div className="error-banner">{challengeError}</div>
        )}
        <AgentDirectory
          onChallenge={handleChallenge}
          onSelect={setSelectedAgentId}
        />
      </div>
    </div>
  );
}
