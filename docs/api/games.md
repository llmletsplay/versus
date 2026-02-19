# Games API

Manage game creation, state, and moves.

## Endpoints

### List Available Games

Get all supported game types and metadata.

```
GET /api/v1/games
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "tic-tac-toe": {
      "name": "Tic Tac Toe",
      "description": "Classic 3x3 grid game",
      "minPlayers": 2,
      "maxPlayers": 2,
      "estimatedDuration": 5,
      "difficulty": "beginner",
      "categories": ["strategy", "classic"]
    },
    "chess": {
      "name": "Chess",
      "description": "Strategic board game",
      "minPlayers": 2,
      "maxPlayers": 2,
      "estimatedDuration": 60,
      "difficulty": "advanced",
      "categories": ["strategy", "board"]
    }
  }
}
```

### Get Game Metadata

Get metadata for a specific game type.

```
GET /api/v1/games/:gameType/metadata
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "name": "Chess",
    "description": "Strategic board game with complex rules",
    "minPlayers": 2,
    "maxPlayers": 2,
    "estimatedDuration": 60,
    "difficulty": "advanced",
    "categories": ["strategy", "board"],
    "controls": {
      "click": "Select and move pieces",
      "drag": "Drag pieces to target square"
    }
  }
}
```

### Get Game Rules

Get rules documentation for a game.

```
GET /api/v1/games/:gameType/rules
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "gameType": "chess",
    "rules": "# Chess Rules\n\nChess is played on an 8x8 board..."
  }
}
```

### Create Game

Create a new game instance.

```
POST /api/v1/games/:gameType/new
```

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body (optional):**

```json
{
  "config": {
    "maxPlayers": 2,
    "timeLimit": 3600,
    "difficulty": "medium"
  }
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "gameId": "chess-a1b2c3d4"
  },
  "message": "Game created successfully"
}
```

### Get Game State

Get current state of a game.

```
GET /api/v1/games/:gameType/:gameId/state
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "gameId": "chess-a1b2c3d4",
    "gameType": "chess",
    "board": [...],
    "currentTurn": "white",
    "players": ["player1", "player2"],
    "isGameOver": false,
    "winner": null,
    "moveHistory": [...]
  }
}
```

### Make Move

Submit a move in the game.

```
POST /api/v1/games/:gameType/:gameId/move
```

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "player": "player1",
  "moveData": {
    // Game-specific move data
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "gameState": { ... },
    "moveValid": true,
    "isGameOver": false,
    "winner": null
  },
  "message": "Move processed successfully"
}
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_MOVE` | Move validation failed |
| 400 | `NOT_PLAYER_TURN` | Not your turn |
| 404 | `GAME_NOT_FOUND` | Game doesn't exist |
| 409 | `GAME_OVER` | Game already completed |

### Validate Move

Check if a move is valid without applying it.

```
POST /api/v1/games/:gameType/:gameId/validate
```

**Request Body:**

```json
{
  "player": "player1",
  "moveData": { ... }
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "valid": true
  }
}
```

### Get Move History

Get all moves made in the game.

```
GET /api/v1/games/:gameType/:gameId/history
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "player": "white",
      "moveData": { "from": "e2", "to": "e4" },
      "timestamp": 1640995200000
    },
    {
      "player": "black",
      "moveData": { "from": "e7", "to": "e5" },
      "timestamp": 1640995205000
    }
  ]
}
```

### Delete Game

Delete an abandoned game.

```
DELETE /api/v1/games/:gameId
```

**Response (200):**

```json
{
  "success": true,
  "message": "Game deleted successfully"
}
```

## Game-Specific Moves

### Tic-Tac-Toe

```json
{
  "player": "player1",
  "moveData": {
    "row": 0,
    "col": 1
  }
}
```

### Chess

```json
{
  "player": "white",
  "moveData": {
    "from": "e2",
    "to": "e4",
    "promotion": "queen"  // Optional, for pawn promotion
  }
}
```

### Poker

```json
{
  "player": "player1",
  "moveData": {
    "action": "raise",
    "amount": 100
  }
}
```

### Go

```json
{
  "player": "black",
  "moveData": {
    "x": 15,
    "y": 15,
    "pass": false
  }
}
```

## Supported Games

| Game | Type ID | Players | Category |
|------|---------|---------|----------|
| Tic-Tac-Toe | `tic-tac-toe` | 2 | Classic |
| Chess | `chess` | 2 | Strategy |
| Go | `go` | 2 | Strategy |
| Checkers | `checkers` | 2 | Classic |
| Othello | `othello` | 2 | Strategy |
| Connect Four | `connect-four` | 2 | Classic |
| Mancala | `mancala` | 2 | Classic |
| Battleship | `battleship` | 2 | Strategy |
| Poker | `poker` | 2-8 | Card |
| Blackjack | `blackjack` | 1-7 | Card |
| Hearts | `hearts` | 4 | Card |
| Spades | `spades` | 4 | Card |
| Catan | `catan` | 3-4 | Modern |
| Mahjong | `mahjong` | 4 | Tile |

## Examples

### Complete Game Flow

```javascript
// 1. Create game
const createRes = await fetch('/api/v1/games/tic-tac-toe/new', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data: { gameId } } = await createRes.json();

// 2. Make moves
async function makeMove(row, col) {
  const res = await fetch(`/api/v1/games/tic-tac-toe/${gameId}/move`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      player: currentPlayer,
      moveData: { row, col }
    })
  });
  return res.json();
}

// 3. Get final state
const stateRes = await fetch(`/api/v1/games/tic-tac-toe/${gameId}/state`);
const { data: gameState } = await stateRes.json();

if (gameState.isGameOver) {
  console.log(`Winner: ${gameState.winner}`);
}
```

## Next Steps

- [Rooms API](rooms.md) - Multiplayer rooms
- [Wagering API](wagering.md) - Add stakes
