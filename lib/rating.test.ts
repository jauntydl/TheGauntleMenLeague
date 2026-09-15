import { describe, it, expect } from 'vitest';
import { percentile, rateAll, RATING_WEIGHTS } from './rating';
import type { BoardRow } from './types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
  matches: 50, wins: 25, losses: 25, kills: 100, headshots: 25, deaths: 50, damage: 1000,
  assists: 0, revives: 0, score: 42000, timeSec: 3600,
  winPct: 50, kd: 2, killsPerMatch: 5, kpm: 1, dpm: 10, spm: 700, objPerMatch: 1.5, objPts: 900, objPtsPerHour: 60,
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
  it('weights winning highest', () => {
    // The invariant, not the figure: winning outweighs anything else, and the
    // weights total one so the explainer's percentages add up on the page.
    const weights = Object.values(RATING_WEIGHTS);
    // Winning leads outright; objective work is second and nothing else comes
    // near either of them.
    expect(RATING_WEIGHTS.winPct).toBe(Math.max(...weights));
    expect(RATING_WEIGHTS.objPtsPerHour).toBeLessThan(RATING_WEIGHTS.winPct);
    expect(RATING_WEIGHTS.objPtsPerHour).toBe(
      Math.max(...weights.filter((w) => w !== RATING_WEIGHTS.winPct)),
    );
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('rates the seven metrics the explainer promises, and nothing else', () => {
    // Pinned as a list, not just as a sum: dropping a metric or slipping an
    // unrated one in would otherwise still total 1 and pass silently.
    expect(Object.keys(RATING_WEIGHTS)).toEqual([
      'winPct', 'objPtsPerHour', 'kd', 'kpm', 'spm', 'revivesPerHour', 'dpm',
    ]);
  });

  it('scores a stronger player above a weaker one', () => {
    const [weak, strong] = rateAll([
      row({ eaId: 'weak', winPct: 20, kd: 1, kpm: 0.4, dpm: 5, spm: 200, objPtsPerHour: 12, revivesPerHour: 1 }),
      row({ eaId: 'strong', winPct: 90, kd: 5, kpm: 2.4, dpm: 400, spm: 1400, objPtsPerHour: 140, revivesPerHour: 9 }),
    ]);
    expect(strong.rating!).toBeGreaterThan(weak.rating!);
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
