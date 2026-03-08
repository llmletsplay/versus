# Development Workflow

## Daily Commands

```bash
make start      # Start all services
make stop       # Stop all services
make logs-view  # View live logs
make clean      # Clean all data
```

## Development Mode

### Start Both Server and Client

```bash
bun run dev
```

### Server Only

```bash
cd versus-server
bun run dev
```

### Client Only

```bash
cd versus-client
bun run dev
```

## Code Quality

### Linting

```bash
cd versus-server
bun run lint        # Check for issues
bun run lint:fix    # Auto-fix issues
```

### Type Checking

```bash
cd versus-server
bun run type-check
```

### Formatting

```bash
cd versus-server
bun run format        # Format all files
bun run format:check  # Check formatting
```

## Testing

### Run All Tests

```bash
cd versus-server
bun run test
```

### Run Specific Test

```bash
bun run test -- tic-tac-toe
bun run test -- chess.test.ts
```

### Test with Coverage

```bash
bun run test -- --coverage
```

### Watch Mode

```bash
bun run test:watch
```

## Build for Production

```bash
# Build everything
bun run build

# Server only
cd versus-server && bun run build

# Client only
cd versus-client && bun run build
```

## Database Operations

### Connect to PostgreSQL

```bash
docker exec -it versus-postgres psql -U versus_user -d versus_db
```

### Useful Queries

```sql
-- List all tables
\dt

-- View active games
SELECT game_id, game_type, status FROM game_states WHERE status = 'active';

-- View users
SELECT id, username, email, role FROM users;
```

### Reset Database

```bash
make clean
make start
```

## Debugging

### Enable Debug Logging

```bash
LOG_LEVEL=debug bun run dev
```

### Inspect Server

```bash
bun --inspect versus-server/src/server/node.ts
```

### Check Health

```bash
curl http://localhost:5556/api/v1/health | jq
curl http://localhost:5556/api/v1/metrics | jq
```

## Hot Reload

Both server and client support hot reload:

- **Server**: Changes to `src/**` restart automatically
- **Client**: Vite HMR for instant updates

## Project Structure

```
versus/
├── versus-server/
│   ├── src/
│   │   ├── app.ts           # Hono application
│   │   ├── server/          # Platform adapters
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── games/           # Game implementations
│   │   ├── middleware/      # Auth, validation, rate limiting
│   │   ├── core/            # Database, game manager
│   │   └── utils/           # Helpers
│   ├── tests/               # Test files
│   └── package.json
├── versus-client/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API client
│   │   └── types/           # TypeScript types
│   └── package.json
├── docs/                    # Documentation
├── logs/                    # Log files
└── Makefile                 # Commands
```

## Git Workflow

### Create Feature Branch

```bash
git checkout -b feature/my-feature
```

### Commit Changes

```bash
git add .
git commit -m "feat: add new game"
```

Follow [Conventional Commits](https://conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Test changes

### Run Pre-commit Checks

Pre-commit hooks run automatically:
1. ESLint with auto-fix
2. Prettier formatting
3. TypeScript type checking

## Performance Tips

### Faster Builds

```bash
# Use Bun for all operations
bun install    # vs npm install
bun run test   # vs npm test
```

### Memory Management

```bash
# Check memory usage
curl http://localhost:5556/api/v1/metrics
```

### Database Indexing

The database automatically creates indexes for:
- `game_states.game_type`
- `game_states.status`
- `game_states.updated_at`

## Common Issues

### Port Already in Use

```bash
# Find process
lsof -i :5556

# Kill process
kill -9 <PID>
```

### Module Not Found

```bash
bun install
```

### Type Errors

```bash
bun run type-check
```

## Next Steps

- [Architecture](../architecture/overview.md) - Understand the system
- [API Reference](../api/overview.md) - Learn the API
- [Contributing](../contributing/guidelines.md) - Contribute to the project
