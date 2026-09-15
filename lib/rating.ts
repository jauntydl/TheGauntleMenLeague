import type { BoardRow } from './types';

/**
 * How much each metric contributes to the overall rating.
 *
 * Winning leads at 35% because it is the actual goal, with objective work
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
export const RATING_WEIGHTS = {
  winPct: 0.35,
  objPtsPerHour: 0.15,
  kd: 0.12,
  kpm: 0.12,
  spm: 0.12,
  revivesPerHour: 0.1,
  dpm: 0.04,
} as const;

export type RatedMetric = keyof typeof RATING_WEIGHTS;

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
 */
export const STANDOUT_TRAITS = [
  'winPct',
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
export function rateAll(rows: BoardRow[]): BoardRow[] {
  const metrics = Object.keys(RATING_WEIGHTS) as RatedMetric[];

  // One population per metric, holding only the players who have that value.
  // Badge traits are included alongside the rated ones: the weapon shares earn
  // badges without feeding the rating, so they need populations too.
  const populations = new Map<RatedMetric | StandoutTrait, number[]>(
    [...new Set<RatedMetric | StandoutTrait>([...metrics, ...STANDOUT_TRAITS])].map((m) => [
      m,
      rows.map((r) => r[m]).filter((v): v is number => v !== null && Number.isFinite(v)),
    ]),
  );

  return rows.map((row) => {
    let weighted = 0;
    let weightUsed = 0;

    for (const m of metrics) {
      const value = row[m];
      if (value === null || !Number.isFinite(value)) continue;
      const weight = RATING_WEIGHTS[m];
      weighted += percentile(populations.get(m) ?? [], value) * weight;
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
      if (value === null || !Number.isFinite(value)) continue;
      const pct = percentile(populations.get(t) ?? [], value);
      if (pct >= STANDOUT_FLOOR) scored.push({ trait: t, pct });
    }
    scored.sort((a, b) => b.pct - a.pct);

    return { ...row, rating, standouts: scored.map((s) => s.trait) };
  });
}
