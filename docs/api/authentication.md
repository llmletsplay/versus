# Authentication API

Versus uses JWT-based authentication with bcrypt password hashing.

## Endpoints

### Register User

Create a new user account.

```
POST /api/v1/auth/register
```

**Request Body:**

```json
{
  "username": "string",   // 3-20 chars, alphanumeric + underscore
  "email": "string",      // Valid email format
  "password": "string"    // Minimum 6 characters
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
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  },
  "message": "User registered successfully"
}
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 409 | `USER_EXISTS` | Username or email taken |

### Login

Authenticate and receive JWT token.

```
POST /api/v1/auth/login
```

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
      "role": "player"
    }
  },
  "message": "Login successful"
}
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `INVALID_CREDENTIALS` | Wrong username or password |

### Get Current User

Get authenticated user profile.

```
GET /api/v1/auth/me
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
    "id": "uuid",
    "username": "string",
    "email": "string",
    "role": "player",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Refresh Token

Extend session with new token.

```
POST /api/v1/auth/refresh
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
    "token": "new-jwt-token",
    "user": { ... }
  },
  "message": "Token refreshed successfully"
}
```

## JWT Token

### Token Structure

```
Header.Payload.Signature
```

### Payload Claims

```json
{
  "sub": "user-uuid",
  "username": "player1",
  "role": "player",
  "iat": 1640995200,
  "exp": 1641081600
}
```

### Token Expiration

- Default: 24 hours
- Configurable via `JWT_EXPIRES_IN` environment variable

## User Roles

| Role | Permissions |
|------|-------------|
| `player` | Play games, view stats |
| `admin` | All player permissions + user management |

## Rate Limiting

Authentication endpoints have stricter rate limits:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/register` | 10 req | 15 min |
| `/auth/login` | 10 req | 15 min |

## Security

### Password Hashing

- Algorithm: bcrypt
- Rounds: 12

### Token Security

- Tokens are signed with `JWT_SECRET`
- Never share tokens via URL parameters
- Store tokens securely (httpOnly cookies recommended for web)

### Best Practices

1. Use HTTPS in production
2. Generate strong JWT secrets (32+ characters)
3. Rotate secrets periodically
4. Implement token refresh for long sessions

## Examples

### Complete Login Flow

```javascript
// 1. Register
const registerRes = await fetch('/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'player1',
    email: 'player1@example.com',
    password: 'securepassword123'
  })
});

const { data: { token } } = await registerRes.json();

// 2. Store token (localStorage for SPA)
localStorage.setItem('token', token);

// 3. Use token for authenticated requests
const profileRes = await fetch('/api/v1/auth/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Token Refresh

```javascript
// Before token expires
setInterval(async () => {
  const res = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${currentToken}` }
  });
  const { data: { token: newToken } } = await res.json();
  localStorage.setItem('token', newToken);
}, 23 * 60 * 60 * 1000); // Refresh every 23 hours
```

## Error Handling

```javascript
try {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await res.json();
  
  if (!data.success) {
    switch (data.code) {
      case 'INVALID_CREDENTIALS':
        showError('Invalid username or password');
        break;
      case 'RATE_LIMIT_EXCEEDED':
        showError('Too many attempts. Try again later.');
        break;
      default:
        showError(data.error);
    }
    return;
  }
  
  // Success - store token
  localStorage.setItem('token', data.data.token);
} catch (error) {
  showError('Network error. Please try again.');
}
```

## Next Steps

- [Games API](games.md) - Start playing
- [Rooms API](rooms.md) - Multiplayer
