# Tournaments

Organized competitive events with brackets, prizes, and rankings.

## Overview

Versus tournaments support:

- **Single elimination** brackets
- **Swiss system** pairings
- **Round robin** formats
- **Custom scoring** rules

## Endpoints

### List Tournaments

```
GET /api/v1/tournaments
```

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `gameType` | Filter by game |
| `status` | Filter by status |
| `limit` | Results per page |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "tourn-123",
      "name": "Weekly Chess Championship",
      "gameType": "chess",
      "status": "registration",
      "startTime": "2024-02-15T18:00:00Z",
      "maxParticipants": 64,
      "currentParticipants": 32,
      "prizePool": "500.00",
      "entryFee": "10.00"
    }
  ]
}
```

### Create Tournament

```
POST /api/v1/tournaments
```

**Request Body:**

```json
{
  "name": "Chess Grand Prix",
  "gameType": "chess",
  "format": "single-elimination",
  "maxParticipants": 32,
  "startTime": "2024-02-20T14:00:00Z",
  "entryFee": "5.00",
  "prizeDistribution": [0.5, 0.3, 0.15, 0.05],
  "rules": {
    "timeControl": "10+5",
    "rated": true
  }
}
```

### Get Tournament

```
GET /api/v1/tournaments/:tournamentId
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "tourn-123",
    "name": "Chess Grand Prix",
    "gameType": "chess",
    "format": "single-elimination",
    "status": "active",
    "round": 2,
    "totalRounds": 5,
    "participants": [
      {
        "id": "user-1",
        "username": "grandmaster",
        "seed": 1,
        "rating": 2200,
        "wins": 2,
        "losses": 0,
        "eliminated": false
      }
    ],
    "bracket": { ... },
    "prizePool": "160.00"
  }
}
```

### Join Tournament

```
POST /api/v1/tournaments/:tournamentId/join
```

**Response:**

```json
{
  "success": true,
  "data": {
    "participantId": "user-1",
    "seed": 15
  },
  "message": "Successfully registered for tournament"
}
```

### Leave Tournament

```
POST /api/v1/tournaments/:tournamentId/leave
```

### Get Bracket

```
GET /api/v1/tournaments/:tournamentId/bracket
```

**Response:**

```json
{
  "success": true,
  "data": {
    "rounds": [
      [
        {
          "matchId": "match-1",
          "player1": { "id": "user-1", "username": "Player 1" },
          "player2": { "id": "user-2", "username": "Player 2" },
          "winner": "user-1",
          "status": "completed"
        }
      ]
    ]
  }
}
```

### Get Standings

```
GET /api/v1/tournaments/:tournamentId/standings
```

## Tournament Formats

### Single Elimination

```
Round 1: 32 players → 16 winners
Round 2: 16 players → 8 winners
Round 3: 8 players → 4 winners
Semifinals: 4 players → 2 winners
Finals: 2 players → 1 champion
```

### Swiss System

- Players with same score paired
- No elimination
- Fixed number of rounds
- Winner by points

### Round Robin

- Everyone plays everyone
- Most wins takes first
- Used for smaller groups

## Prize Distribution

### Standard Distribution

| Place | Prize % |
|-------|---------|
| 1st | 50% |
| 2nd | 30% |
| 3rd | 15% |
| 4th | 5% |

### Custom Distribution

```json
{
  "prizeDistribution": [0.6, 0.25, 0.1, 0.05]
}
```

## Tournament Status

| Status | Description |
|--------|-------------|
| `draft` | Created, not published |
| `registration` | Open for signups |
| `check_in` | Players checking in |
| `active` | Games in progress |
| `completed` | Finished |
| `cancelled` | Cancelled |

## Time Controls

| Format | Time |
|--------|------|
| Bullet | 1+0 |
| Blitz | 3+2 |
| Rapid | 10+5 |
| Classical | 30+15 |

## Seeding

Players are seeded by ELO rating:

1. Highest rated player gets seed #1
2. Seeds distributed to avoid top players meeting early
3. Bracket: #1 vs #32, #16 vs #17, etc.

## Byes

If participants don't match a power of 2:

- Byes awarded to top seeds
- Bye counts as automatic win
- Players with byes advance to next round

## Match Rules

### Default Rules

- 10-minute time limit per player
- 5-second increment per move
- Rated game
- Winner advances

### Custom Rules

```json
{
  "rules": {
    "timeControl": "15+10",
    "rated": true,
    "drawOffer": true,
    "takebacks": false
  }
}
```

## Examples

### Complete Tournament Flow

```javascript
// 1. Create tournament
const tourn = await fetch('/api/v1/tournaments', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Friday Chess',
    gameType: 'chess',
    format: 'single-elimination',
    maxParticipants: 16,
    startTime: new Date(Date.now() + 86400000).toISOString()
  })
});

// 2. Join tournament
await fetch(`/api/v1/tournaments/${tourn.id}/join`, {
  method: 'POST'
});

// 3. Wait for start
// 4. Play matches as they're assigned
// 5. Check bracket for progress

const bracket = await fetch(`/api/v1/tournaments/${tourn.id}/bracket`);
```

## Hosting Tournaments

### Requirements

- Verified account
- Minimum 100 games played
- Good standing (no bans)

### Responsibilities

- Set fair rules
- Monitor for cheating
- Handle disputes
- Distribute prizes

## ELO Integration

Tournament games affect ELO:

- Rated tournaments update ratings
- Higher K-factor for tournaments
- Special tournament rating adjustments

## Next Steps

- [Rooms API](../api/rooms.md) - Create game rooms
- [Wagering](wagering.md) - Add prizes
