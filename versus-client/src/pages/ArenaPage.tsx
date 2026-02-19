import { useState, useCallback } from "react";
import { RoomList } from "../components/RoomList";
import { RoomDetail } from "../components/RoomDetail";
import { CreateRoomForm } from "../components/CreateRoomForm";
import { MatchmakingPanel } from "../components/MatchmakingPanel";
import { useAuth } from "../hooks/useAuth";

export function ArenaPage() {
  const { user } = useAuth();
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleJoinRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId);
  }, []);

  const handleMatchFound = useCallback((roomId: string) => {
    setActiveRoomId(roomId);
  }, []);

  const handleRoomCreated = useCallback((roomId: string) => {
    setShowCreateForm(false);
    setActiveRoomId(roomId);
  }, []);

  const handleBack = useCallback(() => {
    setActiveRoomId(null);
  }, []);

  if (activeRoomId) {
    return (
      <div className="section">
        <div className="section-container">
          <RoomDetail roomId={activeRoomId} onBack={handleBack} />
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-container">
        <div className="arena-header">
          <h2 className="section-title">Arena</h2>
          <p className="section-subtitle">
            Join a room, find a match, or create your own game
          </p>
        </div>

        {user && (
          <div className="arena-controls">
            <MatchmakingPanel onMatchFound={handleMatchFound} />

            <div className="v-card-static create-room">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3>Create Room</h3>
                <button
                  className="v-btn v-btn-ghost v-btn-sm"
                  onClick={() => setShowCreateForm(!showCreateForm)}
                >
                  {showCreateForm ? "Hide" : "New Room"}
                </button>
              </div>
              {showCreateForm && (
                <CreateRoomForm onCreated={handleRoomCreated} />
              )}
            </div>
          </div>
        )}

        {!user && (
          <div className="empty-state">
            <p>Sign in to create rooms and join matches</p>
          </div>
        )}

        <RoomList onJoinRoom={handleJoinRoom} />
      </div>
    </div>
  );
}
