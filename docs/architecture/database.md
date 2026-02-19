# Database Schema

Versus uses a unified database abstraction supporting SQLite (development) and PostgreSQL (production).

## Database Provider

```typescript
interface DatabaseProvider {
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // Game state
  saveGameState(data: GameStateData): Promise<void>;
  getGameState(gameId: string): Promise<GameStateData | null>;
  getGamesByPlayer(playerId: string): Promise<GameStateData[]>;
  
  // Users
  createUser(user: UserData): Promise<UserData>;
  getUserById(id: string): Promise<UserData | null>;
  getUserByUsername(username: string): Promise<UserData | null>;
  updateUser(id: string, updates: Partial<UserData>): Promise<UserData>;
}
```

## Schema

### Users Table

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'player',
  is_active BOOLEAN DEFAULT true,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
```

### Game States Table

```sql
CREATE TABLE game_states (
  game_id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  game_state TEXT NOT NULL,      -- JSON
  move_history TEXT NOT NULL,    -- JSON array
  players TEXT NOT NULL,         -- JSON array
  status TEXT NOT NULL,          -- 'active', 'completed', 'abandoned'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_game_states_type ON game_states(game_type);
CREATE INDEX idx_game_states_status ON game_states(status);
CREATE INDEX idx_game_states_updated ON game_states(updated_at);
```

### Game Stats Table

```sql
CREATE TABLE game_stats (
  game_id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  players TEXT NOT NULL,
  winner TEXT,
  total_moves INTEGER DEFAULT 0,
  status TEXT NOT NULL
);
```

### Activity Log Table

```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  action TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  players TEXT
);

CREATE INDEX idx_activity_game ON activity_log(game_id);
CREATE INDEX idx_activity_timestamp ON activity_log(timestamp);
```

### Rooms Table

```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  host_id TEXT NOT NULL,
  players TEXT NOT NULL,
  max_players INTEGER NOT NULL,
  status TEXT NOT NULL,
  config TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Ratings Table

```sql
CREATE TABLE ratings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  rating INTEGER DEFAULT 1200,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, game_type)
);

CREATE INDEX idx_ratings_game ON ratings(game_type);
CREATE INDEX idx_ratings_user ON ratings(user_id);
```

### Wagers Table

```sql
CREATE TABLE wagers (
  id TEXT PRIMARY KEY,
  game_id TEXT,
  room_id TEXT,
  amount TEXT NOT NULL,
  token_address TEXT NOT NULL,
  status TEXT NOT NULL,
  escrow_address TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Tournaments Table

```sql
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  status TEXT NOT NULL,
  bracket TEXT,
  participants TEXT NOT NULL,
  start_time INTEGER,
  end_time INTEGER,
  created_at INTEGER NOT NULL
);
```

## SQLite Configuration

Development SQLite uses WAL mode for better concurrency:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA busy_timeout = 5000;
```

## PostgreSQL Configuration

Production PostgreSQL should be configured with:

```sql
-- Connection pooling
max_connections = 100

-- Performance
shared_buffers = 256MB
effective_cache_size = 1GB
```

## Prepared Statements

All queries use prepared statements to prevent SQL injection:

```typescript
// Example prepared statement
const stmt = db.prepare(`
  SELECT * FROM game_states 
  WHERE game_type = ? AND status = ?
`);
const results = stmt.all(gameType, status);
```

## Query Examples

### Get Active Games

```sql
SELECT game_id, game_type, players 
FROM game_states 
WHERE status = 'active'
ORDER BY updated_at DESC
LIMIT 20;
```

### Get Player Statistics

```sql
SELECT game_type, rating, wins, losses, draws
FROM ratings
WHERE user_id = ?
ORDER BY rating DESC;
```

### Get Recent Activity

```sql
SELECT game_type, action, timestamp
FROM activity_log
ORDER BY timestamp DESC
LIMIT 50;
```

## Migrations

Database tables are created automatically on startup. For schema changes:

1. Add migration logic to `DatabaseProvider.initialize()`
2. Test with fresh database
3. Update tests

## Backup

### SQLite Backup

```bash
# Simple file copy
cp game_data/versus.db backups/versus_$(date +%Y%m%d).db
```

### PostgreSQL Backup

```bash
# Full backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

## Performance Tips

### Indexes

Key indexes are created automatically:
- `game_states(game_type)` - Filter by game type
- `game_states(status)` - Filter by status
- `game_states(updated_at)` - Recent games
- `users(username)` - Login lookups

### Query Optimization

- Use `LIMIT` for pagination
- Filter by indexed columns first
- Avoid `SELECT *` for large tables

## Next Steps

- [API Overview](../api/overview.md) - Use the database via API
- [Deployment](../deployment/docker.md) - Production database setup
