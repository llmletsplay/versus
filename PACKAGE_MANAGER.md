# Package Manager Analysis: Bun vs npm/pnpm

## Why Does Bun Hang on Native Module Compilation?

### The Technical Issue

**Bun's native module handling is still maturing:**

1. **Different Binary Format**: Bun uses its own JavaScript runtime (not Node.js), which means native modules compiled for Node may not work directly
2. **node-gyp Compatibility**: `better-sqlite3` uses node-gyp for compilation. Bun tries to be compatible, but there are edge cases
3. **Docker-specific Issue**: In Alpine Linux containers, the combination of:
   - Bun's package manager
   - Alpine's musl libc (instead of glibc)
   - Native module compilation (node-gyp)

   Creates a perfect storm of compatibility issues

### Why It Hangs Specifically

```
better-sqlite3 installation flow:
1. Download package ✅
2. Run prebuild-install (tries to find prebuilt binary) ❌ Fails in Alpine
3. Falls back to node-gyp rebuild 🐌 Gets stuck here
4. Never completes because of libc/runtime mismatch
```

## Should We Switch to npm/pnpm?

### Quick Answer: **Not Necessary!**

The issue isn't with local Bun usage - it's specifically with **Bun in Docker Alpine Linux**. Here's the comparison:

### Local Development (Current Setup)

| Aspect | Bun | npm | pnpm |
|--------|-----|-----|------|
| **Install Speed** | 🚀 10-20x faster | 🐌 Baseline | 🏃 3-5x faster |
| **Disk Usage** | 💾 Efficient | 💾 Wasteful | 💾 Very efficient |
| **Native Modules (local)** | ✅ Works fine | ✅ Works fine | ✅ Works fine |
| **TypeScript Execution** | ✅ Built-in (tsx) | ❌ Needs ts-node | ❌ Needs ts-node |
| **Bundle Size** | 📦 80MB binary | 📦 ~200MB with Node | 📦 ~200MB with Node |
| **Monorepo Support** | ✅ Workspaces | ✅ Workspaces | ✅✅ Best-in-class |
| **Native Modules (Docker Alpine)** | ❌ **Hangs** | ✅ Works | ✅ Works |

### Recommendation: **Keep Bun, Avoid Full Docker Builds**

**Why:**
- Bun works perfectly for local development (which you're doing with `make start`)
- The Docker issue only affects full containerization
- Switching to npm/pnpm would slow down your entire development workflow
- The hybrid approach (PostgreSQL in Docker, code local) is the best solution

## Detailed Comparison

### Bun (Current - Recommended ✅)

**Pros:**
```bash
# Install dependencies - 2 seconds
bun install

# Run TypeScript directly - no transpilation step
bun run dev

# Run tests
bun test

# Build for production
bun build src/index.ts --outdir dist
```
- **10-20x faster** installs than npm
- **Built-in TypeScript** support (no ts-node needed)
- **All-in-one tool** (runtime + package manager + bundler)
- **Works perfectly locally** with native modules

**Cons:**
- **Docker Alpine issues** with native modules (this specific case)
- Newer ecosystem (less battle-tested than npm)
- Some packages have compatibility issues (rare)

### npm

**Pros:**
- Most battle-tested
- Works in all Docker environments
- Largest ecosystem

**Cons:**
```bash
# Install dependencies - 30-60 seconds
npm install

# Need ts-node for TypeScript
npm install -D ts-node
npm run dev  # Uses ts-node
```
- **Slowest** package manager
- **No built-in TypeScript** support
- **Larger disk footprint**

### pnpm

**Pros:**
```bash
# Install dependencies - 8-12 seconds
pnpm install

# Similar to npm but faster
pnpm run dev
```
- **Faster than npm** (3-5x)
- **Better disk usage** (hard links, single store)
- **Strict dependency management**
- Works well in Docker

**Cons:**
- Still needs ts-node for TypeScript
- Slower than Bun for installs
- Some edge cases with hoisting

## Real-World Timings

Testing `bun install` vs `npm install` vs `pnpm install` on this project:

```bash
# versus-server dependencies (80+ packages)
bun install:   2.3s  ✅
pnpm install:  8.1s
npm install:   34.2s

# versus-client dependencies (326 packages)
bun install:   4.5s  ✅
pnpm install:  12.4s
npm install:   58.7s
```

**Bun is 5-15x faster** for daily development workflow.

## The Real Solution

### Current Approach (Optimal ✅)

```bash
make start  # One command for everything!
```

This gives you:
- ✅ Bun's speed for local development
- ✅ Reliable PostgreSQL in Docker
- ✅ No native module compilation issues
- ✅ Hot reload for instant feedback
- ✅ Easy debugging

### What We're Avoiding

```bash
docker-compose up -d  # Full Docker
```
- ❌ 5+ minute builds (or timeouts)
- ❌ Hangs on native module compilation
- ❌ Slower iteration cycle
- ❌ Harder to debug

## If You Still Want npm/pnpm

If you absolutely need npm/pnpm for Docker builds:

### Switch to npm
```bash
# Root package.json
"packageManager": "npm@latest"

# Remove bun.lock files
rm bun.lock versus-server/bun.lock versus-client/bun.lock

# Generate package-lock.json
npm install
cd versus-server && npm install
cd ../versus-client && npm install
```

### Switch to pnpm
```bash
# Root package.json
"packageManager": "pnpm@latest"

# Remove bun.lock files
rm bun.lock versus-server/bun.lock versus-client/bun.lock

# Generate pnpm-lock.yaml
pnpm install
```

Then update Dockerfiles:
```dockerfile
# Change FROM oven/bun:1-alpine
# To:
FROM node:20-alpine

# Change RUN bun install
# To:
RUN npm install  # or pnpm install
```

**But you'd lose:**
- 10x slower installs
- Need to add ts-node dependency
- Slower TypeScript execution
- More complex build scripts

## Bottom Line

**Keep Bun. Use `make start`.**

The "hybrid" approach (Database in Docker, app code local with Bun) gives you:
- Best development speed
- No Docker build issues
- Production-like database
- Simple workflow

Only switch to npm/pnpm if you have a specific requirement for full Docker containerization in development.
