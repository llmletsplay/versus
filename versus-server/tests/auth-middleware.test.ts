import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { requireAuth, optionalAuth, getAuthUserId, requireRole } from '../src/middleware/auth.js';

/**
 * Unit tests for the Hono JWT auth middleware.
 *
 * These tests ensure that:
 * - requireAuth rejects missing / invalid / expired tokens
 * - requireAuth correctly sets jwtPayload on the context
 * - optionalAuth is permissive but attaches payload when valid
 * - requireRole enforces role-based access control
 * - getAuthUserId extracts the userId from verified JWT
 */

const TEST_SECRET = 'test-jwt-secret-that-is-long-enough-for-validation-purposes';

function makeToken(payload: Record<string, unknown> = {}, opts: jwt.SignOptions = {}) {
  return jwt.sign({ userId: 'u-123', username: 'alice', role: 'player', ...payload }, TEST_SECRET, {
    expiresIn: '1h',
    ...opts,
  });
}

function makeExpiredToken() {
  return jwt.sign(
    { userId: 'u-123', username: 'alice', role: 'player' },
    TEST_SECRET,
    { expiresIn: '-1s' } // already expired
  );
}

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------
describe('requireAuth middleware', () => {
  function buildApp() {
    const app = new Hono();
    app.use('*', requireAuth);
    app.get('/protected', (c) => {
      const payload = c.get('jwtPayload') as any;
      return c.json({ userId: payload.userId, username: payload.username });
    });
    return app;
  }

  test('rejects request without Authorization header', async () => {
    const app = buildApp();
    const res = await app.request('/protected');
    expect(res.status).toBe(401);

    const body = (await res.json()) as any;
    expect(body.code).toBe('NO_TOKEN');
  });

  test('rejects request with malformed Authorization header', async () => {
    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Basic foobar' },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.code).toBe('NO_TOKEN');
  });

  test('rejects expired token', async () => {
    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.code).toBe('INVALID_TOKEN');
  });

  test('rejects token signed with wrong secret', async () => {
    const badToken = jwt.sign({ userId: 'u-999' }, 'wrong-secret-key-value', {
      expiresIn: '1h',
    });

    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${badToken}` },
    });
    expect(res.status).toBe(401);
  });

  test('passes valid token and sets jwtPayload', async () => {
    const app = buildApp();
    const token = makeToken();
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.userId).toBe('u-123');
    expect(body.username).toBe('alice');
  });
});

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------
describe('optionalAuth middleware', () => {
  function buildApp() {
    const app = new Hono();
    app.use('*', optionalAuth);
    app.get('/public', (c) => {
      const payload = c.get('jwtPayload') as any;
      return c.json({ authenticated: !!payload, userId: payload?.userId ?? null });
    });
    return app;
  }

  test('allows request without token', async () => {
    const app = buildApp();
    const res = await app.request('/public');
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.authenticated).toBe(false);
  });

  test('attaches payload when valid token provided', async () => {
    const app = buildApp();
    const res = await app.request('/public', {
      headers: { Authorization: `Bearer ${makeToken()}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.authenticated).toBe(true);
    expect(body.userId).toBe('u-123');
  });

  test('ignores invalid token silently', async () => {
    const app = buildApp();
    const res = await app.request('/public', {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.authenticated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------
describe('requireRole middleware', () => {
  function buildApp(role: 'admin' | 'player' | 'agent') {
    const app = new Hono();
    app.use('*', requireAuth);
    app.get('/admin-only', requireRole(role), (c) => {
      return c.json({ ok: true });
    });
    return app;
  }

  test('allows matching role', async () => {
    const app = buildApp('player');
    const token = makeToken({ role: 'player' });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  test('allows admin for any required role', async () => {
    const app = buildApp('player');
    const token = makeToken({ role: 'admin' });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  test('rejects mismatched role', async () => {
    const app = buildApp('admin');
    const token = makeToken({ role: 'player' });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);

    const body = (await res.json()) as any;
    expect(body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });
});

// ---------------------------------------------------------------------------
// getAuthUserId helper
// ---------------------------------------------------------------------------
describe('getAuthUserId helper', () => {
  test('returns userId from context', async () => {
    const app = new Hono();
    app.use('*', requireAuth);
    app.get('/me', (c) => {
      const userId = getAuthUserId(c);
      return c.json({ userId });
    });

    const token = makeToken({ userId: 'u-abc-def' });
    const res = await app.request('/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.userId).toBe('u-abc-def');
  });

  test('throws when no JWT payload is present', async () => {
    // Simulate calling getAuthUserId without requireAuth middleware
    const app = new Hono();
    app.get('/me', (c) => {
      try {
        getAuthUserId(c);
        return c.json({ error: 'should have thrown' }, 500);
      } catch (e: any) {
        return c.json({ error: e.message }, 401);
      }
    });

    const res = await app.request('/me');
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toBe('UNAUTHORIZED');
  });
});
