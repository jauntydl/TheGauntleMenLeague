import type { BoardRow } from './types';
import type { ModeKey } from './modes';

/**
 * How much each metric contributes to the overall rating, per mode.
 *
 * Gauntlet (Seasons 3-4, archived). Winning leads at 35% because it is the actual goal, with objective work
 * behind it at 15%. Gauntlet eliminates squads on objective points, so the
 * rate at which someone does that work is the nearest thing to the win that is
 * attributable to one player — a win is shared with three teammates, an
 * objective held is not.
 *
 * The remaining half splits across how a player fights. Three carry equal
 * weight: staying alive (K/D), killing at a rate a long match cannot inflate
 * (kills per minute), and score per minute, which picks up the spotting and
 * support work no other field here sees. Reviving is just under them. Damage
 * stays a token weight because it is already counted once inside the kills it
 * sets up.
 *
 * Kills per minute rather than kills per match: every other rate in the
 * rating is per unit of time, and a Gauntlet match has no fixed length, so
 * per-match rewards whoever survives into long rounds — which win rate
 * already measures. Kills per match keeps its badge; see STANDOUT_TRAITS.
 */
const GAUNTLET_WEIGHTS = {
  winPct: 0.35,
  objPtsPerHour: 0.15,
  kd: 0.12,
  kpm: 0.12,
  spm: 0.12,
  revivesPerHour: 0.1,
  dpm: 0.04,
} as const;

/**
 * Rapid Royale Trio (Season 5 on). Set 2026-10-27; total wins added
 * 2026-11-06.
 *
 * Placement is 35%: the win at 15%, finishing top three at 15%, and total
 * wins at 5%. Every win is also a top three, so a heavy win weight counts
 * the same win twice; the even split lets the top-three rate separate
 * someone who goes deep every match from someone who wins some and drops
 * early in the rest. The two rates are held to 30% deliberately. A win and a
 * top three are shared with two teammates, so both say as much about who you
 * queued with as about you — the rest goes to what is yours alone. Top five
 * was considered and left out; it nests a third time.
 *
 * Total wins is the one count in the rating, and it is there for a
 * different reason: it is the only figure on the board that playing cannot
 * lower. Every rate falls after a rough session, which tells a player
 * minding their stats to stop; a win count only ever goes up, so every game
 * is worth sitting down for. It is scored as the raw count, never blended
 * (COUNT_METRICS), and kept small because it tracks games played closely
 * (0.90 across this field) — heavier, it would be the volume bonus that was
 * rejected, in all but name. Its 5% came out of KDA and KPM in proportion
 * (18 → 15, 16 → 14), at the user's direction, so the win rate kept its 15.
 *
 * Survival is rated as KDA rather than K/D, because in trios the knock a
 * teammate finishes is as much the fight as the finish: an assist counts
 * as a full kill (KDA_ASSIST_VALUE). Plain K/D stays on the board unrated, for
 * reference. Assists per minute was rated alongside it at first and dropped
 * once KDA carried the assists — rating both counted them twice.
 *
 * There is no objective metric. The mode has no counters for Kricked's
 * formula, and objective score per minute was tried and dropped; objective
 * play still counts through score per minute. Damage is lighter than the
 * other individual rates because it is already counted once in the kills it
 * sets up, but heavier than in Gauntlet now that placement no longer carries
 * the rating.
 */
const RAPID_ROYALE_WEIGHTS = {
  winPct: 0.15,
  top3Pct: 0.15,
  wins: 0.05,
  kda: 0.15,
  kpm: 0.14,
  spm: 0.15,
  revivesPerHour: 0.13,
  dpm: 0.08,
} as const;

/**
 * Rapid Royale Solo (Season 5 on). Set 2026-10-27; placement retuned
 * 2026-11-03.
 *
 * Placement is 30%, as in Trio, but as a ladder rather than an even split:
 * the win at 15%, finishing top five at 10%, top ten at 5%. The rungs nest —
 * a win is also a top five and a top ten — so every finish earns each rung
 * it reached: an eighth place scores one, a fourth place two, a win all
 * three. Top three was the second rung until 2026-11-03, when the user asked
 * for top five in its place with some credit for top ten. Solo fields far
 * more than ten, so the wider rungs still separate people: top ten ran
 * 52–76% for the players checked, where Trio's sat near 100%. Top three is
 * still computed for every Solo row, unrated. The split within the 30% is my
 * call — a one-line retune. Total wins sits beside the ladder at 5%
 * (2026-11-06), as in Trio and for the same reason: the one figure playing
 * cannot lower. Its share came out of kills per minute and K/D in
 * proportion (25 → 22, 20 → 18), at the user's direction.
 *
 * The rest leans on kills: kills per minute is the heaviest weight at 22%,
 * then K/D at 18%. Plain K/D rather than KDA, because with no teammates an
 * assist is only damage on a kill somebody else took. There is nobody to
 * revive, so revives are not rated; their share went to the kills.
 */
