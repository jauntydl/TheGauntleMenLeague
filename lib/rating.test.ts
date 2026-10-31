import { describe, it, expect } from 'vitest';
import {
  percentile,
  rateAll as rateFor,
  RATING_WEIGHTS,
  ratedMetrics,
  confidenceGames,
  ownRateShare,
  shrinkRate,
  weekOfSeason,
  CONFIDENCE_GAMES_PER_WEEK,
  FALLBACK_CONFIDENCE_GAMES,
} from './rating';

const rateAll = (rows: BoardRow[]) => rateFor(rows, 'gauntlet');
import type { BoardRow } from './types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
  matches: 50, wins: 25, losses: 25, kills: 100, headshots: 25, deaths: 50, damage: 1000,
  assists: 0, revives: 0, score: 42000, timeSec: 3600,
  winPct: 50, kd: 2, killsPerMatch: 5, kpm: 1, dpm: 10, spm: 700, objPerMatch: 1.5, objPts: 900, objPtsPerHour: 60, top3Pct: null, kda: null,
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

describe('confidenceGames', () => {
  const launch = new Date('2026-10-13T12:00:00Z');

  it('is 10 in launch week and climbs by 10 each week', () => {
    expect(CONFIDENCE_GAMES_PER_WEEK).toBe(10);
    expect(weekOfSeason(launch, launch)).toBe(1);
    expect(confidenceGames(launch, launch)).toBe(10);
    expect(confidenceGames(launch, new Date('2026-10-20T11:59:00Z'))).toBe(10);
    expect(confidenceGames(launch, new Date('2026-10-20T12:00:00Z'))).toBe(20);
    expect(weekOfSeason(launch, new Date('2026-10-31T00:00:00Z'))).toBe(3);
    expect(confidenceGames(launch, new Date('2026-10-31T00:00:00Z'))).toBe(30);
  });

  it('never drops below launch week, even before launch', () => {
    expect(weekOfSeason(launch, new Date('2026-10-01T00:00:00Z'))).toBe(1);
    expect(confidenceGames(launch, new Date('2026-10-01T00:00:00Z'))).toBe(10);
  });

  it('has a fallback for a season whose launch is unknown', () => {
    expect(FALLBACK_CONFIDENCE_GAMES).toBe(30);
  });
});

describe('shrinkRate', () => {
  it('counts a rate for the games behind it: half at K games', () => {
    expect(ownRateShare(30, 30)).toBeCloseTo(0.5);
    expect(ownRateShare(90, 30)).toBeCloseTo(0.75);
    expect(ownRateShare(300, 30)).toBeCloseTo(10 / 11);
  });

  it('pulls a short sample toward the field and leaves a long one nearly alone', () => {
    // 60% over 30 games with a 40% field: half yours, half theirs.
    expect(shrinkRate(60, 30, 40, 30)).toBeCloseTo(50);
    expect(shrinkRate(60, 300, 40, 30)).toBeCloseTo(58.18, 1);
  });
});

