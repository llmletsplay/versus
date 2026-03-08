# Wagering API

Experimental API surface for wagers, stake commitments, and intent-linked settlement flows.

## Overview

This API documents the current route surface, not a finished mainnet escrow product.

Implemented today:

- wager creation and lifecycle records
- stake commitment endpoints
- intent tracking endpoints
- x402 integration hooks

Not yet production-complete:

- audited smart-contract escrow
- full cryptographic signature validation across all chains
- real NEAR/Base/Solana settlement confirmation
- trustless dispute handling

## Endpoints

### Create Wager

Create a wager for a game.

```
POST /api/v1/wagers
```

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "gameId": "chess-abc123",
  "roomId": "room-xyz789",
  "amount": "10.00",
  "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "chainId": 8453
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "wagerId": "wager-123",
    "escrowAddress": "0x...",
    "depositUrl": "https://pay.versus.dev/escrow/wager-123",
    "amount": "10.00",
    "tokenSymbol": "USDC",
    "status": "pending_deposit"
  }
}
```

### Get Wager Status

Check wager status.

```
GET /api/v1/wagers/:wagerId
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "wager-123",
    "gameId": "chess-abc123",
    "amount": "10.00",
    "tokenSymbol": "USDC",
    "status": "active",
    "players": [
      {
        "userId": "user-1",
        "depositTx": "0x...",
        "depositConfirmed": true
      },
      {
        "userId": "user-2",
        "depositTx": "0x...",
        "depositConfirmed": true
      }
    ],
    "totalPool": "20.00"
  }
}
```

### Settle Wager

Settle wager after game completion.

```
POST /api/v1/wagers/:wagerId/settle
```

**Request Body:**

```json
{
  "winnerId": "user-1",
  "gameResult": {
    "winner": "user-1",
    "reason": "checkmate"
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "settled",
    "settlementTx": "0x...",
    "winner": "user-1",
    "payoutAmount": "19.80",
    "platformFee": "0.20"
  }
}
```

### Cancel Wager

Cancel an unstarted wager.

```
POST /api/v1/wagers/:wagerId/cancel
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "cancelled",
    "refundTx": "0x..."
  }
}
```

## Wager Status

| Status | Description |
|--------|-------------|
| `pending_deposit` | Waiting for deposits |
| `active` | Both sides deposited, game in progress |
| `settled` | Winner paid |
| `cancelled` | Refunded |
| `disputed` | Under review |

## Intended Escrow Flow

```
1. Create Wager → Generate escrow address
2. Players Deposit → On-chain confirmation
3. Game Starts → Escrow locked
4. Game Ends → Settlement triggered
5. Winner Paid → Payout on-chain
```

## Supported Tokens

| Token | Address | Chains |
|-------|---------|--------|
| USDC | 0xA0b8... | Base, Ethereum, Polygon |
| USDT | 0xdAC1... | Ethereum, Polygon |

## Platform Fees

- Standard: 1% of pot
- Minimum: $0.01
- Maximum: $10.00

## Security

### Design Goal

- funds committed without storing private keys
- settlement driven by signed intents
- outcome derived from deterministic game results

That is the architecture target. It is not a claim that the current implementation is production-trustless.

### Dispute Resolution

1. both parties can flag dispute
2. evidence can be attached
3. a final resolution source is chosen
4. funds are released after resolution

The exact trust model here is still under development.

## x402 Integration

Enable x402 for experimental payment-gated flows:

```bash
# Environment
X402_ENABLED=true
X402_SETTLEMENT_ADDRESS=0x...
X402_API_KEY=your-key
```

### x402 Payment Flow

When x402 is enabled, unpaid API requests return 402:

```json
{
  "error": "Payment Required",
  "x402": {
    "amount": "0.01",
    "token": "USDC",
    "recipient": "0x...",
    "paymentUrl": "https://pay.versus.dev/..."
  }
}
```

## Examples

### Full Wager Flow

```javascript
// 1. Create wager
const wagerRes = await fetch('/api/v1/wagers', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    gameId: game.id,
    amount: '10.00',
    tokenAddress: USDC_ADDRESS
  })
});
const { data: wager } = await wagerRes.json();

// 2. Deposit funds
await wallet.sendTransaction({
  to: wager.escrowAddress,
  value: parseUnits('10.00', 6)
});

// 3. Play game...

// 4. Settlement happens automatically on game end
// Or trigger manually:
await fetch(`/api/v1/wagers/${wager.wagerId}/settle`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    winnerId: winner.id
  })
});
```

## Next Steps

- [Rooms API](rooms.md) - Create wager rooms
- [Markets API](../features/markets.md) - Prediction markets
