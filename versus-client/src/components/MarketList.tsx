import { useState, useEffect } from "react";
import { marketApi } from "../services/api-client";
import { useWS } from "../contexts/WebSocketContext";
import type { PredictionMarket } from "../types";

interface MarketListProps {
  onSelect: (id: string) => void;
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

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function getOutcomeProbability(market: PredictionMarket, index: number): number {
  if (market.totalPool === 0) {
    return market.outcomes.length > 0 ? 100 / market.outcomes.length : 0;
  }
  const outcomePool = market.outcomePools[index] ?? 0;
  return (outcomePool / market.totalPool) * 100;
}

const OUTCOME_COLORS = ["color-0", "color-1", "color-2", "color-3", "color-4", "color-5"];

export function MarketList({ onSelect, compact }: MarketListProps) {
  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const { subscribe } = useWS();

  useEffect(() => {
    let cancelled = false;
    async function fetchMarkets() {
      setLoading(true);
      setError(null);
      try {
        const response = await marketApi.list();
        if (cancelled) return;
        if (response.error) {
          setError(response.error);
          setMarkets([]);
        } else {
          setMarkets(response.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to fetch markets");
          setMarkets([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchMarkets();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe("market:bet", (data) => {
      const betData = data as {
        marketId: string;
        totalPool: number;
        outcomePools: number[];
      };
      setMarkets((prev) =>
        prev.map((market) =>
          market.id === betData.marketId
            ? { ...market, totalPool: betData.totalPool, outcomePools: betData.outcomePools }
            : market
        )
      );
    });
    return unsubscribe;
  }, [subscribe]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const displayMarkets = compact ? markets.slice(0, 3) : markets;

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
          <span>Loading markets...</span>
        </div>
      ) : displayMarkets.length === 0 ? (
        <div className="empty-state">No markets available</div>
      ) : (
        <div className="market-grid">
          {displayMarkets.map((market) => (
            <div
              key={market.id}
              className="v-card market-card"
              onClick={() => onSelect(market.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(market.id);
                }
              }}
            >
              <div className="market-card-question">{market.question}</div>

              <div className="odds-bars">
                {market.outcomes.map((outcome, index) => {
                  const probability = getOutcomeProbability(market, index);
                  const colorClass = OUTCOME_COLORS[index % OUTCOME_COLORS.length];

                  return (
                    <div key={index} className="odds-row">
                      <div className="odds-row-header">
                        <span className="odds-row-name">{outcome}</span>
                        <span className="odds-row-value mono">{probability.toFixed(1)}%</span>
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

              <div className="market-card-meta">
                <span className="market-card-pool mono">
                  {market.totalPool} {market.token}
                </span>
                <span className="market-card-countdown mono">
                  {formatCountdown(market.closesAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
