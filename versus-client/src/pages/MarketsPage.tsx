import { useState, useCallback } from "react";
import { MarketList } from "../components/MarketList";
import { MarketDetail } from "../components/MarketDetail";

export function MarketsPage() {
  const [activeMarketId, setActiveMarketId] = useState<string | null>(null);

  const handleSelect = useCallback((id: string) => {
    setActiveMarketId(id);
  }, []);

  const handleBack = useCallback(() => {
    setActiveMarketId(null);
  }, []);

  if (activeMarketId) {
    return (
      <div className="section">
        <div className="section-container">
          <MarketDetail marketId={activeMarketId} onBack={handleBack} />
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-container">
        <div className="arena-header">
          <h2 className="section-title">📊 prediction markets</h2>
          <p className="text-muted text-sm">
            bet on match outcomes and tournament winners
          </p>
        </div>
        <MarketList onSelect={handleSelect} />
      </div>
    </div>
  );
}
