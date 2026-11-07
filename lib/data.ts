import boardJson from '../data/board.json';
import type { BoardFile, BoardRow } from './types';
import { readConfig, readFile } from './github';

/**
 * How long the site serves one read of the board before asking GitHub for it
 * again. The refresh workflow purges the read by tag the moment its push
 * lands (app/api/revalidate), so the minute is the ceiling, not the usual
 * lag. The pages' `revalidate` exports repeat this number as a literal, which
 * Next.js requires; keep them in step.
 */
export const BOARD_REVALIDATE_SEC = 60;
export const BOARD_CACHE_TAG = 'board';

export type DataDeps = { fetch?: typeof fetch; env?: Record<string, string | undefined> };

/** The board as of the last deployment's build: the fallback, never the source. */
const snapshot = (): BoardFile => boardJson as unknown as BoardFile;

/**
 * The board the last refresh committed, read from the repo at request time.
 *
 * Until 2026-11-07 the board was statically imported, so every refresh had
 * to redeploy the site to show it — a full Next.js build to ship one JSON
 * file, on top of the three to four minutes the fetch itself takes. Reading
 * the committed file from GitHub through Next's data cache means a data-only
 * commit needs no build at all (vercel.json skips it) and the site shows the
 * new board within a minute, or at once when the workflow's revalidate call
 * lands. This is a read of our own committed file, not a call to gametools:
 * the community API is still never touched at request time.
 *
 * The bundled snapshot stays as the fallback. A deployment with no token
 * (local dev, tests) and a read GitHub refuses both get the board as of the
 * last build — stale, with a warning in the log, rather than a 500.
 */
export async function getBoard(deps: DataDeps = {}): Promise<BoardFile> {
  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return snapshot();

  // Next caches a fetch by its URL and options, so the cache settings ride on
  // the request itself; the join route reads the same file with no options
  // and so always gets it fresh, as a write on top of it must.
  const base = deps.fetch ?? fetch;
  const cached: typeof fetch = (url, init) =>
    base(url, { ...init, next: { revalidate: BOARD_REVALIDATE_SEC, tags: [BOARD_CACHE_TAG] } });

  try {
    return JSON.parse(await readFile(cfg, 'data/board.json', { fetch: cached })) as BoardFile;
  } catch (e) {
    console.warn('board: could not read data/board.json from GitHub; serving the bundled snapshot', e);
    return snapshot();
  }
}

export async function getMeta(deps: DataDeps = {}) {
  return (await getBoard(deps)).meta;
}

export async function getUnresolved(deps: DataDeps = {}) {
  return (await getBoard(deps)).unresolved;
}

/**
 * The spec documents `?season=<n>` (e.g. `?season=4`), but board keys are
 * `SeasonN`. Normalise a purely numeric value; anything else (including an
 * already-correct `SeasonN`, or garbage that will 404) passes through as-is.
 */
function normalizeSeasonKey(season: string): string {
  return /^\d+$/.test(season) ? `Season${season}` : season;
}

export async function getSeason(
  season?: string,
  deps: DataDeps = {},
): Promise<{ season: string; ranked: BoardRow[]; provisional: BoardRow[] } | null> {
  const board = await getBoard(deps);
  const key = season === undefined ? board.meta.currentSeason : normalizeSeasonKey(season);
  const ranked = board.seasons[key];
  if (!ranked) return null;
  return { season: key, ranked, provisional: board.provisional[key] ?? [] };
}
