import { describe, it, expect } from 'vitest';
import { normalizeEaId, findByEaId, mergePlayer, placementOf, processJoin } from './join';
import { MIN_MATCHES } from './ranking';
import type { BoardFile, BoardRow, RawResponse, RosterEntry } from './types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
  matches: 100, wins: 50, losses: 50, kills: 1000, headshots: 200, deaths: 500, damage: 100000,
  assists: 100, revives: 50, score: 420000, timeSec: 36000,
  winPct: 50, kd: 2, killsPerMatch: 10, kpm: 1, dpm: 100, spm: 700, objPerMatch: 1.5, objPts: 9000, objPtsPerHour: 60, revivesPerHour: 5,
  rating: 50, standouts: [], sniperPct: 20, autoPct: 75, sniperKills: 200, autoKills: 750,
  sniperPerMatch: 2, autoPerMatch: 7.5, jetPct: 0, rank: null,
  ...over,
});

const board = (rows: BoardRow[], provisional: BoardRow[] = []): BoardFile => ({
  meta: { currentSeason: 'Season4', seasons: ['Season3', 'Season4'], builtAt: '2026-09-01T00:00:00.000Z' },
  seasons: { Season4: rows },
  provisional: { Season4: provisional },
  unresolved: [],
});

describe('normalizeEaId', () => {
  it('accepts a plain EA ID, trimming stray whitespace', () => {
    expect(normalizeEaId('  Conqueror ')).toBe('Conqueror');
    expect(normalizeEaId('D4NIM4L')).toBe('D4NIM4L');
    expect(normalizeEaId('a_b.c-d')).toBe('a_b.c-d');
  });

  it('rejects anything that could not be an EA ID', () => {
    // Too short, too long, illegal characters, and non-strings. Each of these
    // would cost an upstream request that was never going to resolve.
    expect(normalizeEaId('abc')).toBeNull();
    expect(normalizeEaId('a'.repeat(17))).toBeNull();
    expect(normalizeEaId('has space')).toBeNull();
    expect(normalizeEaId('semi;colon')).toBeNull();
    expect(normalizeEaId(42)).toBeNull();
    expect(normalizeEaId(undefined)).toBeNull();
  });
});

describe('findByEaId', () => {
  it('matches regardless of case', () => {
    const roster = [{ eaId: 'Conqueror' }] as RosterEntry[];
    expect(findByEaId(roster, 'CONQUEROR')).toBeDefined();
    expect(findByEaId(roster, 'someone-else')).toBeUndefined();
  });
});

