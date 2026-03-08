import { useState, useEffect, useRef } from "react";
import { matchmakingApi } from "../services/api-client";

interface MatchmakingPanelProps {
  onMatchFound: (roomId: string) => void;
}

const GAME_TYPES = [
  "chess", "poker", "tic-tac-toe", "connect-four", "checkers", "go",
  "battleship", "blackjack", "othello", "mancala", "thirteen", "go-fish",
  "cuttle", "war", "bullshit", "word-tiles", "crazy-cards", "catan",
  "omok", "bingo", "hearts", "spades", "mahjong",
  "chinese-checkers", "martial-tactics", "shogi",
];

export function MatchmakingPanel({ onMatchFound }: MatchmakingPanelProps) {
  const [gameType, setGameType] = useState("chess");
  const [isRanked, setIsRanked] = useState(false);
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchStartRef = useRef<number>(0);

  function clearTimers() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  async function handleFindMatch() {
    if (!gameType.trim()) {
      setError("Game type is required");
      return;
    }

    setError(null);
    setSearching(true);
    setElapsed(0);
    searchStartRef.current = Date.now();

    try {
      const response = await matchmakingApi.queue({
        gameType: gameType.trim(),
        isRanked,
      });

      if (response.error) {
        setError(response.error);
        setSearching(false);
        return;
      }

      if (response.data?.matched && response.data.roomId) {
        setSearching(false);
        onMatchFound(response.data.roomId);
        return;
      }

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - searchStartRef.current) / 1000));
      }, 1000);

      pollRef.current = setInterval(async () => {
        try {
          const pollResponse = await matchmakingApi.queue({
            gameType: gameType.trim(),
            isRanked,
          });
          if (pollResponse.data?.matched && pollResponse.data.roomId) {
            clearTimers();
            setSearching(false);
            onMatchFound(pollResponse.data.roomId);
          }
        } catch {
          // Continue polling
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start matchmaking");
      setSearching(false);
    }
  }

  async function handleCancel() {
    clearTimers();
    setSearching(false);
    setElapsed(0);
    try {
      await matchmakingApi.dequeue();
    } catch {
      // Best-effort
    }
  }

  function formatElapsed(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return (
    <div className="v-card-static matchmaking">
      <h3>Quick Match</h3>

      {!searching ? (
        <div className="matchmaking-form">
          <div className="matchmaking-row">
            <label htmlFor="mm-game-type">Game type</label>
            <select
              id="mm-game-type"
              className="v-select"
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
            >
              {GAME_TYPES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="form-toggle">
            <span className="form-toggle-label">Ranked</span>
            <button
              type="button"
              className={`pill-toggle-track ${isRanked ? "active" : ""}`}
              onClick={() => setIsRanked((prev) => !prev)}
              aria-pressed={isRanked}
            >
              <span className="pill-toggle-knob" />
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <button
            className="v-btn v-btn-primary"
            onClick={handleFindMatch}
            type="button"
          >
            Find Match
          </button>
        </div>
      ) : (
        <div className="matchmaking-searching">
          <div className="matchmaking-pulse">
            <span className="status-dot status-dot--live" />
            <span>Searching for opponent...</span>
          </div>
          <div className="matchmaking-timer mono">{formatElapsed(elapsed)}</div>
          <div className="matchmaking-game-label">
            {gameType} &middot; {isRanked ? "Ranked" : "Casual"}
          </div>
          <button
            className="v-btn v-btn-ghost"
            onClick={handleCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
