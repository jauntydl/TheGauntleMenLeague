#!/usr/bin/env tsx
/**
 * Daily build: resolve roster ids, fetch the current season's stats, write data/.
 *
 *   npm run data          # write files
 *   npm run data:dry      # compute and report, write nothing
 *
 * Never exits non-zero because individual members were unresolved — that is
 * expected data (their in-game stats privacy is not set to Everyone).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fetchCurrentSeason, resolvePlayer, fetchBulk, fetchPersonas } from '../lib/gametools';
import { pickInGameNameFor } from '../lib/naming';
import { buildBoard, toBulkPlayer } from '../lib/pipeline';
import type { BoardFile, RosterEntry } from '../lib/types';

const dryRun = process.argv.includes('--dry-run');

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

  const currentSeason = await fetchCurrentSeason();
  console.log(`Current season: ${currentSeason}`);

  // Resolve only members we have not already cached ids for.
  let resolvedCount = 0;
  for (const member of roster) {
    if (member.personaId && member.nucleusId) continue;
    const ids = await resolvePlayer(member.eaId);
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
    const personas = await fetchPersonas(member.nucleusId);
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

  const bulk = roster.map(toBulkPlayer).filter((p): p is NonNullable<typeof p> => p !== null);
  console.log(`Fetching stats for ${bulk.length} resolved member(s)`);
  const responses = await fetchBulk(bulk);

  // The committed board is the archive: every season but the current one is
  // carried over from it untouched, because the API stops serving a season's
  // stats some time after it ends. See buildBoard.
  const previous: BoardFile | null = existsSync('data/board.json')
    ? JSON.parse(readFileSync('data/board.json', 'utf8'))
    : null;
  const board = buildBoard(roster, responses, currentSeason, new Date(), previous);

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

  mkdirSync('data', { recursive: true });

  // Single app-facing artifact: API routes import this statically, so no
  // filesystem access is needed at request time on Vercel.
  writeFileSync('data/board.json', JSON.stringify(board, null, 2) + '\n');

  // Per-season files as well, so day-to-day diffs stay readable in git history.
  for (const [season, rows] of Object.entries(board.seasons)) {
    writeFileSync(
      `data/${season.toLowerCase()}.json`,
      JSON.stringify({ season, rows, provisional: board.provisional[season] ?? [] }, null, 2) + '\n',
    );
  }
  writeFileSync('data/unresolved.json', JSON.stringify(board.unresolved, null, 2) + '\n');
  writeFileSync('data/meta.json', JSON.stringify(board.meta, null, 2) + '\n');

  console.log('Wrote data/board.json and per-season files');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
