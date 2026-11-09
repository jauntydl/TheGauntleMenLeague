import { describe, it, expect } from 'vitest';
import { percentile, rateAll as rateFor, RATING_WEIGHTS, STANDOUT_TRAITS, ratedMetrics } from './rating';

const rateAll = (rows: BoardRow[]) => rateFor(rows, 'gauntlet');
import type { BoardRow } from './types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
  matches: 50, wins: 25, losses: 25, kills: 100, headshots: 25, deaths: 50, damage: 1000,
  assists: 0, revives: 0, score: 42000, timeSec: 3600,
  winPct: 50, kd: 2, killsPerMatch: 5, kpm: 1, dpm: 10, spm: 700, objPerMatch: 1.5, objPts: 900, objPtsPerHour: 60, top3Pct: null, top5Pct: null, top10Pct: null, top3: null, top5: null, top10: null, gold: null, silver: null, bronze: null, unplaced: null, placementPts: null, fightPts: null, kda: null,
  revivesPerHour: 3, rating: null, standouts: [], sniperPct: 20, autoPct: 75, sniperKills: 20, autoKills: 75, sniperPerMatch: 1, autoPerMatch: 3.75, jetPct: 0, rank: null,
  ...over,
});

describe('percentile', () => {
  it('places the best value at the top', () => {
    expect(percentile([1, 2, 3], 3)).toBeCloseTo((2 + 0.5) / 3 * 100, 6);
  });

  it('gives tied values the same score rather than an arbitrary winner', () => {
    expect(percentile([5, 5, 5], 5)).toBe(50);
  });

  it('scores a lone player as average, not as best', () => {
    // With nobody to compare against, "best in the field" would be a lie.
    expect(percentile([7], 7)).toBe(50);
  });

  it('handles an empty population', () => {
    expect(percentile([], 1)).toBe(50);
  });
});

describe('rateAll', () => {
  it('weights Gauntlet as set, totalling one, and rates Rapid Royale on no weights at all', () => {
    // The weights total one so the explainer's percentages add up on the page.
    const g = RATING_WEIGHTS.gauntlet;
    expect(Object.values(g).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    // Gauntlet: winning leads, objective work is second.
    expect(g.winPct).toBe(Math.max(...Object.values(g)));
    expect(g.objPtsPerHour).toBe(Math.max(...Object.values(g).filter((w) => w !== g.winPct)));
    // Rapid Royale is ranked on the points ledger (lib/ledger.ts) since
    // 2026-11-09, so neither board carries a weight; the table and the
    // explainer read the ledger instead.
    expect(RATING_WEIGHTS.rapidRoyale).toEqual({});
    expect(RATING_WEIGHTS.rapidRoyaleSolo).toEqual({});
  });

  it('rates the metrics the explainer promises, and nothing else', () => {
    // Pinned as a list, not just as a sum: dropping a metric or slipping an
    // unrated one in would otherwise still total 1 and pass silently.
    expect(Object.keys(RATING_WEIGHTS.gauntlet)).toEqual([
      'winPct', 'objPtsPerHour', 'kd', 'kpm', 'spm', 'revivesPerHour', 'dpm',
    ]);
    for (const m of ['top3Pct', 'top5Pct', 'top10Pct', 'kda', 'wins']) {
      expect(Object.keys(RATING_WEIGHTS.gauntlet)).not.toContain(m);
    }
  });

  it('lists a mode\'s rated metrics heaviest first', () => {
    const order = ratedMetrics('gauntlet');
    const w = RATING_WEIGHTS.gauntlet;
    for (let i = 1; i < order.length; i++) expect(w[order[i - 1]]!).toBeGreaterThanOrEqual(w[order[i]]!);
    expect(order[0]).toBe('winPct');
    expect(order.at(-1)).toBe('dpm');
    expect(ratedMetrics('rapidRoyale')).toEqual([]);
  });

  it('keeps total wins out of the badge set — it left with the Rapid Royale weights', () => {
    expect(STANDOUT_TRAITS).not.toContain('wins');
    expect(STANDOUT_TRAITS).toContain('killsPerMatch');
  });

  it('awards a badge to the top tenth of the field on a stat, on the raw figures', () => {
    const field = [
      ...'abcdefghi'.split('').map((id) => row({ eaId: id, matches: 100, winPct: 50 })),
      row({ eaId: 'short', matches: 30, winPct: 90 }),
    ];
    const rated = rateAll(field);
    expect(rated.find((r) => r.eaId === 'short')!.standouts).toContain('winPct');
    expect(rated.find((r) => r.eaId === 'a')!.standouts).not.toContain('winPct');
  });

  it('scores a stronger player above a weaker one', () => {
    const [weak, strong] = rateAll([
      row({ eaId: 'weak', winPct: 20, kd: 1, kpm: 0.4, dpm: 5, spm: 200, objPtsPerHour: 12, revivesPerHour: 1 }),
      row({ eaId: 'strong', winPct: 90, kd: 5, kpm: 2.4, dpm: 400, spm: 1400, objPtsPerHour: 140, revivesPerHour: 9 }),
    ]);
    expect(strong.rating!).toBeGreaterThan(weak.rating!);
  });

  it('scores the raw figures — the same rate over more games rates the same', () => {
    // The games-blended rating left with the Rapid Royale weights on
    // 2026-11-09; Gauntlet's archive was never rated with it.
    const [short, long] = rateAll([row({ eaId: 'short', matches: 30, winPct: 70 }), row({ eaId: 'long', matches: 300, winPct: 70 })]);
    expect(short.rating).toBe(long.rating);
  });

  it('drops a missing metric instead of scoring it as bad', () => {
    // A null must not drag someone down: the weight is removed and the rest
    // renormalised, so an otherwise identical player rates the same.
    const [withAll, withNull] = rateAll([
      row({ eaId: 'a', dpm: 10 }),
      row({ eaId: 'b', dpm: null }),
    ]);
    expect(withNull.rating).toBeCloseTo(withAll.rating!, 6);
  });

  it('returns null when a player has no rateable metric at all', () => {
    const [only] = rateAll([
      row({ winPct: null, kd: null, kpm: null, dpm: null, spm: null, objPtsPerHour: null, revivesPerHour: null }),
    ]);
    expect(only.rating).toBeNull();
  });

  it('rounds the rating so the committed board stays readable', () => {
    const rated = rateAll([
      row({ eaId: 'a', winPct: 10 }), row({ eaId: 'b', winPct: 20 }),
      row({ eaId: 'c', winPct: 30 }), row({ eaId: 'd', winPct: 40 }),
      row({ eaId: 'e', winPct: 50 }), row({ eaId: 'f', winPct: 60 }),
      row({ eaId: 'g', winPct: 70 }),
    ]);
    for (const r of rated) {
      expect(String(r.rating).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    }
  });

  it('keeps every rating within 0-100', () => {
    const rated = rateAll([
      row({ eaId: 'a', winPct: 0, kd: 0 }),
      row({ eaId: 'b', winPct: 100, kd: 99 }),
      row({ eaId: 'c', winPct: 55, kd: 3 }),
    ]);
    for (const r of rated) {
      expect(r.rating!).toBeGreaterThanOrEqual(0);
      expect(r.rating!).toBeLessThanOrEqual(100);
    }
  });
});
