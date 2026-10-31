import type { BoardFile, BoardRow, RawResponse, RosterEntry, UnresolvedEntry } from './types';
import { extractSlices, readPlayerIds, hasStatData } from './extract';
import { computeMetrics } from './metrics';
import { rankPlayers } from './ranking';
import { confidenceGames, FALLBACK_CONFIDENCE_GAMES } from './rating';
import { boardKey, compareBoardKeys, modeForBoard, modesForSeason, parseBoardKey } from './modes';
import type { BulkPlayer } from './gametools';

/**
 * Build a bulk-API entry from a resolved roster member.
 *
 * The upstream API currently ignores this field (verified live: the same
 * player returns identical data tagged 'pc', 'ps', 'xbox', 'steam', or
 * even 'unknown'), but we still send the member's real platform rather than
 * a hardcoded one, so a future tightening on their end doesn't silently
 * start returning wrong or empty data for non-pc members.
 */
export function toBulkPlayer(entry: RosterEntry): BulkPlayer | null {
  if (!entry.personaId || !entry.nucleusId) return null;
  return { player_id: entry.personaId, user_id: entry.nucleusId, platform: entry.platform };
}

/** Rate stats are rounded to this many decimal places when the board is built. */
const RATE_PRECISION = 2;

/** Round a nullable rate stat for the committed board; nulls pass through untouched. */
const roundRate = (v: number | null): number | null =>
  v === null ? null : Math.round(v * 10 ** RATE_PRECISION) / 10 ** RATE_PRECISION;

/**
 * Assemble the board from a roster and the raw responses fetched for it.
 *
 * Only the current season is computed from the responses. Every other season
 * is archived: carried over from `archive` (the previously committed board)
 * exactly as it stands, never recomputed. The API stops serving a season's
 * stats some time after it ends, and a recompute on that day would empty a
 * finished season's standings. So a season freezes the first time the build
 * sees a newer one current, and nothing — not a build, not a signup — writes
 * to it again. Seasons the API reports that are neither current nor in the
 * archive are ignored: a past season is only ever kept, never discovered.
 *
 * Pure: no network, no filesystem. Each raw response is matched back to its
 * roster member by personaId.
 *
 * `failed` names the members (by eaId) the build gave up on this run because
 * the API would not answer for them. They get no row — there is nothing to
 * compute from — and are listed as unresolved with a reason that says it was
 * the API's fault, not their privacy settings.
 *
 * `seasonStart` sets the K every rate is blended with (rating.ts), from the
 * week of the season `now` falls in; without it the fallback K applies, and
 * meta records which so the page can say.
 */
