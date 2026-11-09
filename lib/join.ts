import type { BoardFile, BoardRow, RawResponse, RosterEntry } from './types';
import { buildBoard, toBulkPlayer } from './pipeline';
import { rankPlayers } from './ranking';
import { isLedgerMode } from './ledger';
import { hasStatData } from './extract';
import { pickInGameNameFor } from './naming';
import { boardKey, compareSeasons, modeForBoard, modesForSeason } from './modes';

/**
 * Self-serve signup: a player adds their own EA ID and appears on the board.
 *
 * Everything here is pure or dependency-injected. The route handler supplies
 * the network and the commit; this module decides what the roster and board
 * should look like afterwards, so the whole flow is testable without either.
 */

/**
 * EA IDs are 4-16 characters of letters, digits, underscore, hyphen and dot.
 * Validated before anything is fetched: a malformed id cannot resolve, so
 * rejecting it here spares gametools a request that was never going to work.
 */
const EA_ID = /^[A-Za-z0-9_.-]{4,16}$/;

/** Trim and validate an EA ID. Returns null when it cannot be one. */
export function normalizeEaId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return EA_ID.test(trimmed) ? trimmed : null;
}

/**
 * EA IDs are case-sensitive in game but unique case-insensitively, so this
 * catches someone signing up as "Conqueror" when "CONQUEROR" is on the board.
 */
export function findByEaId(roster: RosterEntry[], eaId: string): RosterEntry | undefined {
  const needle = eaId.toLowerCase();
  return roster.find((m) => m.eaId.toLowerCase() === needle);
}

export type JoinFailure =
  | 'invalid'
  | 'duplicate'
  | 'not_found'
  | 'no_data'
  | 'unconfigured'
  | 'busy'
  | 'error';

export type JoinResult =
  | {
      ok: true;
      eaId: string;
      displayName: string;
      season: string;
      /** Null when they landed in the provisional section. */
      rank: number | null;
      /** Points on a Rapid Royale board (also for a provisional player); the 0–100 rating on Gauntlet, null if provisional. */
      rating: number | null;
      matches: number;
      provisional: boolean;
      /** True when the board ranks on the points ledger, so the form can say "points". */
      ledger: boolean;
    }
  | { ok: false; reason: JoinFailure; message: string };

/**
 * Splice one player's rows into an existing board and re-rank every season
 * they appear in.
 *
 * The addition only ever carries the current season (buildBoard computes
 * nothing else), and every season it does not carry is left exactly as it
 * stands — archived seasons are frozen, so a signup never touches them.
 *
 * Re-ranking is not optional: everyone's rank and the Provisional split
 * depend on the whole field, and on a Gauntlet board (archived, so never in
 * practice) the rating itself is a percentile of it. On a Rapid Royale board
 * nobody else's points move — a ledger total is the player's own sum.
 * rankPlayers is the same function the scheduled build uses, so a board
 * merged here and a board rebuilt from scratch agree.
 */
export function mergePlayer(board: BoardFile, addition: BoardFile): BoardFile {
  const seasons: Record<string, BoardRow[]> = {};
  const provisional: Record<string, BoardRow[]> = {};

  const keys = new Set([
    ...Object.keys(board.seasons),
    ...Object.keys(board.provisional),
    ...Object.keys(addition.seasons),
    ...Object.keys(addition.provisional),
  ]);

  for (const season of keys) {
    if (!(season in addition.seasons) && !(season in addition.provisional)) {
      seasons[season] = board.seasons[season] ?? [];
      provisional[season] = board.provisional[season] ?? [];
      continue;
    }
    const all = [
      ...(board.seasons[season] ?? []),
      ...(board.provisional[season] ?? []),
      ...(addition.seasons[season] ?? []),
      ...(addition.provisional[season] ?? []),
    ];
    const ranked = rankPlayers(all, modeForBoard(season).key);
    seasons[season] = ranked.ranked;
    provisional[season] = ranked.provisional;
  }

  return {
    ...board,
    // The new player may be the first with data for a season the board has
    // never shown. meta.seasons drives the tab strip, so it has to learn it.
    meta: {
      ...board.meta,
      seasons: [...new Set([...board.meta.seasons, ...addition.meta.seasons])].sort(compareSeasons),
      // The addition's season came from a live call a moment ago; the
      // committed board's is as old as the last build. On the day a season
      // rolls over, that is the difference between the board opening on the
      // new season and opening on a finished one.
      currentSeason: addition.meta.currentSeason,
      // Not the signup's clock. builtAt means "when these stats were read",
      // and a signup reads one player's — everyone else's are still as of the
      // last daily refresh, which is what the page tells people.
      builtAt: board.meta.builtAt,
    },
    seasons,
    provisional,
    // A self-serve signup resolved and returned data by definition, so it
    // never contributes an unresolved entry.
    unresolved: board.unresolved,
  };
}