const RAPID_ROYALE_SOLO_WEIGHTS = {
  winPct: 0.15,
  top5Pct: 0.1,
  top10Pct: 0.05,
  wins: 0.05,
  kpm: 0.22,
  kd: 0.18,
  spm: 0.15,
  dpm: 0.1,
} as const;

/**
 * A rate is only as believable as the games behind it: a 60% win rate over
 * 30 games is a fair run of luck, over 300 it is who you are. So before a
 * rated stat is scored it is blended with K games of league-average play,
 * and a player's own figure counts for games / (games + K). The board shows
 * the raw figures; only the score uses the blended ones.
 *
 * K is not fixed. It rises by CONFIDENCE_GAMES_PER_WEEK with every week of
 * the season (launch week is week 1), so the games a rate needs to count
 * scale with the time there has been to play them: ten games a week earn
 * half, thirty a week three quarters, in week 2 and week 12 alike. Set
 * 2026-10-31 at the user's direction, as an incentive to keep playing — a
 * good rate held over hundreds of games outranks the same rate over a few
 * dozen, and a bad one held that long counts in full.
 *
 * Considered and dropped: a fixed K of 30 (right around day 30, wrong either
 * side), one game per day (about 98 by season end), paying for games played
 * outright (rewards playing a lot badly), and 3 a week, which went live first:
 * against this field's median ranked pace of 48 games a week it left the
 * median player at 94% own and only touched the bottom quarter. At 10, thirty
 * games by week 3 is exactly half-trusted, the median keeps 83%, and K ends a
 * 14-week season at 140 (a 300-game player 68% own, a 700-game grinder 83%).
 * Stepping weekly rather than daily keeps the drift it causes — everyone's
 * share moves when K does — to one visible move a week.
 */
export const CONFIDENCE_GAMES_PER_WEEK = 10;

/** For a season whose launch neither the feed nor the last board gave. */
export const FALLBACK_CONFIDENCE_GAMES = 30;

const WEEK_MS = 7 * 86_400_000;

/** The week of the season at `at`, launch week being 1. Never below 1. */
export function weekOfSeason(seasonStart: Date, at: Date): number {
  return Math.max(0, Math.floor((at.getTime() - seasonStart.getTime()) / WEEK_MS)) + 1;
}

/** The K in force at `at`: games of league-average play blended into every rate. */
export function confidenceGames(seasonStart: Date, at: Date): number {
  return CONFIDENCE_GAMES_PER_WEEK * weekOfSeason(seasonStart, at);
}

/** The share of a player's own rate that counts, 0–1. */
export function ownRateShare(matches: number, k: number): number {
  return matches + k <= 0 ? 1 : matches / (matches + k);
}

/** A rate pulled toward the field's average in proportion to how few games back it. */
export function shrinkRate(value: number, matches: number, fieldMean: number, k: number): number {
  const w = ownRateShare(matches, k);
  return w * value + (1 - w) * fieldMean;
}

export type RatedMetric =
  | keyof typeof GAUNTLET_WEIGHTS
  | keyof typeof RAPID_ROYALE_WEIGHTS
  | keyof typeof RAPID_ROYALE_SOLO_WEIGHTS;

/**
 * Rated metrics that are counts rather than rates. A count is scored as it
 * stands: it already carries its own volume, and blending it toward the
 * field mean would hand a thirty-game player wins they never had.
 */
const COUNT_METRICS: ReadonlySet<RatedMetric> = new Set<RatedMetric>(['wins']);

export const RATING_WEIGHTS: Record<ModeKey, Partial<Record<RatedMetric, number>>> = {
  gauntlet: GAUNTLET_WEIGHTS,
  rapidRoyale: RAPID_ROYALE_WEIGHTS,
  rapidRoyaleSolo: RAPID_ROYALE_SOLO_WEIGHTS,
};

/** A mode's rated metrics, heaviest first — the order the board shows them in. */
export function ratedMetrics(mode: ModeKey): RatedMetric[] {
  const weights = RATING_WEIGHTS[mode];
  return (Object.keys(weights) as RatedMetric[]).sort((a, b) => weights[b]! - weights[a]!);
}

/**
 * Traits that can earn a badge.
 *
 * Every one of these is a column on the board, so nobody is decorated for
 * something they cannot go and look up — damage and objectives feed the
 * rating but earn no badge for that reason. The set is not the rated set:
 * kills per match keeps its badge although the rating scores kills per minute
 * instead, because both are on the board and "most kills in a round" is what
 * people actually recognise in each other.
 *
 * The last two are weapon kills per match, which say nothing about how good a
 * player is but a lot about how they play. Kills rather than share, because a
 * share only says what someone carried; per match rather than a season total,
 * because a total mostly says who played the most.
 *
 * Total wins is the deliberate exception to that last rule (2026-11-06). The
 * count is the figure people quote at each other, and the badge is what
 * makes the reason it is rated — keep playing, the wins bank — visible on
 * the board rather than buried in a weight.
 */
