import { describe, it, expect, vi } from 'vitest';
import {
  fetchCurrentSeason,
  resolvePlayer,
  fetchBulk,
  fetchBulkSkippingFailures,
  chunk,
  BATCH_SIZE,
  BULK_FALLBACK_PAUSE_MS,
  API_BASE,
} from './gametools';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const noSleep = () => Promise.resolve();

describe('constants', () => {
  it('targets the gametools API', () => {
    expect(API_BASE).toBe('https://api.gametools.network');
  });
  it('batches well under the documented maximum, which raw=true cannot reach', () => {
    // 96 players in one raw call 504s; 32 truncates. Measured ceiling is 16.
    expect(BATCH_SIZE).toBe(12);
    expect(BATCH_SIZE).toBeLessThan(16);
  });
});

describe('chunk', () => {
  it('splits into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns nothing for an empty list', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('fetchCurrentSeason', () => {
  it('returns the active season name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ events: [
        { name: 'Season3', active: false },
        { name: 'Season4', active: true },
        { name: 'BP04', active: true },
      ] }),
    );
    await expect(fetchCurrentSeason({ fetchImpl, sleep: noSleep })).resolves.toBe('Season4');
  });

  it('ignores active non-season events', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ events: [{ name: 'BP04', active: true }, { name: 'Season2', active: true }] }),
    );
    await expect(fetchCurrentSeason({ fetchImpl, sleep: noSleep })).resolves.toBe('Season2');
  });

  it('throws when no active season exists', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ events: [] }));
    await expect(fetchCurrentSeason({ fetchImpl, sleep: noSleep })).rejects.toThrow(/active season/i);
  });
});

describe('resolvePlayer', () => {
  it('returns ids for a known player', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ playerStats: [{ player: { nucleusId: '1', personaId: '2', platformId: 1 }, categories: [] }] }),
    );
    await expect(resolvePlayer('pkidarkpki', { fetchImpl, sleep: noSleep })).resolves.toEqual({
      nucleusId: '1', personaId: '2', platformId: 1,
    });
  });

  it('returns null on 404 without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ errors: ['Player not found'] }, 404));
    await expect(resolvePlayer('ghost', { fetchImpl, sleep: noSleep })).resolves.toBeNull();
  });

  it('does not retry a 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 404));
    await resolvePlayer('ghost', { fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('requests raw data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    await resolvePlayer('someone', { fetchImpl, sleep: noSleep });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('raw=true');
  });

  it('retries a 500 then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({ playerStats: [{ player: { nucleusId: '9', personaId: '8', platformId: 1 }, categories: [] }] }));
    await expect(resolvePlayer('flaky', { fetchImpl, sleep: noSleep })).resolves.toEqual({
      nucleusId: '9', personaId: '8', platformId: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 500));
    await expect(resolvePlayer('down', { fetchImpl, retries: 2, sleep: noSleep })).rejects.toThrow(/500/);
  });

  it('does not retry a 422', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 422));
    await expect(resolvePlayer('bad', { fetchImpl, sleep: noSleep })).rejects.toThrow(/422/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('fetchBulk', () => {
  const player = { player_id: '2', user_id: '1', platform: 'pc' };

  it('posts a JSON array body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    await fetchBulk([player], { fetchImpl, sleep: noSleep });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual([player]);
  });

  it('splits into batches of BATCH_SIZE', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(json({ playerStats: [] })));
    const many = Array.from({ length: BATCH_SIZE * 3 }, () => player);
    await fetchBulk(many, { fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('returns one response per batch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    const results = await fetchBulk([player, player], { fetchImpl, sleep: noSleep });
    expect(results).toHaveLength(1);
  });

  it('makes no request for an empty list', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchBulk([], { fetchImpl, sleep: noSleep })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchBulkSkippingFailures', () => {
  const a = { player_id: 'A', user_id: '1', platform: 'pc' };
  const b = { player_id: 'B', user_id: '2', platform: 'pc' };
  const asked = (init: RequestInit) =>
    (JSON.parse(init.body as string) as { player_id: string }[]).map((p) => p.player_id);
  const down = () => Promise.resolve(json({ detail: 'down' }, 503));

  it('returns every batch response and skips nobody when nothing fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    const out = await fetchBulkSkippingFailures([a, b], { fetchImpl, sleep: noSleep });
    expect(out.responses).toHaveLength(1);
    expect(out.skipped).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches a failed batch one member at a time and keeps those who answer', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const ids = asked(init);
      if (ids.length > 1) return down();
      if (ids[0] === 'A') return Promise.resolve(json({ playerStats: [{ id: 'A' }] }));
      return down();
    });
    const out = await fetchBulkSkippingFailures([a, b], { fetchImpl, retries: 2, sleep: noSleep });
    expect(out.responses).toEqual([{ playerStats: [{ id: 'A' }] }]);
    expect(out.skipped.map((s) => s.player)).toEqual([b]);
    expect(out.skipped[0].error.message).toMatch(/503/);
  });

  it('gives every member of a failed batch a second try of their own, after a pause', async () => {
    const fetchImpl = vi.fn().mockImplementation(down);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const out = await fetchBulkSkippingFailures([a, b], { fetchImpl, retries: 1, sleep });
    expect(fetchImpl.mock.calls.map((c) => asked(c[1]))).toEqual([['A', 'B'], ['A'], ['B']]);
    expect(sleep).toHaveBeenCalledWith(BULK_FALLBACK_PAUSE_MS);
    expect(out.responses).toEqual([]);
    expect(out.skipped.map((s) => s.player)).toEqual([a, b]);
  });

  it('leaves the batches that succeed untouched when another fails', async () => {
    const first = Array.from({ length: BATCH_SIZE }, (_, i) => ({ ...a, player_id: `A${i}` }));
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) =>
      asked(init).includes('B') ? down() : Promise.resolve(json({ playerStats: [] })),
    );
    const out = await fetchBulkSkippingFailures([...first, b], { fetchImpl, retries: 1, sleep: noSleep });
    expect(out.responses).toHaveLength(1);
    expect(out.skipped.map((s) => s.player)).toEqual([b]);
  });
});
