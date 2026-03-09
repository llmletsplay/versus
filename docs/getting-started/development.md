# Development Workflow

## Daily Commands

```bash
make start      # Start all services
make stop       # Stop all services
make logs-view  # View live logs
make clean      # Clean all data
```

## Development Mode

### Start Both Server And Client

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

```bash
npm --prefix versus-server run lint
npm --prefix versus-server run type-check
npm --prefix versus-client run build
```

## Package Release Gate

```bash
npm run build:packages
npm run check:packages
npm run test:games
```

## Git Workflow

1. Branch from `dev`.
2. Open pull requests into `dev`.
3. Merge `dev` into `main` when the batch is ready.
4. Publish packages from `main` only when the package surface changed.

## Repo Boundaries

- keep reusable engine work in this repo
- keep the real betting and intents product app in `versus-platform`
- use the published npm packages in the product app instead of sharing local package paths

## Next Steps

- [Architecture](../architecture/overview.md)
- [Maintenance Flow](../contributing/maintenance.md)
- [Platform Repo Split](../contributing/platform-repo.md)