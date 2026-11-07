import { describe, it, expect, vi, afterEach } from 'vitest';
import { getBoard, getSeason, getMeta, getUnresolved, BOARD_REVALIDATE_SEC, BOARD_CACHE_TAG } from './data';
import boardJson from '../data/board.json';

/** A deployment with no GitHub token: everything comes from the bundled snapshot. */
const unconfigured = { env: {} };

describe('data accessors (bundled snapshot)', () => {
  it('loads the generated board', async () => {
    expect((await getBoard(unconfigured)).meta.currentSeason).toMatch(/^Season\d+$/);
  });

  it('defaults to the current season', async () => {
    expect((await getSeason(undefined, unconfigured))!.season).toBe((await getMeta(unconfigured)).currentSeason);
  });

  it('returns null for an unknown season', async () => {
    expect(await getSeason('Season99', unconfigured)).toBeNull();
  });

  it('normalises a purely numeric season to SeasonN, as the spec documents', async () => {
    const current = (await getMeta(unconfigured)).currentSeason;
    const numeric = current.replace(/^Season/, '');
    expect((await getSeason(numeric, unconfigured))!.season).toBe(current);
  });

  it('exposes meta', async () => {
    const meta = await getMeta(unconfigured);
    expect(Array.isArray(meta.seasons)).toBe(true);
    expect(typeof meta.builtAt).toBe('string');
  });

  it('exposes unresolved members', async () => {
    expect(Array.isArray(await getUnresolved(unconfigured))).toBe(true);
  });
});

describe('getBoard reads the committed board at request time', () => {
  const env = { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r' };
  /** What the repo holds right now: the snapshot with a newer build stamp. */
  const live = { ...boardJson, meta: { ...boardJson.meta, builtAt: '2099-01-01T00:00:00.000Z' } };
  const contents = (json: unknown) =>
    Response.json({ content: Buffer.from(JSON.stringify(json)).toString('base64'), encoding: 'base64' });

  afterEach(() => vi.restoreAllMocks());

  it('fetches data/board.json from the configured repo, not the bundled copy', async () => {
    // A refresh commits the board without redeploying, so the deployment's
    // own copy is a snapshot from whenever it was last built.
    const calls: { url: string; init: RequestInit & { next?: unknown } }[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return contents(live);
    });
    const board = await getBoard({ env, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(board.meta.builtAt).toBe('2099-01-01T00:00:00.000Z');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/repos/o/r/contents/data/board.json');
  });

  it('asks Next to cache the read for a minute under the board tag', async () => {
    // The cache, not GitHub, answers page loads: at most one read a minute
    // however many people are looking, and the revalidate route can purge
    // it by tag the moment a refresh lands.
    let seen: { next?: { revalidate?: number; tags?: string[] } } | undefined;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      seen = init as typeof seen;
      return contents(live);
    });
    await getBoard({ env, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(BOARD_REVALIDATE_SEC).toBe(60);
    expect(seen?.next).toEqual({ revalidate: BOARD_REVALIDATE_SEC, tags: [BOARD_CACHE_TAG] });
  });

  it('serves the bundled snapshot when no token is configured', async () => {
    const fetch = vi.fn();
    const board = await getBoard({ env: {}, fetch });
    expect(board.meta.builtAt).toBe(boardJson.meta.builtAt);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serves the bundled snapshot, and says so, when GitHub cannot be read', async () => {
    // Stale beats down: the snapshot is at worst a few refreshes old.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response('nope', { status: 503 }));
    const board = await getBoard({ env, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(board.meta.builtAt).toBe(boardJson.meta.builtAt);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bundled'), expect.anything());
  });
});
