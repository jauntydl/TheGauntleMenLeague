// lib/ledger.test.ts
import { describe, it, expect } from 'vitest';
import {
  PLACEMENT_POINTS,
  FIGHT_POINTS,
  MEDAL_RUNGS,
  LEDGER_FIELDS,
  isLedgerMode,
  medalCounts,
  ledgerOf,
  scoreLedger,
  ordinal,
  finishLabel,
  medalCaption,
  pointsEach,
  type Medal,
} from './ledger';
import type { BoardRow } from './types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
  matches: 50, wins: 25, losses: 25, kills: 100, headshots: 25, deaths: 50, damage: 1000,
  assists: 0, revives: 0, score: 70000, timeSec: 6000,
  winPct: 50, kd: 2, killsPerMatch: 5, kpm: 1, dpm: 10, spm: 700, objPerMatch: 1.5, objPts: 900, objPtsPerHour: 60,
  top3Pct: null, top5Pct: null, top10Pct: null, top3: null, top5: null, top10: null,
  gold: null, silver: null, bronze: null, unplaced: null, placementPts: null, fightPts: null, kda: null,
  revivesPerHour: 3, rating: null, standouts: [], sniperPct: 20, autoPct: 75, sniperKills: 20, autoKills: 75,
  sniperPerMatch: 1, autoPerMatch: 3.75, jetPct: 0, rank: null,
  ...over,
});

/** A hundred Trio matches: 20 wins, 40 top threes, 55 top fives, 70 top tens. */
const trio = (over: Partial<BoardRow>): BoardRow =>
  row({ matches: 100, wins: 20, top3: 40, top5: 55, top10: 70, kills: 300, assists: 100, deaths: 200, ...over });

const MEDALS: Medal[] = ['gold', 'silver', 'bronze', 'unplaced'];

describe('the ledger constants', () => {
  it("scores the owner's table: 15/10/5/−5 and 1/0.5/−1", () => {
    expect(PLACEMENT_POINTS).toEqual({ gold: 15, silver: 10, bronze: 5, unplaced: -5 });
    expect(FIGHT_POINTS).toEqual({ kill: 1, assist: 0.5, death: -1 });
    expect(MEDAL_RUNGS).toEqual({ rapidRoyale: { silver: 3, bronze: 5 }, rapidRoyaleSolo: { silver: 5, bronze: 10 } });
  });

  it('names the modes that keep a ledger, and the fields that carry a point value', () => {
    expect(isLedgerMode('rapidRoyale') && isLedgerMode('rapidRoyaleSolo') && !isLedgerMode('gauntlet')).toBe(true);
    expect(LEDGER_FIELDS).toEqual(['gold', 'silver', 'bronze', 'unplaced', 'kills', 'assists', 'deaths']);
  });
});

describe('medalCounts and ledgerOf', () => {
  it('derives Trio medals from wins, top three and top five', () => {
    expect(medalCounts(trio({}), 'rapidRoyale')).toEqual({ gold: 20, silver: 20, bronze: 15, unplaced: 45 });
    expect(ledgerOf(trio({}), 'rapidRoyale')).toEqual({
      gold: 20, silver: 20, bronze: 15, unplaced: 45, placementPts: 350, fightPts: 150, rating: 500,
    });
  });

  it('derives Solo medals from wins, top five and top ten — same points, wider rungs', () => {
    expect(ledgerOf(trio({}), 'rapidRoyaleSolo')).toEqual({
      gold: 20, silver: 35, bronze: 15, unplaced: 30, placementPts: 575, fightPts: 150, rating: 725,
    });
  });

  it('goes negative for a player below break-even', () => {
    const l = ledgerOf(trio({ matches: 50, wins: 0, top3: 2, top5: 5, kills: 40, assists: 0, deaths: 90 }), 'rapidRoyale');
    expect(l).toMatchObject({ placementPts: -190, fightPts: -50, rating: -240 });
  });

  it('keeps the half point an assist earns', () => {
    expect(ledgerOf(trio({ assists: 1 }), 'rapidRoyale')!.fightPts).toBe(300 + 0.5 - 200);
  });

  it('derives counts from the stored rates when the counts are absent', () => {
    // A row committed before 2026-11-09: rates to two decimals, no counts.
    const old = {
      ...trio({}), top3: undefined, top5: undefined, top10: undefined, top3Pct: 40, top5Pct: 55, top10Pct: 70,
    } as unknown as BoardRow;
    expect(medalCounts(old, 'rapidRoyale')).toEqual(medalCounts(trio({}), 'rapidRoyale'));
    // Antimere99's real Season 5 row: 289 matches, 84.08% / 91.7% to two decimals.
    const antimere = {
      ...trio({ matches: 289, wins: 187 }), top3: undefined, top5: undefined, top3Pct: 84.08, top5Pct: 91.7,
    } as unknown as BoardRow;
    expect(medalCounts(antimere, 'rapidRoyale')).toEqual({ gold: 187, silver: 56, bronze: 22, unplaced: 24 });
  });

  it('returns null when a rung the mode needs is untrusted', () => {
    expect(ledgerOf(trio({ top5: null, top5Pct: null }), 'rapidRoyale')).toBeNull();
    expect(ledgerOf(trio({ top5: null, top5Pct: null }), 'rapidRoyaleSolo')).toBeNull();
    // Trio never reads the top ten.
    expect(ledgerOf(trio({ top10: null, top10Pct: null }), 'rapidRoyale')).not.toBeNull();
  });
});

describe('scoreLedger', () => {
  it('scores every row, fills the ledger fields and clears badges', () => {
    const [a, b] = scoreLedger(
      [trio({ eaId: 'a', standouts: ['kd'] }), trio({ eaId: 'b', top5: null, top5Pct: null })],
      'rapidRoyale',
    );
    expect(a).toMatchObject({
      gold: 20, silver: 20, bronze: 15, unplaced: 45, placementPts: 350, fightPts: 150, rating: 500, standouts: [],
    });
    expect(b).toMatchObject({
      gold: null, silver: null, bronze: null, unplaced: null, placementPts: null, fightPts: null, rating: null,
    });
  });

  it('does not mutate its input', () => {
    const input = [trio({ eaId: 'a' })];
    scoreLedger(input, 'rapidRoyale');
    expect(input[0].rating).toBeNull();
  });
});

describe('labels', () => {
  it('labels finishes by mode', () => {
    expect(MEDALS.map((m) => finishLabel('rapidRoyale', m))).toEqual([
      '1st place', '2nd–3rd place', '4th–5th place', '6th or worse',
    ]);
    expect(MEDALS.map((m) => finishLabel('rapidRoyaleSolo', m))).toEqual([
      '1st place', '2nd–5th place', '6th–10th place', '11th or worse',
    ]);
  });

  it('captions the medal columns by what finish earns them', () => {
    const medals: Medal[] = ['gold', 'silver', 'bronze'];
    expect(medals.map((m) => medalCaption('rapidRoyale', m))).toEqual(['Winner', 'Top 3', 'Top 5']);
    expect(medals.map((m) => medalCaption('rapidRoyaleSolo', m))).toEqual(['Winner', 'Top 5', 'Top 10']);
    expect(medalCaption('rapidRoyale', 'unplaced')).toBe('Losses');
  });

  it('labels point values with a true minus sign', () => {
    expect([15, 0.5, -5].map(pointsEach)).toEqual(['+15 each', '+0.5 each', '−5 each']);
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
  });
});
