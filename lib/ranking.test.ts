// lib/ranking.test.ts
import { describe, it, expect } from 'vitest';
import { rankPlayers as rankFor, MIN_MATCHES } from './ranking';
import type { BoardRow } from './types';

const rankPlayers = (rows: BoardRow[]) => rankFor(rows, 'gauntlet');

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
  matches: 50, wins: 25, losses: 25, kills: 100, headshots: 25, deaths: 50, damage: 1000,
  assists: 0, revives: 0, score: 70000, timeSec: 6000,
  winPct: 50, kd: 2, killsPerMatch: 5, kpm: 1, dpm: 10, spm: 700, objPerMatch: 1.5, objPts: 900, objPtsPerHour: 60, top3Pct: null, top5Pct: null, top10Pct: null, top3: null, top5: null, top10: null, gold: null, silver: null, bronze: null, unplaced: null, placementPts: null, fightPts: null, kda: null, revivesPerHour: 3, rating: 50, standouts: [], sniperPct: 20, autoPct: 75, sniperKills: 20, autoKills: 75, sniperPerMatch: 1, autoPerMatch: 3.75, jetPct: 0, rank: null,
  ...over,
});

describe('rankPlayers', () => {
  it('uses a floor of 30 matches', () => {
    expect(MIN_MATCHES).toBe(30);
  });

  it('sorts by win percent descending', () => {
    const { ranked } = rankPlayers([
      row({ eaId: 'low', winPct: 40 }),
      row({ eaId: 'high', winPct: 80 }),
      row({ eaId: 'mid', winPct: 60 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['high', 'mid', 'low']);
  });

  it('assigns ranks starting at 1', () => {
    const { ranked } = rankPlayers([row({ eaId: 'a', winPct: 80 }), row({ eaId: 'b', winPct: 40 })]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('moves under-floor players to provisional', () => {
    const { ranked, provisional } = rankPlayers([
      row({ eaId: 'veteran', matches: MIN_MATCHES }),
      row({ eaId: 'rookie', matches: MIN_MATCHES - 1 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['veteran']);
    expect(provisional.map((r) => r.eaId)).toEqual(['rookie']);
  });

  it('leaves provisional ranks null', () => {
    const { provisional } = rankPlayers([row({ eaId: 'rookie', matches: 3 })]);
    expect(provisional[0].rank).toBeNull();
  });

  it('orders the ranked board by rating, not win rate alone', () => {
    // Identical win rates, so the order has to come from the other weighted
    // metrics — here K/D. Under the old win-rate-only rule these three were
    // interchangeable and fell back to match count.
    const { ranked } = rankPlayers([
      row({ eaId: 'middling', winPct: 50, matches: 40, kd: 3 }),
      row({ eaId: 'weakest', winPct: 50, matches: 80, kd: 1 }),
      row({ eaId: 'strongest', winPct: 50, matches: 40, kd: 5 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['strongest', 'middling', 'weakest']);
    expect(ranked[0].rating).toBeGreaterThan(ranked[2].rating!);
  });

  it('lets win rate outweigh a better K/D, since winning is the goal', () => {
    // Win rate carries 40% of the rating and K/D 15%, so a clearly better win
    // rate must beat a clearly better K/D.
    const { ranked } = rankPlayers([
      row({ eaId: 'fragger', winPct: 40, kd: 9 }),
      row({ eaId: 'winner', winPct: 90, kd: 1 }),
    ]);
    expect(ranked[0].eaId).toBe('winner');
  });

  it('orders provisional players by win rate, as they have no rating', () => {
    // Rating is a percentile against the ranked field, which they are not in.
    const { provisional } = rankPlayers([
      row({ eaId: 'low', winPct: 40, matches: 5 }),
      row({ eaId: 'high', winPct: 80, matches: 5 }),
    ]);
    expect(provisional.map((r) => r.eaId)).toEqual(['high', 'low']);
    expect(provisional[0].rating).toBeNull();
  });

  it('sorts null win percent last', () => {
    const { ranked } = rankPlayers([
      row({ eaId: 'none', winPct: null }),
      row({ eaId: 'some', winPct: 10 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['some', 'none']);
  });

  it('does not mutate its input', () => {
    const input = [row({ eaId: 'a', winPct: 10 }), row({ eaId: 'b', winPct: 90 })];
    rankPlayers(input);
    expect(input.map((r) => r.eaId)).toEqual(['a', 'b']);
    expect(input[0].rank).toBeNull();
  });

  it('handles an empty roster', () => {
    expect(rankPlayers([])).toEqual({ ranked: [], provisional: [] });
  });
});

describe('rankPlayers on a Rapid Royale board', () => {
  /** A hundred Trio matches: 20 wins, 40 top threes, 55 top fives — 525 points. */
  const trio = (over: Partial<BoardRow>): BoardRow =>
    row({ matches: 100, wins: 20, top3: 40, top5: 55, top10: 70, kills: 300, assists: 100, deaths: 200, rating: null, ...over });

  it('ranks only players with the match floor and a total above zero', () => {
    const { ranked, provisional } = rankFor(
      [
        trio({ eaId: 'positive' }),
        // −250 for 50 losses, +250 for 250 kills: exactly zero.
        trio({ eaId: 'zero', matches: 50, wins: 0, top3: 0, top5: 0, kills: 250, assists: 0, deaths: 0 }),
        trio({ eaId: 'negative', matches: 50, wins: 0, top3: 2, top5: 5, kills: 40, assists: 0, deaths: 90 }),
        trio({ eaId: 'rookie', matches: MIN_MATCHES - 1, top3: 10, top5: 12 }),
      ],
      'rapidRoyale',
    );
    expect(ranked.map((r) => r.eaId)).toEqual(['positive']);
    expect(ranked[0].rank).toBe(1);
    expect(provisional.map((r) => r.eaId)).toEqual(['rookie', 'zero', 'negative']);
    expect(provisional.map((r) => r.rank)).toEqual([null, null, null]);
    expect(provisional.map((r) => r.rating)).toEqual([expect.any(Number), 0, -255]);
  });

  it('orders by points, then gold, then fight points, then EA ID', () => {
    // All three total 525: more-gold trades 25 fight points for one more win
    // (placement 400, fights 125); a and b are identical but for their IDs.
    const { ranked } = rankFor(
      [trio({ eaId: 'b' }), trio({ eaId: 'a' }), trio({ eaId: 'more-gold', wins: 21, top3: 41, top5: 56, kills: 275 })],
      'rapidRoyale',
    );
    expect(ranked.map((r) => r.rating)).toEqual([525, 525, 525]);
    expect(ranked.map((r) => r.eaId)).toEqual(['more-gold', 'a', 'b']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('sends a player whose placement failed the trust test to Provisional, last', () => {
    const { ranked, provisional } = rankFor(
      [trio({ eaId: 'ok' }), trio({ eaId: 'broken', top5: null, top5Pct: null }), trio({ eaId: 'rookie', matches: 5 })],
      'rapidRoyale',
    );
    expect(ranked.map((r) => r.eaId)).toEqual(['ok']);
    expect(provisional.map((r) => r.eaId)).toEqual(['rookie', 'broken']);
    expect(provisional[1].rating).toBeNull();
  });

  it('leaves no badges on a Rapid Royale row', () => {
    expect(rankFor([trio({ eaId: 'x', standouts: ['kd'] })], 'rapidRoyale').ranked[0].standouts).toEqual([]);
  });

  it('uses Solo\'s wider rungs on the Solo board', () => {
    const { ranked } = rankFor([trio({ eaId: 's' })], 'rapidRoyaleSolo');
    expect(ranked[0]).toMatchObject({ gold: 20, silver: 35, bronze: 15, unplaced: 30, rating: 750 });
  });
});
