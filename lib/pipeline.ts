import type { BoardFile, BoardRow, RawResponse, RosterEntry, UnresolvedEntry } from './types';
import { extractSlices, readPlayerIds, hasStatData } from './extract';
import { computeMetrics } from './metrics';
import { rankPlayers } from './ranking';
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
 * Sort season keys the way a human expects: numerically by the trailing
 * number (Season2 before Season10), falling back to a plain string compare
 * for anything that doesn't end in digits.
 */
function compareSeasonKeys(a: string, b: string): number {
  const an = /^(.*?)(\d+)$/.exec(a);
  const bn = /^(.*?)(\d+)$/.exec(b);
  if (an && bn && an[1] === bn[1]) return Number(an[2]) - Number(bn[2]);
  return a.localeCompare(b);
}

/**
 * Assemble the board from a roster and the raw responses fetched for it.
 *
 * Pure: no network, no filesystem. Each raw response is matched back to its
 * roster member by personaId.
 */
export function buildBoard(
  roster: RosterEntry[],
  responses: RawResponse[],
  currentSeason: string,
  now: Date = new Date(),
): BoardFile {
  const byPersona = new Map(roster.filter((r) => r.personaId).map((r) => [r.personaId!, r]));

  const rowsBySeason = new Map<string, BoardRow[]>();

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

    for (const [season, slice] of extractSlices(single)) {
      const metrics = computeMetrics(slice);

      // Seasons before DICE added the per-mode counters carry kills but no
      // matches/deaths/time, so no rate stat is computable. A member with no
      // measurable play in a season simply doesn't appear for it.
      if (metrics.matches === 0 && metrics.timeSec === 0) continue;

      const row: BoardRow = {
        ...metrics,
        winPct: roundRate(metrics.winPct),
        kd: roundRate(metrics.kd),
        killsPerMatch: roundRate(metrics.killsPerMatch),
        kpm: roundRate(metrics.kpm),
        dpm: roundRate(metrics.dpm),
        spm: roundRate(metrics.spm),
        objPerMatch: roundRate(metrics.objPerMatch),
        objPts: roundRate(metrics.objPts) ?? 0,
        objPtsPerHour: roundRate(metrics.objPtsPerHour),
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
      const list = rowsBySeason.get(season) ?? [];
      list.push(row);
      rowsBySeason.set(season, list);
    }
  }

  // Build season keys in one natural-sorted order up front — the current
  // season must always be present, even with no data, so the board renders
  // an empty state rather than 404ing on the day a new season starts. Object
  // key insertion order then follows this sort, not Map iteration order
  // (bulk-API response order, which is documented-unstable), so JSON.stringify
  // output — which build.ts's change-detection depends on — is identical
  // regardless of the order responses came back in.
  const seasonNames = [...new Set([...rowsBySeason.keys(), currentSeason])].sort(compareSeasonKeys);

  const seasons: Record<string, BoardRow[]> = {};
  const provisional: Record<string, BoardRow[]> = {};
  for (const season of seasonNames) {
    const rows = rowsBySeason.get(season) ?? [];
    // rankPlayers' sort is stable but not fully ordered (ties fall through to
    // insertion order), and insertion order here is bulk-API response order,
    // which is documented-unstable. Sort by eaId first so tied rows land in
    // the same place on every run, keeping the daily build idempotent.
    const sorted = [...rows].sort((a, b) => a.eaId.localeCompare(b.eaId));
    const split = rankPlayers(sorted);
    seasons[season] = split.ranked;
    provisional[season] = split.provisional;
  }

  const unresolved: UnresolvedEntry[] = roster.flatMap((r): UnresolvedEntry[] => {
    // Imported players cannot be reached and will never fix their privacy, so
    // listing them only drowns out the members who can.
    if (r.source === 'imported') return [];
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
    },
    seasons,
    provisional,
    unresolved,
  };
}
