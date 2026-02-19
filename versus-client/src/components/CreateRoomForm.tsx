import { useState, FormEvent } from "react";
import { roomApi } from "../services/api-client";
import { useAuth } from "../hooks/useAuth";

interface CreateRoomFormProps {
  onCreated: (roomId: string) => void;
}

const GAME_TYPES = [
  "chess", "poker", "tic-tac-toe", "connect-four", "checkers", "go",
  "battleship", "blackjack", "othello", "mancala", "thirteen", "go-fish",
  "cuttle", "war", "bullshit", "word-tiles", "crazy-cards", "catan",
  "omok", "against-cards", "bingo", "hearts", "spades", "mahjong",
  "chinese-checkers", "martial-tactics", "shogi",
];

export function CreateRoomForm({ onCreated }: CreateRoomFormProps) {
  const { user } = useAuth();

  const [gameType, setGameType] = useState("chess");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isPublic, setIsPublic] = useState(true);
  const [isRanked, setIsRanked] = useState(false);
  const [wagerAmount, setWagerAmount] = useState<number>(0);
  const [wagerCurrency, setWagerCurrency] = useState("USDC");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError("You must be logged in to create a room");
      return;
    }

    if (!gameType.trim()) {
      setError("Game type is required");
      return;
    }

    setLoading(true);

    try {
      const response = await roomApi.create({
        gameType: gameType.trim(),
        maxPlayers,
        isPublic,
        isRanked,
        ...(wagerAmount > 0 && {
          wagerAmount,
          wagerCurrency: wagerCurrency.trim() || "USDC",
        }),
      });

      if (response.data) {
        onCreated(response.data.id);
        setGameType("chess");
        setMaxPlayers(2);
        setIsPublic(true);
        setIsRanked(false);
        setWagerAmount(0);
        setWagerCurrency("USDC");
      } else {
        setError(response.error || "Failed to create room");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="create-room-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="create-game-type">Game type</label>
        <select
          id="create-game-type"
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

      <div className="form-field">
        <label htmlFor="create-max-players">Max players</label>
        <input
          id="create-max-players"
          className="v-input"
          type="number"
          min={2}
          max={16}
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
        />
      </div>

      <div className="form-toggle">
        <span className="form-toggle-label">Public</span>
        <button
          type="button"
          className={`pill-toggle-track ${isPublic ? "active" : ""}`}
          onClick={() => setIsPublic((prev) => !prev)}
          aria-pressed={isPublic}
        >
          <span className="pill-toggle-knob" />
        </button>
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

      <div className="form-row-inline">
        <div className="form-field">
          <label htmlFor="create-wager-amount">Wager amount</label>
          <input
            id="create-wager-amount"
            className="v-input"
            type="number"
            min={0}
            step="0.01"
            value={wagerAmount}
            onChange={(e) => setWagerAmount(Number(e.target.value))}
            placeholder="0 for no wager"
          />
        </div>

        {wagerAmount > 0 && (
          <div className="form-field">
            <label htmlFor="create-wager-currency">Currency</label>
            <input
              id="create-wager-currency"
              className="v-input"
              type="text"
              value={wagerCurrency}
              onChange={(e) => setWagerCurrency(e.target.value)}
              placeholder="e.g. USDC, ETH"
            />
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <button
        className="v-btn v-btn-primary"
        type="submit"
        disabled={loading || !user}
      >
        {loading ? "Creating..." : "Create Room"}
      </button>

      {!user && (
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "var(--space-2)" }}>
          You must be signed in to create a room.
        </p>
      )}
    </form>
  );
}