/**
 * Where a player ended up, for the message the form shows them.
 *
 * The current season may hold several boards (Trio and Solo). A ranked place
 * on any of them beats a provisional one; between equals, the season's main
 * board wins. `season` names the board as the form reads it: "Season5 Solo".
 */
export function placementOf(board: BoardFile, eaId: string): {
  season: string;
  rank: number | null;
  rating: number | null;
  matches: number;
  provisional: boolean;
  ledger: boolean;
} | null {
  const season = board.meta.currentSeason;
  const boards = modesForSeason(season).map((mode) => ({
    key: boardKey(season, mode),
    label: mode.variant ? `${season} ${mode.variant}` : season,
    ledger: isLedgerMode(mode.key),
  }));
  for (const { key, label, ledger } of boards) {
    const ranked = (board.seasons[key] ?? []).find((r) => r.eaId === eaId);
    if (ranked) {
      return {
        season: label,
        rank: ranked.rank,
        rating: ranked.rating,
        matches: ranked.matches,
        provisional: false,
        ledger,
      };
    }
  }
  for (const { key, label, ledger } of boards) {
    const prov = (board.provisional[key] ?? []).find((r) => r.eaId === eaId);
    // A Provisional player's points are as real as anyone's; a Provisional
    // Gauntlet rating is not (a percentile needs the field), so it stays null.
    if (prov) return { season: label, rank: null, rating: ledger ? prov.rating : null, matches: prov.matches, provisional: true, ledger };
  }
  return null;
}

export type JoinDeps = {
  /** Every persona on the account, for choosing the name shown in game. */
  fetchPersonas: (nucleusId: string) => Promise<{ displayName: string; platform: string }[]>;
  /** Read a file at the tip of the deployed branch. */
  readFile: (path: string) => Promise<string>;
  /** Commit the given files as one change. Throws on a lost race. */
  commitFiles: (files: { path: string; content: string }[], message: string) => Promise<string>;
  resolvePlayer: (eaId: string) => Promise<{ personaId: string; nucleusId: string } | null>;
  fetchBulk: (players: { player_id: string; user_id: string; platform: string }[]) => Promise<RawResponse[]>;
  currentSeason: () => Promise<string>;
  now?: () => Date;
};

/** How many times to re-read and rebuild when a concurrent commit beats us. */
const MAX_ATTEMPTS = 3;

/**
 * Add a player to the roster and the board, in one commit.
 *
 * Reads both files fresh from the branch each attempt: the copies bundled
 * into the running deployment are a build-time snapshot, and two signups a
 * minute apart would otherwise both write on top of the same stale board.
 */
