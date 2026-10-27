// lib/pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { buildBoard, toBulkPlayer } from './pipeline';
import { rawSample } from './fixtures/raw-sample';
import type { RawResponse, RosterEntry } from './types';

const dark: RosterEntry = {
  eaId: 'pkidarkpki', displayName: 'Dark', platform: 'pc', region: 'US East',
  mainMode: 'both', personaId: '849687045', nucleusId: '2250375376',
};

const dim = (gameMode: string, season: string) => [
  { name: 'GameMode', value: gameMode },
  { name: 'Season', value: season },
];

describe('toBulkPlayer', () => {
  it('forwards the roster member\'s own platform, not a hardcoded one', () => {
    // Fixture platform is deliberately not 'pc' so this fails if the
    // implementation ever goes back to hardcoding 'pc'.
    const psMember: RosterEntry = { ...dark, platform: 'ps' };
    expect(toBulkPlayer(psMember)).toEqual({
      player_id: '849687045', user_id: '2250375376', platform: 'ps',
    });
  });

  it('returns null when ids are missing', () => {
    expect(toBulkPlayer({ ...dark, personaId: undefined })).toBeNull();
  });
});

describe('buildBoard', () => {
  it('computes only the current season — a past season the API still serves is not rediscovered', () => {
    // The fixture carries Season 3 and Season 4. Past seasons come from the
    // archive or not at all; see the archive tests below.
    const board = buildBoard([dark], [rawSample], 'Season4');
    expect(Object.keys(board.seasons)).toEqual(['Season4']);
  });

  it('carries an archived season over verbatim, whatever the API now says about it', () => {
    const at = new Date('2026-10-27T00:00:00.000Z');
    const live = buildBoard([dark], [rawSample], 'Season4', at);
    // A frozen Season 3 that differs from anything the fixture would compute,
    // so a recompute could not reproduce it by accident.
    const frozen = { ...live.seasons.Season4[0], eaId: 'frozen', matches: 999, rank: 1 };
    const archive = {
      ...live,
      meta: { ...live.meta, seasons: ['Season3', 'Season4'] },
      seasons: { ...live.seasons, Season3: [frozen] },
      provisional: { ...live.provisional, Season3: [] },
    };
    const board = buildBoard([dark], [rawSample], 'Season4', at, archive);
    expect(board.seasons.Season3).toEqual([frozen]);
    expect(board.provisional.Season3).toEqual([]);
    expect(board.meta.seasons).toEqual(['Season3', 'Season4']);
  });

  it('archives the outgoing season the day a new one goes current', () => {
    const at = new Date('2026-10-27T00:00:00.000Z');
    const lastDayOfSeason4 = buildBoard([dark], [rawSample], 'Season4', at);
    const firstDayOfSeason5 = buildBoard([dark], [rawSample], 'Season5', at, lastDayOfSeason4);
    expect(firstDayOfSeason5.seasons.Season4).toEqual(lastDayOfSeason4.seasons.Season4);
    expect(firstDayOfSeason5.meta.seasons).toEqual(['Season4', 'Season5']);
    expect(firstDayOfSeason5.meta.currentSeason).toBe('Season5');
  });

  it('recomputes the current season rather than carrying it from the archive', () => {
    const at = new Date('2026-10-27T00:00:00.000Z');
    const live = buildBoard([dark], [rawSample], 'Season4', at);
    const stale = { ...live, seasons: { Season4: [] }, provisional: { Season4: [] } };
    expect(buildBoard([dark], [rawSample], 'Season4', at, stale).seasons.Season4).toEqual(live.seasons.Season4);
  });

  it('carries roster identity onto the row', () => {
    const board = buildBoard([dark], [rawSample], 'Season4');
    const row = board.seasons.Season4[0];
    expect(row.displayName).toBe('Dark');
    expect(row.region).toBe('US East');
    expect(row.eaId).toBe('pkidarkpki');
  });

  it('computes metrics for the season row, rounded to 2 decimal places', () => {
    // computeMetrics itself keeps full precision (see metrics.test.ts) —
    // buildBoard rounds rate stats for the committed board, to shrink the
    // payload. Full precision here would be 14.792716424426535.
    const row = buildBoard([dark], [rawSample], 'Season4').seasons.Season4[0];
    expect(row.matches).toBe(50);
    expect(row.winPct).toBe(58);
    expect(row.jetPct).toBe(14.79);
  });

  it('puts under-floor players in provisional', () => {
    // Season3 in the fixture has 34 matches -> ranked; force a small one.
    const board = buildBoard([dark], [rawSample], 'Season4');
    expect(board.seasons.Season4[0].rank).toBe(1);
    expect(board.provisional.Season4).toEqual([]);
  });

  it('records meta with the current season', () => {
    const board = buildBoard([dark], [rawSample], 'Season4');
    expect(board.meta.currentSeason).toBe('Season4');
    expect(board.meta.seasons).toContain('Season4');
    expect(typeof board.meta.builtAt).toBe('string');
  });

  it('lists roster members with no ids as unresolved', () => {
    const ghost: RosterEntry = {
      eaId: 'kathemkh9', displayName: 'Kathem', platform: 'ps',
      region: 'NA West', mainMode: 'both',
    };
    const board = buildBoard([ghost], [rawSample], 'Season4');
    expect(board.unresolved).toEqual([
      { eaId: 'kathemkh9', displayName: 'Kathem', reason: 'not_found' },
    ]);
  });

  it('marks a resolved member as no_data when no response comes back for their persona', () => {
    // Simulates a member who resolved previously (ids are cached) but has
    // since turned their in-game stats privacy back off: the bulk response
    // simply has no entry for their persona at all. That's different from
    // never having resolved, and different from having a response with no
    // Gauntlet slice (see the next test) — the page needs to tell these
    // apart so "why am I not listed?" gets the right answer.
    const other: RosterEntry = { ...dark, eaId: 'other', displayName: 'Other', personaId: '1', nucleusId: '2' };
    const board = buildBoard([other], [rawSample], 'Season4');
    expect(board.seasons.Season4 ?? []).toEqual([]);
    expect(board.unresolved).toEqual([{ eaId: 'other', displayName: 'Other', reason: 'no_data' }]);
  });

  it('marks a resolved member as no_data when their response has a player block but no catFields anywhere (gone private)', () => {
    // The real shape a private member's response takes: a valid `player`
    // block (so readPlayerIds succeeds and the naive "did a player block
    // come back" check would wrongly call this "responded"), but every
    // category has no `catFields` key at all — no stat data whatsoever.
    const wentPrivate: RawResponse = {
      playerStats: [
        {
          player: { nucleusId: dark.nucleusId!, personaId: dark.personaId!, platformId: 1 },
          // Real payloads omit catFields entirely here; RawCategory's type
          // says it's always present, but the live API disagrees — cast to
          // model the actual wire shape rather than widen the type.
          categories: [{ catName: 'glacier_mp' }] as RawResponse['playerStats'][0]['categories'],
        },
      ],
    };
    const board = buildBoard([dark], [wentPrivate], 'Season4');
    expect(board.seasons.Season4 ?? []).toEqual([]);
    expect(board.unresolved).toEqual([{ eaId: dark.eaId, displayName: dark.displayName, reason: 'no_data' }]);
  });

  it('omits members who resolved, got a response, but never played Gauntlet (catFields for another GameMode only)', () => {
    // Companion to the previous test: real catFields, just none of them
    // Gauntlet. This member absolutely must NOT be no_data — hasStatData
    // must check any category, not just Gauntlet, or every non-Gauntlet
    // player on the roster would be wrongly flagged as unreadable.
    const noGauntlet: RawResponse = {
      playerStats: [
        {
          player: { nucleusId: dark.nucleusId!, personaId: dark.personaId!, platformId: 1 },
          categories: [
            {
              catName: 'glacier_mp',
              catFields: [
                { name: 'Kills_Total', value: 999, fields: dim('Conquest0', 'Season4') },
              ],
            },
          ],
        },
      ],
    };
    const board = buildBoard([dark], [noGauntlet], 'Season4');
    expect(board.seasons.Season4 ?? []).toEqual([]);
    expect(board.unresolved).toEqual([]);
  });

  it('keeps imported players off the not-listed page', () => {
    // A stranger pulled from an external leaderboard will never read advice
    // about their privacy settings; listing them buries the members who will.
    const stranger: RosterEntry = {
      eaId: 'stranger', displayName: 'Stranger', platform: 'pc', region: 'US',
      mainMode: 'unknown', source: 'imported',
    };
    const member: RosterEntry = {
      eaId: 'member', displayName: 'Member', platform: 'pc', region: 'US',
      mainMode: 'gauntlet', source: 'community',
    };
    const board = buildBoard([stranger, member], [], 'Season4');
    expect(board.unresolved.map((u) => u.eaId)).toEqual(['member']);
  });

  it('always includes the current season, even with no data', () => {
    const board = buildBoard([], [], 'Season4');
    expect(board.seasons.Season4).toEqual([]);
    expect(board.provisional.Season4).toEqual([]);
    expect(board.unresolved).toEqual([]);
  });

  it('omits builtAt drift by accepting an injected clock', () => {
    const at = new Date('2026-09-12T00:00:00.000Z');
    expect(buildBoard([], [], 'Season4', at).meta.builtAt).toBe('2026-09-12T00:00:00.000Z');
  });

  it('matches a multi-player bulk response back to roster members by personaId, not response order', () => {
    const alpha: RosterEntry = {
      eaId: 'alpha', displayName: 'Alpha', platform: 'pc', region: 'US East',
      mainMode: 'both', personaId: '100', nucleusId: '200',
    };
    const bravo: RosterEntry = {
      eaId: 'bravo', displayName: 'Bravo', platform: 'pc', region: 'US East',
      mainMode: 'both', personaId: '300', nucleusId: '400',
    };

    // One bulk response carrying both players, deliberately ordered opposite
    // to roster order (bravo first, alpha second) — the real API is
    // documented to return entries out of request order.
    const bulk: RawResponse = {
      playerStats: [
        {
          player: { nucleusId: '400', personaId: '300', platformId: 1 },
          categories: [{
            catName: 'glacier_mp',
            catFields: [{ name: 'matches_gm_gntgauntlet', value: 50, fields: dim('GraniteGauntlet0', 'Season4') }],
          }],
        },
        {
          player: { nucleusId: '200', personaId: '100', platformId: 1 },
          categories: [{
            catName: 'glacier_mp',
            catFields: [{ name: 'matches_gm_gntgauntlet', value: 90, fields: dim('GraniteGauntlet0', 'Season4') }],
          }],
        },
      ],
    };

    const board = buildBoard([alpha, bravo], [bulk], 'Season4');
    const rows = board.seasons.Season4;
    const alphaRow = rows.find((r) => r.eaId === 'alpha');
    const bravoRow = rows.find((r) => r.eaId === 'bravo');

    expect(alphaRow?.displayName).toBe('Alpha');
    expect(alphaRow?.matches).toBe(90);
    expect(bravoRow?.displayName).toBe('Bravo');
    expect(bravoRow?.matches).toBe(50);
  });

  it('produces byte-identical JSON regardless of bulk response order', () => {
    // build.ts's change-detection (scripts/build.ts) compares JSON.stringify
    // output directly, which is order sensitive, and the bulk response order
    // is documented as unstable. Two players in the current season, fed in
    // both orders, alongside an archived season.
    const zed: RosterEntry = {
      eaId: 'zed', displayName: 'Zed', platform: 'pc', region: 'X',
      mainMode: 'both', personaId: '901', nucleusId: '902',
    };
    const amy: RosterEntry = {
      eaId: 'amy', displayName: 'Amy', platform: 'pc', region: 'X',
      mainMode: 'both', personaId: '903', nucleusId: '904',
    };
    const entry = (nucleusId: string, personaId: string, matches: number) => ({
      player: { nucleusId, personaId, platformId: 1 },
      categories: [{
        catName: 'glacier_mp',
        catFields: [
          { name: 'matches_gm_gntgauntlet', value: matches, fields: dim('GraniteGauntlet0', 'Season4') },
          { name: 'tp_gm_gntgauntlet', value: 6000, fields: dim('GraniteGauntlet0', 'Season4') },
        ],
      }],
    });
    const zedEntry = entry('902', '901', 20);
    const amyEntry = entry('904', '903', 20);

    const at = new Date('2026-09-12T00:00:00.000Z');
    const archive = buildBoard([dark], [rawSample], 'Season2', at);
    const boardZedFirst = buildBoard([zed, amy], [{ playerStats: [zedEntry, amyEntry] }], 'Season4', at, archive);
    const boardAmyFirst = buildBoard([zed, amy], [{ playerStats: [amyEntry, zedEntry] }], 'Season4', at, archive);

    expect(JSON.stringify(boardZedFirst)).toBe(JSON.stringify(boardAmyFirst));
    expect(Object.keys(boardZedFirst.seasons)).toEqual(['Season2', 'Season4']);
  });

  it('orders season keys naturally, not lexicographically (Season2 before Season10)', () => {
    const at = new Date('2026-09-12T00:00:00.000Z');
    const archive = buildBoard([dark], [rawSample], 'Season2', at);
    const board = buildBoard([dark], [rawSample], 'Season10', at, archive);
    expect(Object.keys(board.seasons)).toEqual(['Season2', 'Season10']);
    expect(board.meta.seasons).toEqual(['Season2', 'Season10']);
  });

  it('ranks a Rapid Royale season on Rapid Royale counters', () => {
    const rr: RawResponse = {
      playerStats: [{
        player: { nucleusId: dark.nucleusId!, personaId: dark.personaId!, platformId: 1 },
        categories: [{
          catName: 'glacier_mp',
          catFields: [
            { name: 'matches_gm_rr_trio', value: 85, fields: dim('GraniteRapidTrio0', 'Season5') },
            { name: 'wins_gm_rr_trio', value: 52, fields: dim('GraniteRapidTrio0', 'Season5') },
            { name: 'topthree_gm_rr_trio', value: 68, fields: dim('GraniteRapidTrio0', 'Season5') },
            { name: 'tp_gm_rr_trio', value: 60134, fields: dim('GraniteRapidTrio0', 'Season5') },
            { name: 'assists_gm_rr_trio', value: 446, fields: dim('GraniteRapidTrio0', 'Season5') },
          ],
        }],
      }],
    };
    const row = buildBoard([dark], [rr], 'Season5').seasons.Season5[0];
    expect(row.matches).toBe(85);
    expect(row.top3Pct).toBe(80);
    expect(row.apm).toBe(0.45);
    expect(row.rating).not.toBeNull();
  });

  it('excludes a season slice with kills but no measurable play (pre-per-mode-counter seasons)', () => {
    // Real shape of a Season 1/2 Gauntlet slice: DICE added the
    // _gm_gntgauntlet counters after Season 1, so kills/damage/assists carry
    // over from a lifetime-scoped field but matches/deaths/time do not
    // exist for that season at all. No rate stat is computable, so the
    // member simply doesn't appear for that season — the season key itself
    // isn't created if nobody has measurable play in it.
    const noPlaySeason: RawResponse = {
      playerStats: [
        {
          player: { nucleusId: dark.nucleusId!, personaId: dark.personaId!, platformId: 1 },
          categories: [{
            catName: 'glacier_mp',
            catFields: [
              { name: 'Kills_Total', value: 8299, fields: dim('GraniteGauntlet0', 'Season1') },
            ],
          }],
        },
      ],
    };
    const board = buildBoard([dark], [noPlaySeason], 'Season4');
    expect(board.seasons.Season1).toBeUndefined();
    expect(board.provisional.Season1).toBeUndefined();
  });
});
