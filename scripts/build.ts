#!/usr/bin/env tsx
/**
 * Daily build: resolve roster ids, fetch the current season's stats, write data/.
 *
 *   npm run data          # write files
 *   npm run data:dry      # compute and report, write nothing
 *
 * Never exits non-zero because individual members were unresolved — that is
 * expected data (their in-game stats privacy is not set to Everyone).
 *
 * Nor because the API failed to answer for one member. Every per-member call
 * is tried at least twice (the request-level retries, plus a second try of
 * their own for a member in a failed bulk batch); a member it still cannot
 * answer for is skipped for this run and listed as unresolved with reason
 * 'fetch_failed', to be tried again next refresh. Five runs in a row died on
 * one such member in late October 2026 and the board went stale for a week.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { writeBoardFiles } from './write';
import { fetchCurrentSeasonInfo, resolvePlayer, fetchBulkSkippingFailures, fetchPersonas } from '../lib/gametools';
import { pickInGameNameFor } from '../lib/naming';
import { buildBoard, toBulkPlayer } from '../lib/pipeline';
import type { BoardFile, RosterEntry } from '../lib/types';

const dryRun = process.argv.includes('--dry-run');

/**
 * Skipping is for the odd member the API hiccups on. If more than this share
 * of the roster is skipped the API is down, not flaky, and publishing a board
 * with most of the community missing is worse than keeping the last one —
 * so the build fails and the committed data stands until the next run.
 */
const MAX_SKIPPED_SHARE = 0.5;

/**
 * Fail fast on a malformed roster rather than silently misbehaving:
 * a duplicate personaId would drop one of the members from the bulk
 * response's match-back (byPersona is keyed by personaId) and misattribute
 * the survivor's stats, and a duplicate eaId throws inside DataGrid, which
 * uses eaId as its row id.
 */
function validateRoster(roster: RosterEntry[]): void {
  const dupes = (values: string[]): string[] => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const v of values) (seen.has(v) ? dup : seen).add(v);
    return [...dup];
  };

  const dupEaIds = dupes(roster.map((m) => m.eaId));
  const dupPersonaIds = dupes(roster.filter((m) => m.personaId).map((m) => m.personaId!));

  const problems: string[] = [];
  if (dupEaIds.length > 0) problems.push(`duplicate eaId(s): ${dupEaIds.join(', ')}`);
  if (dupPersonaIds.length > 0) problems.push(`duplicate personaId(s): ${dupPersonaIds.join(', ')}`);

  if (problems.length > 0) {
    throw new Error(`roster.json is invalid — ${problems.join('; ')}`);
  }
}