export async function processJoin(
  rawEaId: unknown,
  deps: JoinDeps,
  isRefMoved: (e: unknown) => boolean = () => false,
): Promise<JoinResult> {
  const eaId = normalizeEaId(rawEaId);
  if (!eaId) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'That does not look like an EA ID. They are 4-16 characters: letters, digits, _ . and -',
    };
  }

  const ids = await deps.resolvePlayer(eaId);
  if (!ids) {
    return {
      ok: false,
      reason: 'not_found',
      message: `EA could not find a player called ${eaId}. Check the spelling — EA IDs are case-sensitive.`,
    };
  }

  // The name on the scoreboard in game, which is usually a platform persona
  // rather than the EA ID they typed. A failure here costs a nicer label, not
  // the signup, so it falls back to the EA ID.
  const personas = await deps.fetchPersonas(ids.nucleusId).catch(() => []);
  // No answer leaves the field unset rather than caching the EA ID as though
  // it had been checked: the board falls back to the EA ID for display, and
  // the next daily build resolves them properly.
  const inGameName = personas.length > 0 ? pickInGameNameFor(eaId, personas) : undefined;

  const entry: RosterEntry = {
    eaId,
    displayName: eaId,
    platform: 'pc',
    region: 'unknown',
    mainMode: 'gauntlet',
    personaId: ids.personaId,
    nucleusId: ids.nucleusId,
    source: 'selfserve',
    inGameName,
    inGamePlatform: inGameName
      ? (personas.find((p) => p.displayName === inGameName)?.platform ?? 'ea')
      : undefined,
  };

  const bulk = toBulkPlayer(entry);
  if (!bulk) return { ok: false, reason: 'error', message: 'Could not build a stats request.' };

  const responses = await deps.fetchBulk([bulk]);
  if (!responses.some(hasStatData)) {
    return {
      ok: false,
      reason: 'no_data',
      message:
        'EA knows that account but shares no stats for it. Set your in-game privacy to Everyone, play a match, then try again.',
    };
  }

  const currentSeason = await deps.currentSeason();
  const now = deps.now ?? (() => new Date());

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const [rosterRaw, boardRaw] = await Promise.all([
      deps.readFile('roster.json'),
      deps.readFile('data/board.json'),
    ]);
    const roster: RosterEntry[] = JSON.parse(rosterRaw);
    const board: BoardFile = JSON.parse(boardRaw);

    // Checked inside the retry loop, not before it: the player we lost a race
    // to may have been this same player, submitted twice.
    if (findByEaId(roster, eaId)) {
      return { ok: false, reason: 'duplicate', message: `${eaId} is already on the board.` };
    }
    if (roster.some((m) => m.personaId === ids.personaId)) {
      return {
        ok: false,
        reason: 'duplicate',
        message: 'That account is already on the board under a different EA ID.',
      };
    }

    const addition = buildBoard([entry], responses, currentSeason, now());
    const merged = mergePlayer(board, addition);
    const nextRoster = [...roster, entry];

    const files = [
      { path: 'roster.json', content: JSON.stringify(nextRoster, null, 2) + '\n' },
      { path: 'data/board.json', content: JSON.stringify(merged, null, 2) + '\n' },
      ...Object.entries(merged.seasons).map(([season, rows]) => ({
        path: `data/${season.toLowerCase()}.json`,
        content:
          JSON.stringify({ season, rows, provisional: merged.provisional[season] ?? [] }, null, 2) + '\n',
      })),
    ];

    try {
      await deps.commitFiles(files, `Add ${eaId} to the roster\n\nSelf-serve signup.`);
    } catch (e) {
      if (isRefMoved(e) && attempt < MAX_ATTEMPTS) continue;
      if (isRefMoved(e)) {
        return {
          ok: false,
          reason: 'busy',
          message: 'The board was being updated at the same moment. Try again in a few seconds.',
        };
      }
      throw e;
    }

    const placement = placementOf(merged, eaId);
    return {
      ok: true,
      eaId,
      displayName: entry.inGameName ?? entry.displayName,
      season: placement?.season ?? currentSeason,
      rank: placement?.rank ?? null,
      rating: placement?.rating ?? null,
      matches: placement?.matches ?? 0,
      provisional: placement?.provisional ?? true,
      ledger: placement?.ledger ?? false,
    };
  }

  return {
    ok: false,
    reason: 'busy',
    message: 'The board was being updated at the same moment. Try again in a few seconds.',
  };
}
