# API Documentation - Versus Game Server

## Base URL
- **Development**: `http://localhost:6789`
- **Production**: `https://your-domain.com`

## Authentication

All authenticated endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Response Format

All API responses follow this structure:
```json
{
  "success": true | false,
  "data": { ... },           // Present on success
  "message": "string",       // Optional success message
  "error": "string",         // Present on error
  "code": "ERROR_CODE",      // Present on error
  "details": { ... }         // Additional error context (development only)
}
```

## Authentication Endpoints

### POST `/api/v1/auth/register`
Register a new user account.

**Request Body:**
```json
{
  "username": "string",     // 3-20 chars, alphanumeric + underscore
  "email": "string",        // Valid email format
  "password": "string"      // Minimum 6 characters
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "token": "jwt-token-string",
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "role": "player",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601",
      "isActive": true
    }
  },
  "message": "User registered successfully"
}
```

**Error Responses:**
- `409 Conflict`: Username or email already exists
- `400 Bad Request`: Validation error

### POST `/api/v1/auth/login`
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "jwt-token-string",
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "role": "player",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601",
      "isActive": true
    }
  },
  "message": "Login successful"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid credentials
- `400 Bad Request`: Missing username or password

### GET `/api/v1/auth/me`
Get current authenticated user information.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "role": "player" | "admin",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "isActive": true
  }
}
```

### POST `/api/v1/auth/refresh`
Refresh JWT token for extended session.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "new-jwt-token-string",
    "user": { /* user object */ }
  },
  "message": "Token refreshed successfully"
}
```

## Game Endpoints

