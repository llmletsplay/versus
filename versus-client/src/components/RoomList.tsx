import { useState, useEffect } from "react";
import { roomApi } from "../services/api-client";
import type { Room, RoomFilters, RoomStatus } from "../types";

interface RoomListProps {
  onJoinRoom: (roomId: string) => void;
}

const POLL_INTERVAL = 5000;

const STATUS_OPTIONS: { label: string; value: RoomStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Waiting", value: "waiting" },
  { label: "Ready", value: "ready" },
  { label: "Live", value: "in_progress" },
  { label: "Done", value: "completed" },
];

export function RoomList({ onJoinRoom }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gameTypeFilter, setGameTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<RoomStatus | "">("");
  const [rankedFilter, setRankedFilter] = useState(false);

  async function fetchRooms() {
    const filters: RoomFilters = {};
    if (gameTypeFilter.trim()) filters.gameType = gameTypeFilter.trim();
    if (statusFilter) filters.status = statusFilter;
    if (rankedFilter) filters.isRanked = true;

    try {
      const response = await roomApi.list(filters);
      if (response.data) {
        setRooms(response.data);
        setError(null);
      } else {
        setError(response.error || "Failed to fetch rooms");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch rooms");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, POLL_INTERVAL);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameTypeFilter, statusFilter, rankedFilter]);

  function formatWager(room: Room): string | null {
    if (!room.wagerAmount) return null;
    return `${room.wagerAmount} ${room.wagerCurrency || ""}`.trim();
  }

  function getStatusDot(status: string): string {
    switch (status) {
      case "waiting":
        return "status-dot--waiting";
      case "in_progress":
        return "status-dot--live";
      case "ready":
        return "status-dot--blue";
      default:
        return "status-dot--offline";
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="room-filters">
        <input
          className="v-input"
          type="text"
          placeholder="Filter by game type..."
          value={gameTypeFilter}
          onChange={(e) => setGameTypeFilter(e.target.value)}
          style={{ maxWidth: 200 }}
        />

        <div className="pill-tabs">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`pill-tab ${statusFilter === opt.value ? "pill-tab--active" : ""}`}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="pill-toggle">
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
            Ranked
          </span>
          <button
            type="button"
            className={`pill-toggle-track ${rankedFilter ? "active" : ""}`}
            onClick={() => setRankedFilter((prev) => !prev)}
            aria-pressed={rankedFilter}
          >
            <span className="pill-toggle-knob" />
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
          <span>Loading rooms...</span>
        </div>
      ) : rooms.length === 0 ? (
        <div className="empty-state">No rooms found</div>
      ) : (
        <div className="room-grid">
          {rooms.map((room) => {
            const wager = formatWager(room);
            return (
              <div
                key={room.id}
                className="v-card room-card"
                onClick={() => onJoinRoom(room.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onJoinRoom(room.id);
                  }
                }}
              >
                <div className="room-card-header">
                  <div className="room-card-game">
                    <span className="room-card-game-badge">{room.gameType}</span>
                    {room.isRanked && (
                      <span className="room-card-ranked">Ranked</span>
                    )}
                  </div>
                </div>

                <div className="room-card-body">
                  <span className="room-card-players">
                    {room.minPlayers}–{room.maxPlayers} players
                  </span>
                  {wager && (
                    <span className="room-card-wager mono">{wager}</span>
                  )}
                </div>

                <div className="room-card-footer">
                  <div className="room-card-status">
                    <span className={`status-dot ${getStatusDot(room.status)}`} />
                    <span>{room.status.replace("_", " ")}</span>
                  </div>
                  {room.status === "waiting" && (
                    <button
                      className="v-btn v-btn-primary v-btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJoinRoom(room.id);
                      }}
                      type="button"
                    >
                      Join
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
