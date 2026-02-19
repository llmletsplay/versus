import { useState, useEffect, useCallback } from "react";
import { marketApi } from "../services/api-client";
import { useAuth } from "../hooks/useAuth";
import { useWS } from "../contexts/WebSocketContext";
import type { PredictionMarket, MarketOdds, MarketPosition } from "../types";

interface MarketDetailProps {
  marketId: string;
  onBack: () => void;
  compact?: boolean;
}

function formatCountdown(closesAt: number): string {
  const now = Date.now();
  const diff = closesAt - now;
  if (diff <= 0) return "closed";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

const OUTCOME_COLORS = ["color-0", "color-1", "color-2", "color-3", "color-4", "color-5"];

export function MarketDetail({ marketId, onBack, compact }: MarketDetailProps) {
  const { user } = useAuth();
  const { subscribe } = useWS();

  const [market, setMarket] = useState<PredictionMarket | null>(null);
  const [odds, setOdds] = useState<MarketOdds | null>(null);
  const [positions, setPositions] = useState<MarketPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Bet form
  const [selectedOutcome, setSelectedOutcome] = useState<number>(0);
  const [betAmount, setBetAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);

  const fetchMarket = useCallback(async () => {
    try {
      const [marketRes, oddsRes, posRes] = await Promise.all([
        marketApi.get(marketId),
        marketApi.odds(marketId),
        marketApi.positions(marketId),
      ]);
      if (marketRes.error) {
        setError(marketRes.error);
        return;
      }
      if (marketRes.data) setMarket(marketRes.data);
      if (oddsRes.data) setOdds(oddsRes.data);
      if (posRes.data) setPositions(posRes.data);
    } catch {
      setError("Failed to load market");
    }
  }, [marketId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      await fetchMarket();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [fetchMarket]);

  useEffect(() => {
    const unsubBet = subscribe("market:bet", (data) => {
      const betData = data as { marketId: string; totalPool: number; outcomePools: number[] };
      if (betData.marketId !== marketId) return;
      setMarket((prev) =>
        prev ? { ...prev, totalPool: betData.totalPool, outcomePools: betData.outcomePools } : prev
      );
      marketApi.odds(marketId).then((res) => {
        if (res.data) setOdds(res.data);
      });
    });

    const unsubUpdate = subscribe("market:update", (data) => {
      const d = data as { marketId: string };
      if (d.marketId === marketId) fetchMarket();
    });

    const unsubResolved = subscribe("market:resolved", (data) => {
      const d = data as { marketId: string };
      if (d.marketId === marketId) fetchMarket();
    });

    return () => {
      unsubBet();
      unsubUpdate();
      unsubResolved();
    };
  }, [subscribe, marketId, fetchMarket]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  function calculatePotentialPayout(): number {
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0 || !odds) return 0;
    const multiplier = odds.payoutMultipliers[selectedOutcome] ?? 0;
    return amount * multiplier;
  }

  async function handlePlaceBet(e: React.FormEvent) {
    e.preventDefault();
    setBetError(null);
    const amount = parseFloat(betAmount);
    if (!amount || amount <= 0) {
      setBetError("Enter a valid amount");
      return;
    }
    setPlacing(true);
    try {
      const response = await marketApi.bet(marketId, {
        outcomeIndex: selectedOutcome,
        amount,
      });
      if (response.error) {
        setBetError(response.error);
      } else {
        setBetAmount("");
        const [oddsRes, posRes] = await Promise.all([
          marketApi.odds(marketId),
          marketApi.positions(marketId),
        ]);
        if (oddsRes.data) setOdds(oddsRes.data);
        if (posRes.data) setPositions(posRes.data);
      }
    } catch {
      setBetError("Failed to place bet");
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-state" style={{ padding: compact ? "var(--space-8) 0" : undefined }}>
        <div className="loading-spinner" />
        <span>Loading market...</span>
      </div>
    );
  }

  if (!market) {
    return (
      <div>
        {!compact && (
          <button className="v-btn v-btn-ghost v-btn-sm" onClick={onBack}>
            &larr; Back
          </button>
        )}
        <div className="error-banner" style={{ marginTop: "var(--space-4)" }}>
          {error ?? "Market not found"}
        </div>
      </div>
    );
  }

  const canBet = market.status === "open" && user !== null;
  const potentialPayout = calculatePotentialPayout();

  return (
    <div className={`v-card-static ${compact ? "market-compact" : ""}`}>
      {!compact && (
        <button className="v-btn v-btn-ghost v-btn-sm" onClick={onBack} style={{ marginBottom: "var(--space-4)" }}>
          &larr; Back
        </button>
      )}

      <div className="market-detail-header">
        <h2>{market.question}</h2>
        <div className="market-detail-meta">
          <span className="meta-badge">{market.status}</span>
          {!compact && (
            <span className="meta-badge">
              {market.marketType.replace("_", " ")}
            </span>
          )}
          <span className="mono" style={{ color: "var(--color-accent)" }}>
            {market.totalPool} {market.token}
          </span>
          <span className="mono">{formatCountdown(market.closesAt)}</span>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Odds */}
      <div className="market-section">
        <h3>Odds</h3>
        <div className="odds-bars">
          {market.outcomes.map((outcome, index) => {
            const probability = odds
              ? (odds.impliedProbabilities[index] ?? 0) * 100
              : market.totalPool > 0
                ? ((market.outcomePools[index] ?? 0) / market.totalPool) * 100
                : 100 / market.outcomes.length;
            const multiplier = odds?.payoutMultipliers[index] ?? 0;
            const colorClass = OUTCOME_COLORS[index % OUTCOME_COLORS.length];

            return (
              <div key={index} className="odds-row">
                <div className="odds-row-header">
                  <span className="odds-row-name">{outcome}</span>
                  <span className="odds-row-value mono">
                    {probability.toFixed(1)}% / {multiplier.toFixed(2)}x
                  </span>
                </div>
                <div className="outcome-bar-track">
                  <div
                    className={`outcome-bar ${colorClass}`}
                    style={{ width: `${probability}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bet form */}
      {canBet && (
        <div className="bet-section">
          {!compact && <h3 className="market-section" style={{ marginBottom: "var(--space-4)" }}>Place bet</h3>}
          <form onSubmit={handlePlaceBet}>
            <div className="bet-outcomes">
              {market.outcomes.map((outcome, index) => (
                <label key={index} className="bet-outcome-option">
                  <input
                    type="radio"
                    name="outcome"
                    value={index}
                    checked={selectedOutcome === index}
                    onChange={() => setSelectedOutcome(index)}
                  />
                  <span>{outcome}</span>
                </label>
              ))}
            </div>

            <div className="bet-amount-row">
              <label className="bet-amount-label" htmlFor={`bet-amount-${marketId}`}>
                Amount ({market.token})
              </label>
              <input
                id={`bet-amount-${marketId}`}
                type="number"
                className="v-input"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="any"
              />
            </div>

            {potentialPayout > 0 && (
              <div className="bet-payout-preview">
                Potential payout:{" "}
                <span className="payout-value">
                  {potentialPayout.toFixed(2)} {market.token}
                </span>
              </div>
            )}

            {betError && <div className="error-banner">{betError}</div>}

            <button
              type="submit"
              className="v-btn v-btn-primary"
              disabled={placing || !betAmount}
              style={{ width: "100%" }}
            >
              {placing ? "Placing bet..." : "Place Bet"}
            </button>
          </form>
        </div>
      )}

      {/* Positions */}
      {!compact && positions.length > 0 && (
        <div className="positions-section">
          <h3 className="market-section">Your positions</h3>
          <div className="positions-list">
            {positions.map((position) => (
              <div key={position.id} className="position-row">
                <span className="position-outcome">
                  {market.outcomes[position.outcomeIndex] ?? `Outcome #${position.outcomeIndex}`}
                </span>
                <div className="position-details">
                  <span className="mono">{position.amount} {position.token}</span>
                  <span>
                    payout: <span className="mono">{position.potentialPayout.toFixed(2)} {position.token}</span>
                  </span>
                  {position.settled && (
                    <span className="position-settled">
                      settled: {position.payout.toFixed(2)} {position.token}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
