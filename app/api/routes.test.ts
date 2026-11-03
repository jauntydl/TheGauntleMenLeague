import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reset as resetLimit, LIMIT } from '@/lib/ratelimit';
import { GET as leaderboard } from './leaderboard/route';
import { GET as meta } from './meta/route';
import { GET as unresolved } from './unresolved/route';
import { getMeta } from '@/lib/data';
import { REFRESH_ATTEMPTS } from '@/lib/refresh';

describe('GET /api/leaderboard', () => {
  it('defaults to the current season', async () => {
    const res = await leaderboard(new Request('http://x/api/leaderboard'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.season).toBe(getMeta().currentSeason);
    expect(Array.isArray(body.ranked)).toBe(true);
    expect(Array.isArray(body.provisional)).toBe(true);
  });

  it('accepts an explicit season', async () => {
    const current = getMeta().currentSeason;
    const res = await leaderboard(new Request(`http://x/api/leaderboard?season=${current}`));
    expect((await res.json()).season).toBe(current);
  });

  it('accepts the numeric form the spec documents (?season=4)', async () => {
    const current = getMeta().currentSeason;
    const numeric = current.replace(/^Season/, '');
    const res = await leaderboard(new Request(`http://x/api/leaderboard?season=${numeric}`));
    expect(res.status).toBe(200);
    expect((await res.json()).season).toBe(current);
  });

  it('404s an unknown season instead of returning an empty board', async () => {
    const res = await leaderboard(new Request('http://x/api/leaderboard?season=Season99'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });
});

describe('GET /api/meta', () => {
  it('returns season metadata', async () => {
    const body = await (await meta()).json();
    expect(body.currentSeason).toMatch(/^Season\d+$/);
    expect(Array.isArray(body.seasons)).toBe(true);
  });
});

describe('GET /api/unresolved', () => {
  it('returns a list', async () => {
    expect(Array.isArray(await (await unresolved()).json())).toBe(true);
  });
});

describe('POST /api/join', () => {
  const post = async (body: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import('./join/route');
    return POST(
      new Request('http://x/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  };

  beforeEach(() => {
    resetLimit();
    vi.unstubAllEnvs();
  });

  it('refuses signups when the deployment has no GitHub token', async () => {
    // Nothing else may run first: without a token there is nowhere to write,
    // so the honest answer is "not configured", not a failed commit.
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GITHUB_REPO', '');
    const res = await post({ eaId: 'Somebody' });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.reason).toBe('unconfigured');
    // Names the missing variable: "not configured" alone leaves whoever set
    // the deployment up with three things to re-check and no way to tell which.
    expect(body.message).toContain('GITHUB_TOKEN');
    expect(body.message).toContain('GITHUB_REPO');
  });

  it('rejects a malformed EA ID before it reaches the network', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubEnv('GITHUB_REPO', 'o/r');
    const res = await post({ eaId: 'no' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('invalid');
  });

  it('rejects a body that is not JSON', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubEnv('GITHUB_REPO', 'o/r');
    const res = await post('not json at all');
    expect(res.status).toBe(400);
  });

  it('rate-limits a single caller and says when to come back', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubEnv('GITHUB_REPO', 'o/r');
    const ip = { 'x-forwarded-for': '9.9.9.9' };
    for (let i = 0; i < LIMIT; i++) await post({ eaId: 'bad' }, ip);
    const res = await post({ eaId: 'bad' }, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('POST /api/refresh', () => {
  const PW = 'test-only-password';
  const post = async (body: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import('./refresh/route');
    return POST(
      new Request('http://x/api/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    );
  };

  /** A fake GitHub whose last refresh run started `lastRunAgoMs` ago. */
  const stubGithub = (lastRunAgoMs: number, status = 'completed') => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET' });
      if (url.includes('/dispatches')) return new Response(null, { status: 204 });
      const created = new Date(Date.now() - lastRunAgoMs).toISOString();
      return Response.json({ workflow_runs: [{ created_at: created, status }] });
    });
    return calls;
  };

  beforeEach(() => {
    resetLimit();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubEnv('GITHUB_REPO', 'o/r');
    vi.stubEnv('REFRESH_PASSWORD', PW);
  });

  it('refuses a wrong password without touching GitHub', async () => {
    const calls = stubGithub(60 * 60 * 1000);
    const res = await post({ password: 'guess' });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('refuses everyone when no password is configured', async () => {
    vi.stubEnv('REFRESH_PASSWORD', '');
    const calls = stubGithub(60 * 60 * 1000);
    expect((await post({ password: '' })).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('starts the refresh workflow for the right password', async () => {
    const calls = stubGithub(60 * 60 * 1000);
    const res = await post({ password: PW });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/actions/workflows/refresh.yml/dispatches'))).toBe(
      true,
    );
  });

  it('holds off inside the cooldown, even with the right password', async () => {
    const calls = stubGithub(5 * 60 * 1000);
    const res = await post({ password: PW });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('does not queue a second run behind one still going', async () => {
    const calls = stubGithub(60 * 60 * 1000, 'in_progress');
    expect((await post({ password: PW })).status).toBe(429);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('limits guesses per caller, and counts the right password too once over', async () => {
    stubGithub(60 * 60 * 1000);
    const ip = { 'x-forwarded-for': '8.8.8.8' };
    for (let i = 0; i < REFRESH_ATTEMPTS; i++) await post({ password: `guess${i}` }, ip);
    expect((await post({ password: PW }, ip)).status).toBe(429);
  });
});