describe('mergePlayer', () => {
  it('re-ranks the whole field rather than appending to the end', () => {
    const existing = board([
      row({ eaId: 'a', winPct: 40, rank: 1 }),
      row({ eaId: 'b', winPct: 30, rank: 2 }),
    ]);
    const addition = board([row({ eaId: 'new', winPct: 90, kd: 9, killsPerMatch: 40, kpm: 4, dpm: 900, spm: 1600, objPtsPerHour: 200, revivesPerHour: 20 })]);

    const merged = mergePlayer(existing, addition);
    const season = merged.seasons.Season4;

    expect(season.map((r) => r.eaId)).toEqual(['new', 'a', 'b']);
    expect(season.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('moves existing ratings, because rating is a percentile of the field', () => {
    const existing = board([row({ eaId: 'a', winPct: 40 }), row({ eaId: 'b', winPct: 30 })]);
    const before = existing.seasons.Season4.map((r) => r.rating);
    const merged = mergePlayer(existing, board([row({ eaId: 'new', winPct: 90 })]));
    const after = merged.seasons.Season4.filter((r) => r.eaId !== 'new').map((r) => r.rating);
    expect(after).not.toEqual(before);
  });

  it('puts a short-record player in the provisional section', () => {
    const merged = mergePlayer(
      board([row({ eaId: 'a' })]),
      board([row({ eaId: 'new', matches: MIN_MATCHES - 1 })]),
    );
    expect(merged.seasons.Season4.map((r) => r.eaId)).toEqual(['a']);
    expect(merged.provisional.Season4.map((r) => r.eaId)).toEqual(['new']);
  });

  it('takes the current season from the live fetch, not the committed board', () => {
    // A signup on rollover day knows the new season before the daily build
    // has run; keeping the board's stale value would open it on a finished one.
    const existing = board([row({ eaId: 'a' })]);
    const addition: BoardFile = {
      ...board([row({ eaId: 'new' })]),
      meta: { currentSeason: 'Season5', seasons: ['Season5'], builtAt: '2026-09-02T00:00:00.000Z' },
      seasons: { Season5: [row({ eaId: 'new' })] },
      provisional: {},
    };
    expect(mergePlayer(existing, addition).meta.currentSeason).toBe('Season5');
  });

  it('learns a season the board has never shown', () => {
    const existing = board([row({ eaId: 'a' })]);
    const addition: BoardFile = {
      ...board([]),
      meta: { currentSeason: 'Season4', seasons: ['Season5'], builtAt: '2026-09-02T00:00:00.000Z' },
      seasons: { Season5: [row({ eaId: 'new' })] },
      provisional: {},
    };
    const merged = mergePlayer(existing, addition);
    expect(merged.meta.seasons).toEqual(['Season3', 'Season4', 'Season5']);
    expect(merged.seasons.Season5.map((r) => r.eaId)).toEqual(['new']);
  });

  it('keeps existing players in a season the new player has no data for', () => {
    const existing: BoardFile = { ...board([row({ eaId: 'a' })]), seasons: { Season3: [row({ eaId: 'a' })], Season4: [row({ eaId: 'a' })] } };
    const merged = mergePlayer(existing, board([row({ eaId: 'new' })]));
    expect(merged.seasons.Season3.map((r) => r.eaId)).toEqual(['a']);
  });
});

describe('placementOf', () => {
  it('reports a rank for a ranked player and null for a provisional one', () => {
    const b = board([row({ eaId: 'a', rank: 1, rating: 70 })], [row({ eaId: 'p', matches: 3 })]);
    expect(placementOf(b, 'a')).toMatchObject({ rank: 1, rating: 70, provisional: false });
    expect(placementOf(b, 'p')).toMatchObject({ rank: null, provisional: true, matches: 3 });
    expect(placementOf(b, 'nobody')).toBeNull();
  });
});

// A slice shaped like the real thing: mode-suffixed counters inside a
// Gauntlet/Season4 dimensioned fact row.
const rawFor = (personaId: string, matches = 100): RawResponse => ({
  playerStats: [
    {
      // buildBoard matches a response back to its roster entry through
      // readPlayerIds, which reads playerStats[0].player — not a bare id.
      player: { personaId, nucleusId: '456', platformId: 2 },
      categories: [
        {
          catName: 'gauntlet',
          catFields: [
            { name: 'matches_gm_gntgauntlet', value: matches, fields: [{ name: 'GameMode', value: 'GraniteGauntlet0' }, { name: 'Season', value: 'Season4' }] },
            { name: 'wins_gm_gntgauntlet', value: matches / 2, fields: [{ name: 'GameMode', value: 'GraniteGauntlet0' }, { name: 'Season', value: 'Season4' }] },
            { name: 'kills_gm_gntgauntlet', value: 1000, fields: [{ name: 'GameMode', value: 'GraniteGauntlet0' }, { name: 'Season', value: 'Season4' }] },
            { name: 'deaths_gm_gntgauntlet', value: 500, fields: [{ name: 'GameMode', value: 'GraniteGauntlet0' }, { name: 'Season', value: 'Season4' }] },
            { name: 'timeplayed_gm_gntgauntlet', value: 36000, fields: [{ name: 'GameMode', value: 'GraniteGauntlet0' }, { name: 'Season', value: 'Season4' }] },
          ],
        },
      ],
    },
  ],
});

const deps = (over: Partial<Parameters<typeof processJoin>[1]> = {}, state = { roster: [] as RosterEntry[], board: board([row({ eaId: 'a' })]), commits: [] as { files: { path: string; content: string }[]; message: string }[] }) => ({
  state,
  deps: {
    readFile: async (path: string) =>
      path === 'roster.json' ? JSON.stringify(state.roster) : JSON.stringify(state.board),
    commitFiles: async (files: { path: string; content: string }[], message: string) => {
      state.commits.push({ files, message });
      state.roster = JSON.parse(files.find((f) => f.path === 'roster.json')!.content);
      state.board = JSON.parse(files.find((f) => f.path === 'data/board.json')!.content);
      return 'sha';
    },
    resolvePlayer: async () => ({ personaId: '123', nucleusId: '456' }),
    fetchPersonas: async () => [{ displayName: 'Newbie', platform: 'ea' }],
    fetchBulk: async () => [rawFor('123')],
    currentSeason: async () => 'Season4',
    now: () => new Date('2026-09-15T00:00:00.000Z'),
    ...over,
  },
});

describe('processJoin', () => {
  it('adds a resolvable player to the roster and the board in one commit', async () => {
    const { state, deps: d } = deps();
    const result = await processJoin('Newbie', d);

    expect(result.ok).toBe(true);
    expect(state.commits).toHaveLength(1);
    // One commit, not one per file: the roster must never name a player the
    // board does not have, however briefly.
    const paths = state.commits[0].files.map((f) => f.path);
    expect(paths).toContain('roster.json');
    expect(paths).toContain('data/board.json');
    expect(paths).toContain('data/season4.json');
    expect(state.roster.map((m) => m.eaId)).toEqual(['Newbie']);
    expect(state.roster[0].source).toBe('selfserve');
  });

  it('records the name shown in game, not the EA ID they typed', async () => {
    const { state, deps: d } = deps({
      fetchPersonas: async () => [
        { displayName: 'Newbie', platform: 'steam' },
        { displayName: 'Newbie_9', platform: 'ea' },
      ],
    });
    await processJoin('Newbie_9', d);
    expect(state.roster[0]).toMatchObject({
      eaId: 'Newbie_9',
      inGameName: 'Newbie',
      inGamePlatform: 'steam',
    });
  });

  it('still signs someone up when the persona lookup fails', async () => {
    // A nicer label is worth a request; it is not worth the signup.
    const { state, deps: d } = deps({
      fetchPersonas: async () => {
        throw new Error('gametools down');
      },
    });
    const result = await processJoin('Newbie', d);
    expect(result.ok).toBe(true);
    // Left unresolved rather than recorded as checked: the endpoint answers
    // 200 with an empty list when throttled, and caching the EA ID from that
    // would make a temporary failure permanent. The board falls back to the
    // EA ID for display and the next build resolves them.
    expect(state.roster[0].inGameName).toBeUndefined();
  });

  it('reports where the player landed', async () => {
    const { deps: d } = deps();
    const result = await processJoin('Newbie', d);
    expect(result).toMatchObject({ ok: true, eaId: 'Newbie', season: 'Season4', provisional: false });
    if (result.ok) expect(result.rank).toBeGreaterThan(0);
  });

  it('refuses an EA ID that cannot be one, without calling upstream', async () => {
    let called = false;
    const { deps: d } = deps({ resolvePlayer: async () => { called = true; return null; } });
    const result = await processJoin('no', d);
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    expect(called).toBe(false);
  });

  it('refuses a player EA has never heard of', async () => {
    const { deps: d } = deps({ resolvePlayer: async () => null });
    expect(await processJoin('Ghosted', d)).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('refuses an account that shares no stats', async () => {
    const { deps: d } = deps({ fetchBulk: async () => [{ playerStats: [] }] });
    expect(await processJoin('Private1', d)).toMatchObject({ ok: false, reason: 'no_data' });
  });

  it('refuses someone already on the board, case-insensitively', async () => {
    const state = { roster: [{ eaId: 'newbie' } as RosterEntry], board: board([row({ eaId: 'a' })]), commits: [] as never[] };
    const { deps: d } = deps({}, state as never);
    expect(await processJoin('Newbie', d)).toMatchObject({ ok: false, reason: 'duplicate' });
  });

  it('refuses the same account signing up under a second EA ID', async () => {
    const state = { roster: [{ eaId: 'other', personaId: '123' } as RosterEntry], board: board([row({ eaId: 'a' })]), commits: [] as never[] };
    const { deps: d } = deps({}, state as never);
    expect(await processJoin('Newbie', d)).toMatchObject({ ok: false, reason: 'duplicate' });
  });

  it('retries on a lost race, re-reading the files before rebuilding', async () => {
    const { state, deps: d } = deps();
    let attempts = 0;
    const commitFiles = d.commitFiles;
    d.commitFiles = async (files, message) => {
      attempts++;
      if (attempts === 1) throw new Error('ref moved');
      return commitFiles(files, message);
    };

    const result = await processJoin('Newbie', d, (e) => (e as Error).message === 'ref moved');
    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
    expect(state.commits).toHaveLength(1);
  });

  it('gives up after repeated races rather than force-pushing', async () => {
    const { deps: d } = deps({
      commitFiles: async () => {
        throw new Error('ref moved');
      },
    });
    const result = await processJoin('Newbie', d, (e) => (e as Error).message === 'ref moved');
    expect(result).toMatchObject({ ok: false, reason: 'busy' });
  });

  it('lets an unexpected failure through rather than reporting a false success', async () => {
    const { deps: d } = deps({
      commitFiles: async () => {
        throw new Error('GitHub 500');
      },
    });
    await expect(processJoin('Newbie', d)).rejects.toThrow('GitHub 500');
  });
});