async function main() {
  const roster: RosterEntry[] = JSON.parse(readFileSync('roster.json', 'utf8'));
  console.log(`Roster: ${roster.length} members`);
  validateRoster(roster);

  const { name: currentSeason, startsAt } = await fetchCurrentSeasonInfo();
  console.log(`Current season: ${currentSeason}`);

  // Members (by eaId) the API would not answer for this run, after two tries.
  const failed = new Set<string>();

  // Resolve only members we have not already cached ids for.
  let resolvedCount = 0;
  for (const member of roster) {
    if (member.personaId && member.nucleusId) continue;
    let ids;
    try {
      ids = await resolvePlayer(member.eaId);
    } catch (err) {
      console.warn(`  skipped (lookup failed twice): ${member.eaId} — ${(err as Error).message}`);
      failed.add(member.eaId);
      continue;
    }
    if (ids) {
      member.personaId = ids.personaId;
      member.nucleusId = ids.nucleusId;
      resolvedCount++;
    } else {
      console.warn(`  unresolved: ${member.eaId}`);
    }
  }
  console.log(`Resolved ${resolvedCount} new member(s)`);

  // Cache each member's in-game name once. One request per member who has
  // none yet, so the first run after this shipped pays for the whole roster
  // and every later run pays only for people who joined since.
  let namedCount = 0;
  let unanswered = 0;
  for (const member of roster) {
    // Re-ask for anyone still showing their EA ID. Two reasons: a member who
    // links a console account later starts showing the name people see, and a
    // name the matching rule once rejected is reconsidered when the rule
    // changes. Members already resolved to a platform name are never re-asked.
    if (!member.nucleusId) continue;
    if (member.inGameName && member.inGameName !== member.eaId) continue;
    let personas;
    try {
      personas = await fetchPersonas(member.nucleusId);
    } catch (err) {
      // The name is a cosmetic cache. A failed lookup leaves the EA ID
      // showing and is retried next run, the same as a throttled one — it
      // must never cost the member their stats, let alone everyone else's.
      console.warn(`  name lookup failed for ${member.eaId} — ${(err as Error).message}; retried next run`);
      unanswered++;
      continue;
    }
    // Empty is the throttled answer, not an answer. Leaving inGameName unset
    // means the board shows the EA ID today and this member is retried
    // tomorrow, which is the right trade against caching a wrong name.
    if (personas.length === 0) {
      unanswered++;
      continue;
    }
    const name = pickInGameNameFor(member.eaId, personas, member.platform);
    member.inGameName = name;
    member.inGamePlatform = personas.find((p) => p.displayName === name)?.platform ?? 'ea';
    if (name !== member.eaId) namedCount++;
    // The endpoint starts returning empty results when hit in a tight loop.
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`Named ${namedCount} member(s) by their in-game persona` +
    (unanswered > 0 ? `; ${unanswered} lookup(s) went unanswered, retried next run` : ''));

  const bulk = roster
    .filter((m) => !failed.has(m.eaId))
    .map(toBulkPlayer)
    .filter((p): p is NonNullable<typeof p> => p !== null);
  console.log(`Fetching stats for ${bulk.length} resolved member(s)`);
  const { responses, skipped } = await fetchBulkSkippingFailures(bulk);
  const eaIdByPersona = new Map(roster.filter((m) => m.personaId).map((m) => [m.personaId!, m.eaId]));
  for (const { player, error } of skipped) {
    const eaId = eaIdByPersona.get(player.player_id) ?? player.player_id;
    console.warn(`  skipped (stats fetch failed twice): ${eaId} — ${error.message}`);
    failed.add(eaId);
  }
  if (bulk.length > 0 && skipped.length > bulk.length * MAX_SKIPPED_SHARE) {
    throw new Error(
      `${skipped.length} of ${bulk.length} members could not be fetched — the API looks down, not flaky; keeping the last board`,
    );
  }
  if (failed.size > 0) {
    console.log(`Skipped ${failed.size} member(s) the API would not answer for; tried again next refresh`);
  }

  // The committed board is the archive: every season but the current one is
  // carried over from it untouched, because the API stops serving a season's
  // stats some time after it ends. See buildBoard.
  const previous: BoardFile | null = existsSync('data/board.json')
    ? JSON.parse(readFileSync('data/board.json', 'utf8'))
    : null;
  // The season's launch is recorded in meta. The feed normally carries it;
  // failing that, the last board's — but only for the same season, or a
  // rollover would inherit the finished season's date.
  const now = new Date();
  const seasonStart =
    startsAt ??
    (previous?.meta.currentSeason === currentSeason && previous.meta.seasonStart
      ? new Date(previous.meta.seasonStart)
      : null);
  if (seasonStart) {
    console.log(`${currentSeason} launched ${seasonStart.toISOString()}`);
  } else {
    console.warn('No launch date for the season from the feed or the last board');
  }
  const board = buildBoard(roster, responses, currentSeason, now, previous, failed, seasonStart);

  const ranked = board.seasons[currentSeason]?.length ?? 0;
  const prov = board.provisional[currentSeason]?.length ?? 0;
  console.log(`${currentSeason}: ${ranked} ranked, ${prov} provisional, ${board.unresolved.length} unresolved`);

  if (dryRun) {
    console.log('--dry-run: no files written');
    return;
  }

  // Persist newly resolved ids first, so the cache is kept even on a day when
  // no stat moved. These two fields are the only part of roster.json the build
  // may modify; every other field is human-authored.
  if (resolvedCount > 0 || roster.some((m) => m.inGameName)) {
    writeFileSync('roster.json', JSON.stringify(roster, null, 2) + '\n');
    console.log('Cached newly resolved ids into roster.json');
  }

  // Idempotence: builtAt changes on every run, so comparing whole files would
  // produce a commit every day even when no stat moved. Compare everything
  // except builtAt, and leave the files alone when nothing else changed.
  const stripClock = (b: BoardFile) => JSON.stringify({ ...b, meta: { ...b.meta, builtAt: '' } });
  if (previous) {
    if (stripClock(previous) === stripClock(board)) {
      console.log('No stat changes since the last run — leaving data/ untouched.');
      return;
    }
  }

  writeBoardFiles(board);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
