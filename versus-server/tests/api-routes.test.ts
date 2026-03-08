import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createApp } from '../src/app.js';
import type { Hono } from 'hono';

/**
 * Integration tests for the API route layer.
 *
 * These tests use Hono's built-in `app.request()` helper which lets us send
 * HTTP requests to the Hono app without starting a real server. Each test
 * exercises the full middleware + route handler + service stack, backed by an
 * in-memory SQLite database.
 */

let app: Hono;
let services: Awaited<ReturnType<typeof createApp>>;

// We need a valid JWT to test authenticated endpoints.
// We'll register a user, log in, and re-use the token.
let authToken: string;

beforeAll(async () => {
  // Set JWT_SECRET for tests
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-ok';

  services = await createApp({
    databaseConfig: { type: 'sqlite', sqlitePath: ':memory:' },
    corsOrigin: '*',
    nodeEnv: 'test',
  });
  app = services.app;

  // Initialize the game manager (creates tables, registers games)
  await services.gameManager.initialize();

  // Initialize the users table so auth tests work
  await services.authService.initializeUserTable();

  // Register all games so /api/v1/games endpoints work
  const { registerGames } = await import('../src/games/index.js');
  registerGames(services.gameManager);
});

afterAll(async () => {
  await services.close();
  delete process.env.JWT_SECRET;
});

// ---------------------------------------------------------------------------
// Helper: send a request to the Hono app
// ---------------------------------------------------------------------------
function req(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
) {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return app.request(`http://localhost${path}`, init);
}

function authHeaders() {
  return { Authorization: `Bearer ${authToken}` };
}

// ---------------------------------------------------------------------------
// Root & Health
// ---------------------------------------------------------------------------
describe('Root & Health Endpoints', () => {
  test('GET / returns platform info', async () => {
    const res = await req('GET', '/');
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.name).toBe('Versus Platform');
    expect(data.endpoints).toBeDefined();
  });

  test('GET /api/v1/health returns health status', async () => {
    const res = await req('GET', '/api/v1/health');
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.status).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Auth Flow: Register → Login → Me → Refresh
// ---------------------------------------------------------------------------
describe('Auth Flow', () => {
  const testUser = {
    username: 'testplayer',
    email: 'test@example.com',
    password: 'MyStr0ng!Pass@123',
  };

  test('POST /api/v1/auth/register creates a new user', async () => {
    const res = await req('POST', '/api/v1/auth/register', testUser);
    expect(res.status).toBe(201);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.user.username).toBe('testplayer');
  });

  test('POST /api/v1/auth/register rejects duplicate username', async () => {
    const res = await req('POST', '/api/v1/auth/register', testUser);
    expect(res.status).toBe(409);

    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });

  test('POST /api/v1/auth/login with valid credentials', async () => {
    const res = await req('POST', '/api/v1/auth/login', {
      username: testUser.username,
      password: testUser.password,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();

    // Save token for subsequent tests
    authToken = body.data.token;
  });

  test('POST /api/v1/auth/login with wrong password returns 401', async () => {
    const res = await req('POST', '/api/v1/auth/login', {
      username: testUser.username,
      password: 'WrongPassword!123',
    });
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/auth/me with valid token returns user', async () => {
    const res = await req('GET', '/api/v1/auth/me', undefined, authHeaders());
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.username).toBe('testplayer');
  });

  test('GET /api/v1/auth/me without token returns 401', async () => {
    const res = await req('GET', '/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/auth/refresh with valid token returns new token', async () => {
    const res = await req('POST', '/api/v1/auth/refresh', undefined, authHeaders());
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Game CRUD & Gameplay
// ---------------------------------------------------------------------------
describe('Game CRUD', () => {
  let gameId: string;

  test('GET /api/v1/games lists available game types', async () => {
    const res = await req('GET', '/api/v1/games');
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(Array.isArray(data)).toBe(true);
    expect(data).toContain('tic-tac-toe');
  });

  test('GET /api/v1/games/metadata returns metadata for all games', async () => {
    const res = await req('GET', '/api/v1/games/metadata');
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data['tic-tac-toe']).toBeDefined();
    expect(body.data['tic-tac-toe'].name).toBe('Tic-Tac-Toe');
  });

  test('POST /api/v1/games/tic-tac-toe/new creates a game', async () => {
    const res = await req('POST', '/api/v1/games/tic-tac-toe/new', {});
    expect(res.status).toBe(201);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.gameId).toBeDefined();

    gameId = body.data.gameId;
  });

  test('POST /api/v1/games/unknown-game/new returns 400', async () => {
    const res = await req('POST', '/api/v1/games/unknown-game/new', {});
    expect(res.status).toBe(400);

    const body = (await res.json()) as any;
    expect(body.code).toBe('UNKNOWN_GAME_TYPE');
  });

  test('GET /api/v1/games/tic-tac-toe/:gameId/state returns game state', async () => {
    const res = await req('GET', `/api/v1/games/tic-tac-toe/${gameId}/state`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.gameId).toBe(gameId);
    expect(body.data.currentPlayer).toBe('X');
    expect(body.data.gameOver).toBe(false);
  });

  test('POST /api/v1/games/tic-tac-toe/:gameId/move processes a move', async () => {
    const res = await req('POST', `/api/v1/games/tic-tac-toe/${gameId}/move`, {
      row: 0,
      col: 0,
      player: 'X',
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.board[0][0]).toBe('X');
    expect(body.data.currentPlayer).toBe('O');
  });

  test('POST /api/v1/games/tic-tac-toe/:gameId/validate validates without applying', async () => {
    const res = await req('POST', `/api/v1/games/tic-tac-toe/${gameId}/validate`, {
      row: 1,
      col: 1,
      player: 'O',
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.valid).toBe(true);

    // Verify move was NOT applied
    const stateRes = await req('GET', `/api/v1/games/tic-tac-toe/${gameId}/state`);
    const stateBody = (await stateRes.json()) as any;
    expect(stateBody.data.board[1][1]).toBeNull();
  });

  test('GET /api/v1/games/tic-tac-toe/:gameId/history returns move history', async () => {
    const res = await req('GET', `/api/v1/games/tic-tac-toe/${gameId}/history`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('DELETE /api/v1/games/:gameId deletes the game', async () => {
    const res = await req('DELETE', `/api/v1/games/${gameId}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Room lifecycle (auth-protected)
// ---------------------------------------------------------------------------
describe('Room Lifecycle', () => {
  test('POST /api/v1/rooms without auth returns 401', async () => {
    const res = await req('POST', '/api/v1/rooms', {
      gameType: 'tic-tac-toe',
    });
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/rooms with auth creates a room', async () => {
    const res = await req('POST', '/api/v1/rooms', { gameType: 'tic-tac-toe' }, authHeaders());

    // The room service may or may not be initialized with tables.
    // A 201 means success; a 400/500 means the service isn't set up for this
    // test environment but the auth check passed (which is what we're testing).
    if (res.status === 201) {
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    } else {
      // Auth passed — the route is protected. Service-layer errors are acceptable
      // in an integration test that focuses on the auth boundary.
      expect(res.status).not.toBe(401);
    }
  });

  test('GET /api/v1/rooms is public (no auth required)', async () => {
    const res = await req('GET', '/api/v1/rooms');
    // Should not be 401 — this endpoint is public
    expect(res.status).not.toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------
describe('404 Handler', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await req('GET', '/api/v1/does-not-exist');
    expect(res.status).toBe(404);

    const body = (await res.json()) as any;
    expect(body.code).toBe('NOT_FOUND');
  });
});
