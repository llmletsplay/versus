# Prediction Markets

Experimental market layer built on top of the core game platform.

## Status

The market APIs and service layer exist, but this feature should be treated as experimental for the same reason as wagering: the settlement and resolution path is not hardened enough yet for production trust assumptions.

## Overview

Prediction markets are intended to allow users to bet on:

- Tournament winners
- Match outcomes
- Game statistics
- Custom events

## Market Types

| Type | Description |
|------|-------------|
| Binary | Yes/No outcomes |
| Scalar | Numeric ranges |
| Categorical | Multiple options |

## Endpoints

### Create Market

```
POST /api/v1/markets
```

**Request Body:**

```json
{
  "title": "Chess Tournament Winner",
  "description": "Who will win the Grand Championship?",
  "type": "categorical",
  "outcomes": ["Player A", "Player B", "Player C", "Draw"],
  "endDate": "2024-02-15T00:00:00Z",
  "resolutionSource": "api",
  "tags": ["chess", "tournament"]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "marketId": "market-123",
    "contractAddress": "0x...",
    "outcomes": [
      { "id": 0, "name": "Player A", "currentPrice": "0.35" },
      { "id": 1, "name": "Player B", "currentPrice": "0.40" },
      { "id": 2, "name": "Player C", "currentPrice": "0.20" },
      { "id": 3, "name": "Draw", "currentPrice": "0.05" }
    ]
  }
}
```

### Get Market

```
GET /api/v1/markets/:marketId
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "market-123",
    "title": "Chess Tournament Winner",
    "status": "active",
    "totalVolume": "5000.00",
    "outcomes": [
      {
        "id": 0,
        "name": "Player A",
        "currentPrice": "0.35",
        "volume": "1750.00",
        "percentage": 35
      }
    ],
    "endDate": "2024-02-15T00:00:00Z"
  }
}
```

### Buy Shares

```
POST /api/v1/markets/:marketId/buy
```

**Request Body:**

```json
{
  "outcomeId": 0,
  "amount": "100.00",
  "maxPrice": "0.40"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "shares": "285.71",
    "avgPrice": "0.35",
    "totalCost": "100.00",
    "txHash": "0x..."
  }
}
```

### Sell Shares

```
POST /api/v1/markets/:marketId/sell
```

**Request Body:**

```json
{
  "outcomeId": 0,
  "shares": "100.00",
  "minPrice": "0.30"
}
```

### Resolve Market

```
POST /api/v1/markets/:marketId/resolve
```

**Request Body:**

```json
{
  "winningOutcomeId": 1,
  "evidence": "Tournament results: Player B won"
}
```

## Market Lifecycle

```
1. Created → Accepting trades
2. Active → Trading open
3. Closed → No more trades
4. Resolved → Winnings claimable
5. Settled → All payouts complete
```

## Trading Mechanics

### Price Calculation

Prices represent probability estimates:

- Price = $0.35 → 35% estimated probability
- Buying shares increases price
- Selling shares decreases price

### Example Trade

```javascript
// Market: "Will Player A win?"
// Current price: $0.35

// Buy $100 worth of YES shares
const result = await buyShares(marketId, 0, 100);

// If YES wins:
// Payout = shares × $1.00
// Profit = payout - cost

// If NO wins:
// Payout = $0
// Loss = cost
```

## Liquidity Pools

Markets use automated market makers (AMM):

```solidity
function calcBuyPrice(
    uint256 outcome,
    uint256 amount
) returns (uint256 cost, uint256 shares);
```

### Fee Structure

| Fee | Amount |
|-----|--------|
| Trading Fee | 0.5% |
| Resolution Fee | 0.1% |

## Resolution

The intended resolution sources are:

Markets can resolve via:

| Source | Description |
|--------|-------------|
| `api` | Versus game API |
| `manual` | Admin resolution |
| `chainlink` | Planned integration |
| `uma` | Planned integration |

## Examples

### Complete Market Flow

```javascript
// 1. Create market
const market = await fetch('/api/v1/markets', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Chess Match Winner',
    type: 'binary',
    outcomes: ['Player A wins', 'Player B wins'],
    endDate: '2024-02-15T18:00:00Z'
  })
});

// 2. Buy shares
await fetch(`/api/v1/markets/${market.id}/buy`, {
  method: 'POST',
  body: JSON.stringify({
    outcomeId: 0,
    amount: '50.00'
  })
});

// 3. Wait for resolution
// 4. Claim winnings if your outcome wins
await fetch(`/api/v1/markets/${market.id}/claim`, {
  method: 'POST'
});
```

## Risk Considerations

### Impermanent Loss

Trading in AMM markets can result in impermanent loss if prices move significantly.

### Resolution Risk

Markets may resolve unexpectedly if:

- Event is cancelled
- Rules are disputed
- Oracle fails

### Liquidity Risk

Low liquidity markets may have:

- Wide spreads
- Large price impact
- Difficulty exiting positions

## Best Practices

1. **Research outcomes** before trading
2. **Understand odds** implied by prices
3. **Monitor liquidity** before large trades
4. **Set price limits** to avoid slippage

## Next Steps

- [Wagering](wagering.md) - Direct game wagers
- [Tournaments](tournaments.md) - Tournament participation
