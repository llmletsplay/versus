# Wagering & Escrow

Non-custodial crypto wagering for competitive games.

## Overview

Versus wagering features:

- **Non-custodial escrow** - Funds held in smart contracts
- **Intent-based settlement** - Secure payouts without holding keys
- **Multi-chain support** - Base, Ethereum, Polygon
- **Low fees** - 1% platform fee

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Player A   │     │    Escrow    │     │   Player B   │
│  Deposits $  │────▶│   Contract   │◀────│  Deposits $  │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                     Game Played
                            │
                            ▼
                     ┌──────────────┐
                     │   Winner     │
                     │   Receives   │
                     └──────────────┘
```

## Creating Wagers

### Via Room

```javascript
// Create wager room
const room = await fetch('/api/v1/rooms', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    name: '$10 Chess Match',
    gameType: 'chess',
    maxPlayers: 2,
    wager: {
      amount: '10.00',
      token: 'USDC',
      chainId: 8453
    }
  })
});
```

### Via API

```javascript
const wager = await fetch('/api/v1/wagers', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    gameId: 'chess-abc123',
    amount: '10.00',
    tokenAddress: USDC_ADDRESS,
    chainId: 8453
  })
});
```

## Depositing Funds

### Direct Deposit

```javascript
// Get escrow address
const { data: wager } = await fetch(`/api/v1/wagers/${wagerId}`).then(r => r.json());

// Send USDC to escrow
await usdcContract.transfer(wager.escrowAddress, parseUnits('10.00', 6));
```

### Payment Link

```javascript
// Generate payment link
const { data: wager } = await createWager(...);

// Share deposit URL
const depositUrl = wager.depositUrl;
// https://pay.versus.dev/escrow/wager-123
```

## Settlement

### Automatic Settlement

Wagers settle automatically when the game ends:

1. Game completes with clear winner
2. Settlement intent created
3. Winner receives payout minus fees

### Manual Settlement

```javascript
await fetch(`/api/v1/wagers/${wagerId}/settle`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    winnerId: 'user-1',
    gameResult: { reason: 'checkmate' }
  })
});
```

## Smart Contracts

### Escrow Contract

```solidity
contract GameEscrow {
    struct Wager {
        address player1;
        address player2;
        uint256 amount;
        address token;
        bool settled;
        address winner;
    }
    
    function deposit(uint256 wagerId, uint256 amount) external;
    function settle(uint256 wagerId, address winner) external;
    function cancel(uint256 wagerId) external;
}
```

### Security Features

- **Timelock**: 24-hour cancellation window
- **Multi-sig**: Large wagers require multiple confirmations
- **Pause**: Emergency pause functionality

## Supported Chains

| Chain | Chain ID | Native | USDC |
|-------|----------|--------|------|
| Base | 8453 | ETH | ✅ |
| Ethereum | 1 | ETH | ✅ |
| Polygon | 137 | MATIC | ✅ |

## Fees

| Type | Amount |
|------|--------|
| Platform Fee | 1% of pot |
| Gas | User pays |
| Minimum Fee | $0.01 |
| Maximum Fee | $10.00 |

### Fee Example

```
Pot: $20.00 (two $10 wagers)
Platform Fee: $0.20 (1%)
Winner receives: $19.80
```

## Disputes

### Raising a Dispute

```javascript
await fetch(`/api/v1/wagers/${wagerId}/dispute`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    reason: 'Suspected cheating',
    evidence: '...'
  })
});
```

### Dispute Resolution

1. Funds locked during dispute
2. Evidence reviewed
3. Resolution within 48 hours
4. Winner receives payout

## Cancellations

### Before Deposit

```javascript
await fetch(`/api/v1/wagers/${wagerId}/cancel`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### After Deposit

After both parties deposit, cancellation requires mutual agreement or dispute resolution.

## Best Practices

### 1. Verify Addresses

```javascript
// Always verify token address
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
```

### 2. Check Allowance

```javascript
// Ensure token allowance
const allowance = await token.allowance(userAddress, escrowAddress);
if (allowance < amount) {
  await token.approve(escrowAddress, amount);
}
```

### 3. Confirm Transactions

```javascript
// Wait for confirmation
const tx = await token.transfer(escrowAddress, amount);
await tx.wait(2); // Wait for 2 confirmations
```

## Risk Management

### Wager Limits

| Tier | Max Wager | Requirements |
|------|-----------|--------------|
| Bronze | $10 | New users |
| Silver | $100 | 10+ games |
| Gold | $1,000 | 50+ games, verified |
| Platinum | $10,000 | By invitation |

### Cool-off Periods

- Maximum 5 active wagers
- 24-hour cool-off after large losses

## Next Steps

- [API Reference](../api/wagering.md) - Wagering endpoints
- [Prediction Markets](markets.md) - Betting on outcomes
