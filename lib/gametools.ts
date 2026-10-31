import type { RawPlayerIds, RawResponse } from './types';
import { readPlayerIds } from './extract';

export const API_BASE = 'https://api.gametools.network';

/**
 * Players per bulk call.
 *
 * The API documents a maximum of 128, but that ceiling is unreachable with
 * raw=true: each player's fact table is ~2.9MB, so 96 players timed out the
 * gateway with a 504 and 32 returned a truncated stream. Measured: 16 players
 * = 47MB in 11s (the practical limit), 32 = failure. 12 leaves margin, and a
 * smaller batch also limits the blast radius — one failed batch fails the
 * whole build.
 */
export const BATCH_SIZE = 12;

/**
 * How long to wait before re-asking for a failed batch one member at a time.
 * The failures seen in the wild (2026-10-26 to 30) were 503s that cleared
 * within the hour; the request-level retries (0.5s, then 1s) do not outlast a
 * burst of them, so a pause here gives each member's own second try a chance
 * of landing after it.
 */
export const BULK_FALLBACK_PAUSE_MS = 5_000;

/**
 * `player_id` is the persona ID; `user_id` is the nucleus ID. They are different
 * numbers and swapping them silently returns wrong or empty data.
 */
export type BulkPlayer = { player_id: string; user_id: string; platform: string };

export type Deps = {
  fetchImpl?: typeof fetch;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Fetch with retry on transport errors and 5xx. A 404 is returned to the
 * caller untouched — for this API it means "no such player", which is data,
 * not a failure.
 */
async function request(url: string, init: RequestInit, deps: Deps): Promise<Response> {
  const doFetch = deps.fetchImpl ?? fetch;
  const retries = deps.retries ?? 3;
  const sleep = deps.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await doFetch(url, init);
      if (res.ok) return res;
      if (res.status === 404) return res;
      // Non-retryable 4xx errors (400, 401, 403, 422, 429, …) fail immediately
      if (res.status >= 400 && res.status < 500) {
        lastError = new Error(`${init.method ?? 'GET'} ${url} failed: HTTP ${res.status}`);
        break; // Exit loop without retrying
      }
      // 5xx errors are retryable
      lastError = new Error(`${init.method ?? 'GET'} ${url} failed: HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries) await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Read the current season id from the live game events feed. Never hardcode it. */
export async function fetchCurrentSeason(deps: Deps = {}): Promise<string> {
  const res = await request(`${API_BASE}/bf6/gameevents/`, { method: 'GET' }, deps);
  const body = (await res.json()) as { events?: { name?: string; active?: boolean }[] };
  const season = body.events?.find((e) => e.active && /^Season\d+$/.test(e.name ?? ''));
  if (!season?.name) throw new Error('No active season found in /bf6/gameevents/');
  return season.name;
}

/** Resolve an EA ID to its persona/nucleus ids. Returns null when unknown. */
export async function resolvePlayer(eaId: string, deps: Deps = {}): Promise<RawPlayerIds | null> {
  const url = `${API_BASE}/bf6/stats/?name=${encodeURIComponent(eaId)}&raw=true`;
  const res = await request(url, { method: 'GET', headers: { accept: 'application/json' } }, deps);
  if (res.status === 404) return null;
  return readPlayerIds((await res.json()) as RawResponse);
}

/**
 * Every persona on an account — one per platform the player has linked.
 *
 * The name shown in game is the platform persona, not the EA ID, so this is
 * what turns a roster entry into a name people recognise.
 *
 * An empty list means NO ANSWER, not "no personas". This endpoint answers 200
 * with `{"results": []}` when it is throttled or its cache has expired — the
 * same query returns two personas a minute later. A real answer for a player
 * with no console always includes their EA persona, so callers must treat
 * empty as "ask again later" and never as grounds to overwrite a name they
 * already have.
 */
export async function fetchPersonas(
  nucleusId: string,
  deps: Deps = {},
): Promise<{ displayName: string; platform: string }[]> {
  const url = `${API_BASE}/bf6/player/?nucleus_id=${encodeURIComponent(nucleusId)}`;
  const res = await request(url, { method: 'GET', headers: { accept: 'application/json' } }, deps);
  if (res.status === 404) return [];
  const body = (await res.json()) as { results?: { displayName?: string; platform?: string }[] };
  return (body.results ?? [])
    .filter((r): r is { displayName: string; platform: string } =>
      typeof r.displayName === 'string' && typeof r.platform === 'string')
    .map((r) => ({ displayName: r.displayName, platform: r.platform }));
}

async function postBatch(batch: BulkPlayer[], deps: Deps): Promise<RawResponse> {
  const res = await request(
    `${API_BASE}/bf6/multiple/?raw=true`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(batch), // MUST be an array; an object returns 422
    },
    deps,
  );
  return (await res.json()) as RawResponse;
}

/**
 * Fetch raw stats for many players, batched at BATCH_SIZE. Throws on the
 * first batch that fails — right for a signup, where the one player asked
 * for must be answered or the signup reported as failed.
 */
export async function fetchBulk(players: BulkPlayer[], deps: Deps = {}): Promise<RawResponse[]> {
  const out: RawResponse[] = [];
  for (const batch of chunk(players, BATCH_SIZE)) out.push(await postBatch(batch, deps));
  return out;
}

export type SkippedPlayer = { player: BulkPlayer; error: Error };

/**
 * fetchBulk for the build, where one member the API will not answer for must
 * not cost everyone else their refresh — which is exactly what happened five
 * runs in a row in late October 2026. A batch that still fails after the
 * request-level retries is re-asked one member at a time, so every member
 * gets a second try of their own; whoever still fails is skipped and
 * reported, to be tried again next refresh.
 */
export async function fetchBulkSkippingFailures(
  players: BulkPlayer[],
  deps: Deps = {},
): Promise<{ responses: RawResponse[]; skipped: SkippedPlayer[] }> {
  const sleep = deps.sleep ?? defaultSleep;
  const responses: RawResponse[] = [];
  const skipped: SkippedPlayer[] = [];
  for (const batch of chunk(players, BATCH_SIZE)) {
    try {
      responses.push(await postBatch(batch, deps));
      continue;
    } catch {
      await sleep(BULK_FALLBACK_PAUSE_MS);
    }
    for (const player of batch) {
      try {
        responses.push(await postBatch([player], deps));
      } catch (err) {
        skipped.push({ player, error: err instanceof Error ? err : new Error(String(err)) });
      }
    }
  }
  return { responses, skipped };
}
