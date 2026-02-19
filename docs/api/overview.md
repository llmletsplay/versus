# API Overview

Versus provides a RESTful API for game management, authentication, and real-time multiplayer features.

## Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:5556` |
| Production | `https://api.yourdomain.com` |

## Authentication

All authenticated endpoints require a JWT token:

```
Authorization: Bearer <your-jwt-token>
```

## Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/metrics` | GET | System metrics |
| `/api/v1/auth/register` | POST | Register user |
| `/api/v1/auth/login` | POST | Login user |
| `/api/v1/games` | GET | List games |
| `/api/v1/games/:type/new` | POST | Create game |
| `/api/v1/games/:type/:id/state` | GET | Get state |
| `/api/v1/games/:type/:id/move` | POST | Make move |
| `/api/v1/rooms` | GET | List rooms |
| `/api/v1/rooms` | POST | Create room |

## Rate Limiting

| Type | Limit | Window |
|------|-------|--------|
| General API | 100 req | 15 min |
| Authentication | 10 req | 15 min |
| Game Moves | 100 req | 1 min |

Rate limit headers:

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1640995200
```

## Error Codes

### Authentication Errors

| Code | Description |
|------|-------------|
| `AUTHENTICATION_REQUIRED` | No token provided |
| `INVALID_TOKEN` | Token expired or invalid |
| `INSUFFICIENT_PERMISSIONS` | Role-based access denied |

### Game Errors

| Code | Description |
|------|-------------|
| `GAME_NOT_FOUND` | Game ID doesn't exist |
| `GAME_TYPE_NOT_FOUND` | Unknown game type |
| `INVALID_MOVE` | Move validation failed |
| `NOT_PLAYER_TURN` | Not current player's turn |
| `GAME_ALREADY_OVER` | Game completed |

### System Errors

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Input validation failed |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_ERROR` | Server error |

## Pagination

List endpoints support pagination:

```
GET /api/v1/games?limit=20&offset=0
```

Response includes pagination metadata:

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

## Content Types

All API endpoints accept and return JSON:

```
Content-Type: application/json
Accept: application/json
```

## Versioning

The API is versioned in the URL path:

```
/api/v1/...
```

Breaking changes will introduce new versions while maintaining backward compatibility.

## CORS

Development allows all origins. Production restricts to configured domain:

```
Access-Control-Allow-Origin: https://yourdomain.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## Examples

### Register User

```bash
curl -X POST http://localhost:5556/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "player1",
    "email": "player1@example.com",
    "password": "securepassword123"
  }'
```

### Login

```bash
curl -X POST http://localhost:5556/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "player1",
    "password": "securepassword123"
  }'
```

### Create Game

```bash
curl -X POST http://localhost:5556/api/v1/games/tic-tac-toe/new \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Make Move

```bash
curl -X POST http://localhost:5556/api/v1/games/tic-tac-toe/GAME_ID/move \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "player": "player1",
    "moveData": { "row": 0, "col": 0 }
  }'
```

## Client Libraries

### JavaScript/TypeScript

```typescript
class VersusClient {
  private baseUrl: string;
  private token?: string;
  
  async login(username: string, password: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    this.token = data.data.token;
    return data;
  }
  
  async createGame(gameType: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/games/${gameType}/new`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    });
    return res.json();
  }
}
```

### Python

```python
import requests

class VersusClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.token = None
    
    def login(self, username: str, password: str):
        res = requests.post(f"{self.base_url}/api/v1/auth/login", json={
            "username": username,
            "password": password
        })
        data = res.json()
        self.token = data["data"]["token"]
        return data
    
    def create_game(self, game_type: str):
        return requests.post(
            f"{self.base_url}/api/v1/games/{game_type}/new",
            headers={"Authorization": f"Bearer {self.token}"}
        ).json()
```

## Next Steps

- [Authentication](authentication.md) - Auth flows in detail
- [Games API](games.md) - Game-specific endpoints
- [Rooms API](rooms.md) - Multiplayer rooms
