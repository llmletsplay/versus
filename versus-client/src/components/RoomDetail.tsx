import { useState, useEffect, useCallback } from "react";
import { roomApi, escrowApi, marketApi } from "../services/api-client";
import { useAuth } from "../hooks/useAuth";
import { useWS } from "../contexts/WebSocketContext";
import { MarketDetail } from "./MarketDetail";
import type { Room, RoomParticipant } from "../types";
import type { EscrowTransaction } from "../types/escrow";
import type { PredictionMarket } from "../types/market";

interface RoomDetailProps {
  roomId: string;
  onBack: () => void;
}

export function RoomDetail({ roomId, onBack }: RoomDetailProps) {
  const { user } = useAuth();
  const { subscribe, joinRoom: wsJoinRoom, leaveRoom: wsLeaveRoom } = useWS();

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [escrow, setEscrow] = useState<EscrowTransaction | null>(null);
  const [market, setMarket] = useState<PredictionMarket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRoom = useCallback(async () => {
    try {
      const response = await roomApi.get(roomId);
      if (response.data) {
        setRoom(response.data);
        setParticipants(response.data.participants || []);
        setError(null);

        // Fetch escrow if wager room
        if (response.data.wagerAmount) {
          try {
            const escrowResponse = await escrowApi.byRoom(roomId);
            if (escrowResponse.data) {
              setEscrow(escrowResponse.data);
            }
          } catch {
            // Escrow may not exist yet
          }
        }

        // Fetch associated market
        try {
          const marketsResponse = await marketApi.byRoom(roomId);
          if (marketsResponse.data && marketsResponse.data.length > 0) {
            setMarket(marketsResponse.data[0]!);
          }
        } catch {
          // Market may not exist
        }
      } else {
        setError(response.error || "Failed to fetch room");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch room");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoom();
    wsJoinRoom(roomId);
    return () => {
      wsLeaveRoom(roomId);
    };
  }, [roomId, fetchRoom, wsJoinRoom, wsLeaveRoom]);

  useEffect(() => {
    const unsubPlayerJoined = subscribe("room:player_joined", (data) => {
      const participant = data as RoomParticipant;
      setParticipants((prev) => {
        if (prev.some((p) => p.userId === participant.userId)) return prev;
        return [...prev, participant];
      });
    });

    const unsubPlayerLeft = subscribe("room:player_left", (data) => {
      const { userId } = data as { userId: string };
      setParticipants((prev) => prev.filter((p) => p.userId !== userId));
    });

    const unsubPlayerReady = subscribe("room:player_ready", (data) => {
      const { userId } = data as { userId: string };
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === userId ? { ...p, readyStatus: "ready" as const } : p
        )
      );
    });

    const unsubPlayerUnready = subscribe("room:player_unready", (data) => {
      const { userId } = data as { userId: string };
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === userId ? { ...p, readyStatus: "not_ready" as const } : p
        )
      );
    });

    const unsubGameStarted = subscribe("room:game_started", (data) => {
      const { gameId } = data as { gameId: string };
      setRoom((prev) =>
        prev ? { ...prev, status: "in_progress", gameId } : prev
      );
    });

    const unsubCompleted = subscribe("room:completed", () => {
      setRoom((prev) => (prev ? { ...prev, status: "completed" } : prev));
    });

    return () => {
      unsubPlayerJoined();
      unsubPlayerLeft();
      unsubPlayerReady();
      unsubPlayerUnready();
      unsubGameStarted();
      unsubCompleted();
    };
  }, [subscribe]);

  const currentParticipant = participants.find((p) => p.userId === user?.id);
  const isReady = currentParticipant?.readyStatus === "ready";
  const isPlayer = currentParticipant?.role === "player";

  async function handleReady() {
    setActionLoading(true);
    try {
      const response = await roomApi.ready(roomId);
      if (response.error) setError(response.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ready up");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnready() {
    setActionLoading(true);
    try {
      const response = await roomApi.unready(roomId);
      if (response.error) setError(response.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unready");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeave() {
    setActionLoading(true);
    try {
      const response = await roomApi.leave(roomId);
      if (response.error) {
        setError(response.error);
      } else {
        onBack();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave room");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>Loading room...</span>
      </div>
    );
  }

  if (!room) {
    return (
      <div>
        <div className="error-banner">{error || "Room not found"}</div>
        <button className="v-btn v-btn-ghost" onClick={onBack} type="button">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className={`room-detail ${market ? "" : ""}`.trim()} style={!market ? { display: "block" } : undefined}>
      {/* Left column: room info */}
      <div className="room-detail-main">
        <div className="room-detail-back">
          <button className="v-btn v-btn-ghost v-btn-sm" onClick={onBack} type="button">
            &larr; Back
          </button>
        </div>

        <div className="room-detail-header">
          <h2 className="room-detail-title">{room.gameType}</h2>
          <div className="room-card-status">
            <span
              className={`status-dot ${
                room.status === "in_progress"
                  ? "status-dot--live"
                  : room.status === "waiting"
                    ? "status-dot--waiting"
                    : "status-dot--offline"
              }`}
            />
            <span>{room.status.replace("_", " ")}</span>
          </div>
          {room.isRanked && <span className="room-card-ranked">Ranked</span>}
        </div>

        <div className="room-detail-meta">
          <span>
            Room <span className="mono">{room.id.substring(0, 8)}</span>
          </span>
          <span>
            Players <span className="mono">{participants.length}/{room.maxPlayers}</span>
          </span>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* Participants */}
        <div className="participant-list">
          <h3>Participants</h3>
          {participants.length === 0 ? (
            <div className="empty-state" style={{ padding: "var(--space-8) 0" }}>
              No participants yet
            </div>
          ) : (
            participants.map((p) => (
              <div key={p.userId} className="participant-row">
                <div className="participant-avatar">
                  {p.userId.charAt(0).toUpperCase()}
                </div>
                <div className="participant-info">
                  <span className="participant-name">
                    {p.userId.substring(0, 8)}
                  </span>
                  {p.userId === user?.id && (
                    <span className="participant-you">you</span>
                  )}
                </div>
                <span className="participant-role">{p.role}</span>
                <div className="participant-status">
                  <span
                    className={`status-dot ${
                      p.readyStatus === "ready"
                        ? "status-dot--ready"
                        : "status-dot--not-ready"
                    }`}
                  />
                  <span>{p.readyStatus === "ready" ? "Ready" : "Not ready"}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Escrow */}
        {room.wagerAmount !== null && room.wagerAmount > 0 && (
          <div className="v-card-static escrow-panel">
            <h3>Escrow</h3>
            <div className="escrow-info">
              <span>
                Wager: <span className="mono">{room.wagerAmount} {room.wagerCurrency || ""}</span>
              </span>
              {escrow ? (
                <>
                  <span>Status: {escrow.status}</span>
                  <span>
                    Total Pool: <span className="mono">{escrow.totalAmount} {escrow.token}</span>
                  </span>
                  <span>Fee: {escrow.platformFeePercent}%</span>
                  {escrow.contractAddress && (
                    <span>
                      Contract: <span className="mono">{escrow.contractAddress.substring(0, 12)}...</span>
                    </span>
                  )}
                </>
              ) : (
                <span>Escrow pending...</span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="room-detail-actions">
          {isPlayer && room.status === "waiting" && (
            <>
              {isReady ? (
                <button
                  className="v-btn v-btn-ghost"
                  onClick={handleUnready}
                  disabled={actionLoading}
                  type="button"
                >
                  {actionLoading ? "..." : "Unready"}
                </button>
              ) : (
                <button
                  className="v-btn v-btn-primary"
                  onClick={handleReady}
                  disabled={actionLoading}
                  type="button"
                >
                  {actionLoading ? "..." : "Ready Up"}
                </button>
              )}
            </>
          )}

          {currentParticipant && room.status !== "completed" && room.status !== "cancelled" && (
            <button
              className="v-btn v-btn-danger"
              onClick={handleLeave}
              disabled={actionLoading}
              type="button"
            >
              Leave Room
            </button>
          )}
        </div>
      </div>

      {/* Right column: market sidebar */}
      {market && (
        <div className="market-sidebar">
          <MarketDetail
            marketId={market.id}
            onBack={() => {}}
            compact
          />
        </div>
      )}
    </div>
  );
}