### GET `/api/v1/games`
List all available game types and metadata.

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
      "description": "Strategic board game with complex rules",
      "minPlayers": 2,
      "maxPlayers": 2,
      "estimatedDuration": 60,
      "difficulty": "advanced",
      "categories": ["strategy", "board"]
    }
    // ... 27+ more games
  },
  "message": "Available games retrieved successfully"
}
```

### POST `/api/v1/games/:gameType/new`
Create a new game of the specified type.

**Path Parameters:**
- `gameType`: One of the supported game types (e.g., "tic-tac-toe", "chess", "poker")

**Request Body:**
```json
{
  "config": {
    "maxPlayers": 2,        // Optional: Override default max players
    "minPlayers": 2,        // Optional: Override default min players
    "timeLimit": 3600,      // Optional: Game time limit in seconds
    "difficulty": "medium", // Optional: Game difficulty level
    "variant": "standard"   // Optional: Game variant
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "gameId": "tic-tac-toe-uuid-string"
  },
  "message": "Game created successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Unknown game type or invalid configuration
- `500 Internal Server Error`: Game creation failed

### GET `/api/v1/games/:gameType/:gameId/state`
Get current game state.

**Path Parameters:**
- `gameType`: Game type
- `gameId`: Unique game identifier

**Response (200):**
```json
{
  "success": true,
  "data": {
    "gameId": "tic-tac-toe-uuid",
    "gameType": "tic-tac-toe",
    "board": [
      ["", "", ""],
      ["", "X", ""],
      ["", "", ""]
    ],
    "currentPlayer": "player2",
    "players": ["player1", "player2"],
    "isGameOver": false,
    "winner": null,
    "metadata": {
      "turnCount": 1,
      "startTime": 1640995200000
    }
  }
}
```

**Error Responses:**
- `404 Not Found`: Game not found
- `500 Internal Server Error`: Failed to retrieve game state

### POST `/api/v1/games/:gameType/:gameId/move`
Make a move in the game.

**Path Parameters:**
- `gameType`: Game type
- `gameId`: Unique game identifier

**Request Body (varies by game type):**
```json
// Tic-tac-toe example
{
  "player": "player1",
  "moveData": {
    "row": 0,
    "col": 1
  }
}

// Chess example
{
  "player": "white",
  "moveData": {
    "from": "e2",
    "to": "e4",
    "piece": "pawn"
  }
}

// Poker example
{
  "player": "player1",
  "moveData": {
    "action": "raise",
    "amount": 100
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "gameState": { /* updated game state */ },
    "moveValid": true,
    "gameOver": false,
    "winner": null
  },
  "message": "Move processed successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid move or not player's turn
- `404 Not Found`: Game not found
- `409 Conflict`: Game already over

### GET `/api/v1/games/:gameType/:gameId/metadata`
Get game metadata including rules and configuration.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "name": "Tic Tac Toe",
    "description": "Classic 3x3 grid game",
    "rules": "Players alternate placing X and O...",
    "minPlayers": 2,
    "maxPlayers": 2,
    "estimatedDuration": 5,
    "difficulty": "beginner",
    "categories": ["strategy", "classic"],
    "controls": {
      "click": "Place symbol on grid",
      "keyboard": "Use arrow keys and Enter"
    }
  }
}
```

## Monitoring Endpoints

### GET `/api/v1/health`
Comprehensive health check with component status.

**Response (200 - Healthy):**
```json
{
  "status": "healthy",
  "checks": {
    "database": {
      "status": "pass",
      "message": "Database connection healthy",
      "responseTime": 15
    },
    "memory": {
      "status": "pass",
      "message": "Memory usage normal",
      "details": { "totalMB": 245, "heapMB": 123 }
    },
    "uptime": {
      "status": "pass",
      "message": "Service running for 12h",
      "details": { "uptimeSeconds": 43200 }
    },
    "environment": {
      "status": "pass",
      "message": "Environment configuration valid"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "2.0.0",
  "uptime": 43200
}
```

**Response (503 - Unhealthy):**
```json
{
  "status": "unhealthy",
  "checks": {
    "database": {
      "status": "fail",
      "message": "Database connection failed",
      "details": { "error": "Connection timeout" }
    }
    // ... other checks
  }
}
```

### GET `/api/v1/metrics`
Performance and resource metrics.

**Response (200):**
```json
{
  "memory": {
    "rss": 245,        // MB
    "heapUsed": 123,   // MB
    "heapTotal": 150,  // MB
    "external": 15     // MB
  },
  "uptime": {
    "seconds": 43200,
    "formatted": "12h 0m"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Rate Limiting

Rate limits are enforced per IP address:

| Endpoint Type | Limit | Window | Status Code |
|---------------|-------|---------|-------------|
| General API | 100 requests | 15 minutes | 429 |
| Authentication | 10 requests | 15 minutes | 429 |
| Game Creation | 50 requests | 1 hour | 429 |
| Game Moves | 100 requests | 1 minute | 429 |

**Rate Limit Response (429):**
```json
{
  "success": false,
  "error": "Too many requests from this IP, please try again later",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": "15 minutes"
}
```

## Error Codes

### Authentication Errors
- `AUTHENTICATION_REQUIRED`: No token provided
- `INVALID_TOKEN`: Token expired or malformed
- `INSUFFICIENT_PERMISSIONS`: Role-based access denied
- `USER_NOT_FOUND`: User account not found
- `USER_INACTIVE`: User account deactivated

### Game Errors
- `GAME_NOT_FOUND`: Game ID doesn't exist
- `GAME_TYPE_NOT_FOUND`: Unknown game type
- `INVALID_MOVE_FORMAT`: Move data format invalid
- `NOT_PLAYER_TURN`: Not current player's turn
- `GAME_ALREADY_OVER`: Game completed, no more moves allowed

### System Errors
- `VALIDATION_ERROR`: Input validation failed
- `DATABASE_ERROR`: Database operation failed
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error (check logs)

## Game-Specific APIs

### Tic-Tac-Toe
```javascript
// Create game
POST /api/v1/games/tic-tac-toe/new
{ "config": { "maxPlayers": 2 } }

// Make move
POST /api/v1/games/tic-tac-toe/:id/move
{
  "player": "player1",
  "moveData": { "row": 0, "col": 1 }
}
```

### Chess
```javascript
// Create game
POST /api/v1/games/chess/new
{ "config": { "timeLimit": 3600 } }

// Make move
POST /api/v1/games/chess/:id/move
{
  "player": "white",
  "moveData": { "from": "e2", "to": "e4" }
}
```

### Poker
```javascript
// Create game
POST /api/v1/games/poker/new
{ "config": { "maxPlayers": 6, "blinds": { "small": 10, "big": 20 } } }

// Make move
POST /api/v1/games/poker/:id/move
{
  "player": "player1",
  "moveData": { "action": "raise", "amount": 100 }
}
```

## Client Integration Examples

### JavaScript/TypeScript
```typescript
class VersusGameClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async login(username: string, password: string) {
    const response = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();
    if (result.success) {
      this.token = result.data.token;
    }
    return result;
  }

  async createGame(gameType: string, config?: any) {
    const response = await fetch(`${this.baseUrl}/api/v1/games/${gameType}/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ config })
    });

    return response.json();
  }

  async makeMove(gameType: string, gameId: string, player: string, moveData: any) {
    const response = await fetch(`${this.baseUrl}/api/v1/games/${gameType}/${gameId}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ player, moveData })
    });

    return response.json();
  }
}
```

### Python
```python
import requests

class VersusGameClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.token = None

    def login(self, username: str, password: str):
        response = requests.post(f"{self.base_url}/api/v1/auth/login", json={
            "username": username,
            "password": password
        })

        result = response.json()
        if result.get("success"):
            self.token = result["data"]["token"]
        return result

    def create_game(self, game_type: str, config: dict = None):
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.post(
            f"{self.base_url}/api/v1/games/{game_type}/new",
            json={"config": config or {}},
            headers=headers
        )
        return response.json()

    def make_move(self, game_type: str, game_id: str, player: str, move_data: dict):
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.post(
            f"{self.base_url}/api/v1/games/{game_type}/{game_id}/move",
            json={"player": player, "moveData": move_data},
            headers=headers
        )
        return response.json()
```

### cURL Examples
```bash
# Register user
curl -X POST http://localhost:6789/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:6789/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'

# Create game (with token from login response)
curl -X POST http://localhost:6789/api/v1/games/tic-tac-toe/new \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"config":{"maxPlayers":2}}'

# Make move
curl -X POST http://localhost:6789/api/v1/games/tic-tac-toe/GAME_ID/move \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"player":"player1","moveData":{"row":0,"col":0}}'

# Get game state
curl http://localhost:6789/api/v1/games/tic-tac-toe/GAME_ID/state \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Health check
curl http://localhost:6789/api/v1/health

# Metrics
curl http://localhost:6789/api/v1/metrics
```

## Supported Games

### Strategy Games
- **Chess**: Full chess implementation with move validation
- **Go**: Traditional Go with territory scoring
- **Checkers**: American checkers with king promotion
- **Othello**: Reversi with disc flipping mechanics

### Card Games
- **Poker**: Texas Hold'em with betting rounds
- **Blackjack**: Casino-style with dealer AI
- **Hearts**: Trick-taking with penalty cards
- **Spades**: Partnership bidding card game

### Classic Games
- **Tic-tac-toe**: 3x3 grid strategy
- **Connect Four**: Vertical token dropping
- **Mancala**: Ancient stone-moving game
- **Battleship**: Naval combat with hidden ships

### Tile Games
- **Mahjong**: Traditional Chinese tile game
- **Scrabble-like**: Word formation with scoring
- **Bingo**: Number matching with cards

### Modern Games
- **Catan**: Resource management and trading
- **Chinese Checkers**: Star-shaped board with jumping

## Rate Limiting Headers

Responses include rate limiting information:
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1640995200
```

## WebSocket Support (Future)

Planning real-time multiplayer support:
```javascript
// Future WebSocket API
const ws = new WebSocket('ws://localhost:6789/ws/game/GAME_ID');

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);

  switch(type) {
    case 'move':
      // Handle opponent move
      break;
    case 'gameOver':
      // Handle game completion
      break;
  }
};

// Send move
ws.send(JSON.stringify({
  type: 'move',
  data: { player: 'player1', moveData: { row: 0, col: 0 } }
}));
```

## Error Handling Best Practices

### Client-Side Error Handling
```javascript
async function makeApiCall() {
  try {
    const response = await fetch('/api/v1/games');
    const result = await response.json();

    if (!result.success) {
      // Handle API error
      console.error(`API Error: ${result.error} (${result.code})`);

      // Handle specific error types
      switch(result.code) {
        case 'AUTHENTICATION_REQUIRED':
          redirectToLogin();
          break;
        case 'RATE_LIMIT_EXCEEDED':
          showRateLimitMessage(result.retryAfter);
          break;
        default:
          showGenericError(result.error);
      }
      return;
    }

    // Handle success
    return result.data;
  } catch (error) {
    // Handle network/parsing errors
    console.error('Network error:', error);
  }
}
```

### Retry Logic
```javascript
async function apiCallWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        // Rate limited, wait and retry
        const retryAfter = response.headers.get('Retry-After') || '60';
        await sleep(parseInt(retryAfter) * 1000);
        continue;
      }

      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

This API documentation provides complete guidance for integrating with the Versus Game Server's modern, secure, and high-performance API.