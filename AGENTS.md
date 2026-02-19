# Repository Guidelines

## Project Structure

```
versus/
├── versus-server/        # Hono API server (TypeScript)
│   ├── src/
│   │   ├── games/        # Game implementations (27+ games)
│   │   ├── routes/       # API route handlers
│   │   ├── services/     # Business logic services
│   │   ├── middleware/   # Auth, validation, rate limiting
│   │   ├── core/         # Database, game manager, WebSocket
│   │   └── utils/        # Helper utilities
│   ├── tests/            # Jest test suite
│   └── docs/rules/       # Game rules documentation
├── versus-client/        # React frontend (Vite)
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API client
│   │   └── types/        # TypeScript types
├── docs/                 # MkDocs documentation
└── scripts/              # Utility scripts
```

## Build, Test, and Development Commands

```bash
# Development
make start        # Start PostgreSQL + Server + Client
make stop         # Stop all services
make logs-view    # View logs
make clean        # Remove all data

# Testing
make test         # Run test suite
cd versus-server && bun test --coverage

# Code Quality
make lint         # Run ESLint
make type-check   # TypeScript validation
make format       # Format code with Prettier

# Build
make build        # Production build

# Documentation
make docs         # Serve MkDocs at localhost:8000
```

## Coding Style

- **Language:** TypeScript (strict mode)
- **Indentation:** 2 spaces
- **Quotes:** Single quotes
- **Semicolons:** Required
- **Max line length:** 100 characters
- **File naming:** kebab-case for game files (`tic-tac-toe.ts`)
- **Variables:** camelCase
- **Components:** PascalCase (no default exports)

## Testing

- Tests in `versus-server/tests/*.test.ts`
- Run: `make test` or `bun test`
- Coverage threshold: 50%
- All tests use PostgreSQL (run via `make start` first)

## Commit Guidelines

Follow Conventional Commits:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build/tooling

Example: `feat(server): add castling support to chess`

## Ports

| Service | Port |
|---------|------|
| Client | 5555 |
| Server | 5556 |
| PostgreSQL | 5433 |

## Environment

Required in `versus-server/.env`:

```bash
DATABASE_URL=postgresql://user:pass@host:port/db
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:5555
```

## Database

PostgreSQL only. Run `make start` to start PostgreSQL in Docker.

## Security

- Never commit secrets
- Use environment variables
- JWT tokens for auth
- Zod for input validation
- Rate limiting enabled