describe('rateAll', () => {
  it('rates the same good rate higher over more games, and the same bad rate lower', () => {
    // Three players identical on everything but win rate and games. The
    // average player anchors the field mean between the other two, so the
    // short sample is pulled toward it and the long one barely moves.
    const field = [
      row({ eaId: 'avg', matches: 100, winPct: 50 }),
      row({ eaId: 'luckyShort', matches: 30, winPct: 70 }),
      row({ eaId: 'provenLong', matches: 300, winPct: 70 }),
      row({ eaId: 'unluckyShort', matches: 30, winPct: 30 }),
      row({ eaId: 'provenBad', matches: 300, winPct: 30 }),
    ];
    const by = Object.fromEntries(rateFor(field, 'gauntlet', 30).map((r) => [r.eaId, r.rating!]));
    expect(by.provenLong).toBeGreaterThan(by.luckyShort);
    expect(by.provenBad).toBeLessThan(by.unluckyShort);
    // Without the weighting the pairs would tie: the raw rates are equal.
    const raw = Object.fromEntries(rateFor(field, 'gauntlet', 0).map((r) => [r.eaId, r.rating!]));
    expect(raw.provenLong).toBe(raw.luckyShort);
  });

  it('weights harder as K rises: a long 62% overtakes a short 66% once K is high enough', () => {
    const field = [
      row({ eaId: 'avg', matches: 100, winPct: 50 }),
      row({ eaId: 'short', matches: 30, winPct: 66 }),
      row({ eaId: 'long', matches: 300, winPct: 62 }),
    ];
    const by = (k: number) => Object.fromEntries(rateFor(field, 'gauntlet', k).map((r) => [r.eaId, r.rating!]));
    expect(by(0).short).toBeGreaterThan(by(0).long);
    expect(by(30).short).toBeGreaterThan(by(30).long);
    expect(by(90).long).toBeGreaterThan(by(90).short);
  });

  it('leaves badges on the raw figures — a badge marks what the board shows', () => {
    const field = [
      row({ eaId: 'a', matches: 100, winPct: 50 }),
      row({ eaId: 'b', matches: 100, winPct: 50 }),
      row({ eaId: 'c', matches: 100, winPct: 50 }),
      row({ eaId: 'd', matches: 100, winPct: 50 }),
      row({ eaId: 'e', matches: 100, winPct: 50 }),
      row({ eaId: 'f', matches: 100, winPct: 50 }),
      row({ eaId: 'g', matches: 100, winPct: 50 }),
      row({ eaId: 'h', matches: 100, winPct: 50 }),
      row({ eaId: 'i', matches: 100, winPct: 50 }),
      row({ eaId: 'short', matches: 30, winPct: 90 }),
    ];
    const short = rateFor(field, 'gauntlet', 300).find((r) => r.eaId === 'short')!;
    expect(short.standouts).toContain('winPct');
  });

  it('totals one in every mode, and weights each mode as set', () => {
    // The weights total one so the explainer's percentages add up on the page.
    for (const mode of ['gauntlet', 'rapidRoyale', 'rapidRoyaleSolo'] as const) {
      const weights = Object.values(RATING_WEIGHTS[mode]);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
    // Gauntlet: winning leads, objective work is second.
    const g = RATING_WEIGHTS.gauntlet;
    expect(g.winPct).toBe(Math.max(...Object.values(g)));
    expect(g.objPtsPerHour).toBe(Math.max(...Object.values(g).filter((w) => w !== g.winPct)));
    // Rapid Royale: every win is a top three, so placement splits evenly
    // rather than counting the win twice.
    for (const mode of ['rapidRoyale', 'rapidRoyaleSolo'] as const) {
      expect(RATING_WEIGHTS[mode].winPct).toBe(RATING_WEIGHTS[mode].top3Pct);
    }
    // Solo leans on kills.
    const s = RATING_WEIGHTS.rapidRoyaleSolo;
    expect(s.kpm).toBe(Math.max(...Object.values(s)));
  });

  it('rates the metrics the explainer promises, and nothing else', () => {
    // Pinned as a list, not just as a sum: dropping a metric or slipping an
    // unrated one in would otherwise still total 1 and pass silently.
    expect(Object.keys(RATING_WEIGHTS.gauntlet)).toEqual([
      'winPct', 'objPtsPerHour', 'kd', 'kpm', 'spm', 'revivesPerHour', 'dpm',
    ]);
    expect(Object.keys(RATING_WEIGHTS.rapidRoyale)).toEqual([
      'winPct', 'top3Pct', 'kda', 'kpm', 'spm', 'revivesPerHour', 'dpm',
    ]);
    expect(Object.keys(RATING_WEIGHTS.rapidRoyaleSolo)).toEqual([
      'winPct', 'top3Pct', 'kpm', 'kd', 'spm', 'dpm',
    ]);
  });

  it('rates Solo on plain K/D and leaves revives out — there is nobody to revive', () => {
    expect(RATING_WEIGHTS.rapidRoyaleSolo.kda).toBeUndefined();
    expect(RATING_WEIGHTS.rapidRoyaleSolo.revivesPerHour).toBeUndefined();
    expect(RATING_WEIGHTS.rapidRoyaleSolo.objPtsPerHour).toBeUndefined();
  });

  it('keeps Gauntlet\'s objective formula out of Rapid Royale, and top five out of both', () => {
    expect(RATING_WEIGHTS.rapidRoyale.objPtsPerHour).toBeUndefined();
    // Rapid Royale rates KDA in K/D's place; rating both would count kills twice.
    expect(RATING_WEIGHTS.rapidRoyale.kd).toBeUndefined();
    expect(Object.keys(RATING_WEIGHTS.gauntlet)).not.toContain('top3Pct');
  });

  it('lists a mode\'s rated metrics heaviest first', () => {
    const order = ratedMetrics('rapidRoyale');
    const w = RATING_WEIGHTS.rapidRoyale;
    for (let i = 1; i < order.length; i++) expect(w[order[i - 1]]!).toBeGreaterThanOrEqual(w[order[i]]!);
    expect(order[0]).toBe('kda');
    expect(ratedMetrics('rapidRoyaleSolo')[0]).toBe('kpm');
  });

  it('rates a Rapid Royale field on its own metrics', () => {
    // Identical on every Gauntlet metric, apart only on Rapid Royale ones.
    const [low, high] = rateFor([
      row({ eaId: 'low', top3Pct: 40, kda: 2 }),
      row({ eaId: 'high', top3Pct: 80, kda: 6 }),
    ], 'rapidRoyale');
    expect(high.rating!).toBeGreaterThan(low.rating!);
    const [a, b] = rateAll([
      row({ eaId: 'low', top3Pct: 40, kda: 2 }),
      row({ eaId: 'high', top3Pct: 80, kda: 6 }),
    ]);
    expect(a.rating).toBe(b.rating);
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