export const STANDOUT_TRAITS = [
  'winPct',
  'wins',
  'kd',
  'killsPerMatch',
  'spm',
  'objPtsPerHour',
  'revivesPerHour',
  'sniperPerMatch',
  'autoPerMatch',
] as const;
export type StandoutTrait = (typeof STANDOUT_TRAITS)[number];

/**
 * How far above the field a trait must sit to earn its badge: the top ten per
 * cent of the season's ranked players.
 *
 * Percentile rather than an absolute figure, because absolute floors decay
 * into noise. A 65%-automatic-kills floor sounded selective and turned out to
 * cover nearly the whole board — most people carry a rifle. A tenth of the
 * field is a tenth of the field whatever the meta does.
 */
export const STANDOUT_FLOOR = 90;

/**
 * A player earns a badge for every trait they are exceptional at, not just
 * their best one: someone in the top ten per cent on both revives and win rate
 * did both, and collapsing that to one badge throws away the interesting half.
 */

/**
 * Where `value` sits in `population`, 0-100.
 *
 * Uses midrank for ties — everyone level on a metric gets the same percentile
 * rather than an arbitrary winner decided by array order. A population of one
 * scores 50: with nobody to compare against, the honest answer is "average",
 * not "best".
 */
export function percentile(population: number[], value: number): number {
  if (population.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const p of population) {
    if (p < value) below++;
    else if (p === value) equal++;
  }
  return ((below + equal / 2) / population.length) * 100;
}

/**
 * Score every row against the others, 0-100.
 *
 * Percentiles rather than a fixed-points formula: the metrics have wildly
 * different units (a 3.0 K/D and 420 DPM are not comparable), and any
 * coefficient that made them comparable would be invented and need retuning
 * whenever the field changes. A percentile needs no constant and stays
 * meaningful as the population grows.
 *
 * A metric that is null for a player is dropped and the remaining weights are
 * renormalised, so missing data never reads as a bad score.
 */
export function rateAll(
  rows: BoardRow[],
  mode: ModeKey,
  /** Games of league-average play blended into every rate before scoring. */
  confidenceGames: number = FALLBACK_CONFIDENCE_GAMES,
): BoardRow[] {
  const weights = RATING_WEIGHTS[mode];
  const metrics = Object.keys(weights) as RatedMetric[];
  const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

  // The field's average on each rated metric, which a short sample is pulled
  // toward. Unweighted: one player, one vote on what "average" is.
  const means = new Map<RatedMetric, number>();
  for (const m of metrics) {
    const values = rows.map((r) => r[m]).filter(finite);
    if (values.length > 0) means.set(m, values.reduce((a, v) => a + v, 0) / values.length);
  }
  const blended = (row: BoardRow, m: RatedMetric): number | null => {
    const v = row[m];
    if (!finite(v)) return null;
    if (COUNT_METRICS.has(m)) return v;
    return shrinkRate(v, row.matches, means.get(m) ?? v, confidenceGames);
  };

  // One population per rated metric, of blended figures, holding only the
  // players who have that value. Badge populations are raw: a badge marks the
  // figure the board shows, so a short hot streak can still earn one.
  const rated = new Map<RatedMetric, number[]>(
    metrics.map((m) => [m, rows.map((r) => blended(r, m)).filter(finite)]),
  );
  const raw = new Map<StandoutTrait, number[]>(
    STANDOUT_TRAITS.map((t) => [t, rows.map((r) => r[t]).filter(finite)]),
  );

  return rows.map((row) => {
    let weighted = 0;
    let weightUsed = 0;

    for (const m of metrics) {
      const value = blended(row, m);
      if (value === null) continue;
      const weight = weights[m]!;
      weighted += percentile(rated.get(m) ?? [], value) * weight;
      weightUsed += weight;
    }

    // Rounded here rather than in the pipeline: rating is produced after the
    // pipeline's rounding pass, so an unrounded value would reach the
    // committed board as 79.95652173913044.
    const rating = weightUsed > 0 ? Math.round((weighted / weightUsed) * 100) / 100 : null;

    // Everything this player is exceptional at. Computed here because only
    // the pipeline knows the whole field to compare against. Strongest first,
    // so a display that can only fit some of them keeps the best ones.
    const scored: { trait: StandoutTrait; pct: number }[] = [];
    for (const t of STANDOUT_TRAITS) {
      const value = row[t];
      if (!finite(value)) continue;
      const pct = percentile(raw.get(t) ?? [], value);
      if (pct >= STANDOUT_FLOOR) scored.push({ trait: t, pct });
    }
    scored.sort((a, b) => b.pct - a.pct);

    return { ...row, rating, standouts: scored.map((s) => s.trait) };
  });
}
