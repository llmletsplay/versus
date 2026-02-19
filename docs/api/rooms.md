# Rooms API

Create and manage multiplayer game rooms with real-time updates.

## Endpoints

### List Rooms

Get all available rooms.

```
GET /api/v1/rooms
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `gameType` | string | Filter by game type |
| `status` | string | Filter by status (`waiting`, `active`) |
| `limit` | number | Results per page (default: 20) |
| `offset` | number | Pagination offset |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "room-abc123",
      "name": "Quick Chess Match",
      "gameType": "chess",
      "hostId": "user-1",
      "players": ["user-1"],
      "maxPlayers": 2,
      "status": "waiting",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Create Room

Create a new game room.

```
POST /api/v1/rooms
```

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "name": "My Game Room",
  "gameType": "chess",
  "maxPlayers": 2,
  "config": {
    "timeLimit": 600,
    "rated": true
  }
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "roomId": "room-abc123",
    "wsUrl": "ws://localhost:5556/ws/room/room-abc123"
  },
  "message": "Room created successfully"
}
```

### Get Room

Get room details.

```
GET /api/v1/rooms/:roomId
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "room-abc123",
    "name": "My Game Room",
    "gameType": "chess",
    "hostId": "user-1",
    "players": [
      {
        "id": "user-1",
        "username": "player1",
        "joinedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "maxPlayers": 2,
    "status": "waiting",
    "config": {
      "timeLimit": 600,
      "rated": true
    },
    "gameId": null,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Join Room

Join an existing room.

```
POST /api/v1/rooms/:roomId/join
```

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "wsUrl": "ws://localhost:5556/ws/room/room-abc123"
  },
  "message": "Joined room successfully"
}
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `ROOM_FULL` | Room is at capacity |
| 400 | `ALREADY_JOINED` | Already in the room |
| 404 | `ROOM_NOT_FOUND` | Room doesn't exist |

### Leave Room

Leave a room.

```
POST /api/v1/rooms/:roomId/leave
```

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "message": "Left room successfully"
}
```

### Start Game

Start the game when room is ready.

```
POST /api/v1/rooms/:roomId/start
```

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "gameId": "chess-xyz789"
  },
  "message": "Game started"
}
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `NOT_HOST` | Only host can start |
| 400 | `NOT_ENOUGH_PLAYERS` | Need more players |
| 400 | `ALREADY_STARTED` | Game already in progress |

### Delete Room

Delete a room (host only).

```
DELETE /api/v1/rooms/:roomId
```

**Response (200):**

```json
{
  "success": true,
  "message": "Room deleted successfully"
}
```

## WebSocket Events

Connect to room WebSocket for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:5556/ws/room/room-abc123');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-jwt-token'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'player_joined':
      console.log(`${message.username} joined`);
      break;
    case 'player_left':
      console.log(`${message.username} left`);
      break;
    case 'game_started':
      console.log('Game started:', message.gameId);
      break;
    case 'move':
      updateBoard(message.moveData);
      break;
    case 'game_over':
      showResult(message.winner);
      break;
  }
};
```

### Event Types

| Event | Direction | Description |
|-------|-----------|-------------|
| `auth` | Client → Server | Authenticate WebSocket |
| `player_joined` | Server → Client | New player joined |
| `player_left` | Server → Client | Player left |
| `game_started` | Server → Client | Game began |
| `move` | Bidirectional | Game move |
| `game_over` | Server → Client | Game ended |
| `chat` | Bidirectional | Chat message |

### Making Moves via WebSocket

```javascript
ws.send(JSON.stringify({
  type: 'move',
  gameId: 'chess-xyz789',
  moveData: {
    from: 'e2',
    to: 'e4'
  }
}));
```

### Sending Chat Messages

```javascript
ws.send(JSON.stringify({
  type: 'chat',
  message: 'Good game!'
}));
```

## Room Status

| Status | Description |
|--------|-------------|
| `waiting` | Waiting for players |
| `ready` | Full, can start |
| `active` | Game in progress |
| `completed` | Game finished |

## Examples

### Complete Room Flow

```javascript
// 1. Create room
const createRes = await fetch('/api/v1/rooms', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: 'Chess Match',
    gameType: 'chess',
    maxPlayers: 2
  })
});
const { data: { roomId, wsUrl } } = await createRes.json();

// 2. Connect WebSocket
const ws = new WebSocket(wsUrl);
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'auth', token }));
};

// 3. Wait for opponent and start
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'player_joined' && players.length === 2) {
    // Start game
    fetch(`/api/v1/rooms/${roomId}/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  }
};

// 4. Make moves via WebSocket
function makeMove(from, to) {
  ws.send(JSON.stringify({
    type: 'move',
    moveData: { from, to }
  }));
}
```

## Next Steps

- [Games API](games.md) - Game details
- [Wagering API](wagering.md) - Add stakes to rooms