export function buildBoard(
  roster: RosterEntry[],
  responses: RawResponse[],
  currentSeason: string,
  now: Date = new Date(),
  archive: BoardFile | null = null,
  failed: ReadonlySet<string> = new Set(),
  seasonStart: Date | null = null,
): BoardFile {
  const k = seasonStart ? confidenceGames(seasonStart, now) : FALLBACK_CONFIDENCE_GAMES;
  const byPersona = new Map(roster.filter((r) => r.personaId).map((r) => [r.personaId!, r]));

  const rowsByBoard = new Map<string, BoardRow[]>();

  // A raw response may contain several players when it came from a bulk batch.
  const singles: RawResponse[] = [];
  for (const res of responses) {
    for (const ps of res.playerStats ?? []) singles.push({ playerStats: [ps] });
  }

  // Tracks every persona a response actually came back for, regardless of
  // whether it matched a roster member or had any Gauntlet slice. A roster
  // member with cached ids but no entry here has gone unreadable since they
  // last resolved (privacy turned back off) — see the unresolved computation
  // below.
  //
  // "Came back for" requires actual stat data (hasStatData), not merely a
  // `player` block: a member who has gone private still returns a valid
  // `player` id with `categories` present but every entry's `catFields`
  // empty. readPlayerIds alone would succeed on that shape and wrongly count
  // them as responded. hasStatData checks ANY category, not just Gauntlet,
  // so a member who only plays e.g. Conquest still counts as responded —
  // they just have no Gauntlet slice, a separate case buildBoard already
  // handles by simply producing no row for them.
  const respondedPersonas = new Set<string>();

  for (const single of singles) {
    const ids = readPlayerIds(single);
    if (!ids) continue;
    if (hasStatData(single)) respondedPersonas.add(ids.personaId);

    const member = byPersona.get(ids.personaId);
    if (!member) continue;

    for (const [key, slice] of extractSlices(single)) {
      const { season, mode } = parseBoardKey(key);
      if (season !== currentSeason) continue;
      const metrics = computeMetrics(slice, mode);

      // Seasons before DICE added the per-mode counters carry kills but no
      // matches/deaths/time, so no rate stat is computable. A member with no
      // measurable play in a season simply doesn't appear for it.
      if (metrics.matches === 0 && metrics.timeSec === 0) continue;

      const row: BoardRow = {
        ...metrics,
        winPct: roundRate(metrics.winPct),
        kd: roundRate(metrics.kd),
        kda: roundRate(metrics.kda),
        killsPerMatch: roundRate(metrics.killsPerMatch),
        kpm: roundRate(metrics.kpm),
        dpm: roundRate(metrics.dpm),
        spm: roundRate(metrics.spm),
        objPerMatch: roundRate(metrics.objPerMatch),
        objPts: roundRate(metrics.objPts) ?? 0,
        objPtsPerHour: roundRate(metrics.objPtsPerHour),
        top3Pct: roundRate(metrics.top3Pct),
        revivesPerHour: roundRate(metrics.revivesPerHour),
        sniperPct: roundRate(metrics.sniperPct),
        autoPct: roundRate(metrics.autoPct),
        jetPct: roundRate(metrics.jetPct) ?? 0,
        eaId: member.eaId,
        displayName: member.displayName,
        inGameName: member.inGameName,
        inGamePlatform: member.inGamePlatform,
        platform: member.platform,
        region: member.region,
        mainMode: member.mainMode,
        rank: null,
      };
      const list = rowsByBoard.get(key) ?? [];
      list.push(row);
      rowsByBoard.set(key, list);
    }
  }

  // Build board keys in one natural-sorted order up front — every board of the
  // current season must always be present, even with no data, so the board renders
  // an empty state rather than 404ing on the day a new season starts. Object
  // key insertion order then follows this sort, not Map iteration order
  // (bulk-API response order, which is documented-unstable), so JSON.stringify
  // output — which build.ts's change-detection depends on — is identical
  // regardless of the order responses came back in.
  const archived = Object.keys(archive?.seasons ?? {}).filter((k) => parseBoardKey(k).season !== currentSeason);
  const current = modesForSeason(currentSeason).map((m) => boardKey(currentSeason, m));
  const boardKeys = [...new Set([...archived, ...current])].sort(compareBoardKeys);
  const seasonNames = [...new Set(boardKeys.map((k) => parseBoardKey(k).season))];

  const seasons: Record<string, BoardRow[]> = {};
  const provisional: Record<string, BoardRow[]> = {};
  for (const key of boardKeys) {
    if (parseBoardKey(key).season !== currentSeason) {
      seasons[key] = archive!.seasons[key];
      provisional[key] = archive!.provisional[key] ?? [];
      continue;
    }
    const rows = rowsByBoard.get(key) ?? [];
    // rankPlayers' sort is stable but not fully ordered (ties fall through to
    // insertion order), and insertion order here is bulk-API response order,
    // which is documented-unstable. Sort by eaId first so tied rows land in
    // the same place on every run, keeping the daily build idempotent.
    const sorted = [...rows].sort((a, b) => a.eaId.localeCompare(b.eaId));
    const split = rankPlayers(sorted, modeForBoard(key).key, k);
    seasons[key] = split.ranked;
    provisional[key] = split.provisional;
  }

  const unresolved: UnresolvedEntry[] = roster.flatMap((r): UnresolvedEntry[] => {
    // Imported players cannot be reached and will never fix their privacy, so
    // listing them only drowns out the members who can.
    if (r.source === 'imported') return [];
    if (failed.has(r.eaId)) {
      return [{ eaId: r.eaId, displayName: r.displayName, reason: 'fetch_failed' }];
    }
    if (!r.personaId || !r.nucleusId) {
      return [{ eaId: r.eaId, displayName: r.displayName, reason: 'not_found' }];
    }
    if (!respondedPersonas.has(r.personaId)) {
      return [{ eaId: r.eaId, displayName: r.displayName, reason: 'no_data' }];
    }
    return [];
  });

  return {
    meta: {
      currentSeason,
      seasons: seasonNames,
      builtAt: now.toISOString(),
      seasonStart: seasonStart ? seasonStart.toISOString() : null,
      confidenceGames: k,
    },
    seasons,
    provisional,
    unresolved,
  };
}

/**
 * Re-rank a committed board without re-reading anyone's stats. The current
 * season's boards go through rankPlayers again, with the K the board's own
 * launch date and builtAt give; archived seasons are untouched, and builtAt
 * is kept, since no stat was read. For a change to the rating alone — a
 * weight, CONFIDENCE_GAMES_PER_WEEK — this is what `npm run data:rerank` does
 * instead of making the API serve the whole roster again.
 */
export function rerankBoard(board: BoardFile): BoardFile {
  const now = new Date(board.meta.builtAt);
  const seasonStart = board.meta.seasonStart ? new Date(board.meta.seasonStart) : null;
  const k = seasonStart ? confidenceGames(seasonStart, now) : FALLBACK_CONFIDENCE_GAMES;
  const seasons = { ...board.seasons };
  const provisional = { ...board.provisional };
  for (const key of new Set([...Object.keys(board.seasons), ...Object.keys(board.provisional)])) {
    if (parseBoardKey(key).season !== board.meta.currentSeason) continue;
    // Sorted by eaId first for the same reason buildBoard does: ties then land
    // in the same place on every run.
    const all = [...(board.seasons[key] ?? []), ...(board.provisional[key] ?? [])].sort((a, b) =>
      a.eaId.localeCompare(b.eaId),
    );
    const split = rankPlayers(all, modeForBoard(key).key, k);
    seasons[key] = split.ranked;
    provisional[key] = split.provisional;
  }
  return { ...board, meta: { ...board.meta, confidenceGames: k }, seasons, provisional };
}
