import type { BoardRow } from './types';
import type { ModeKey } from './modes';

/**
 * The Rapid Royale points ledger (Season 5 on, set 2026-11-09).
 *
 * Rapid Royale is a hectic mode, and ranking it on rate stats — win %,
 * K/D, kills per minute — made every match a threat to a number; the
 * owner's view was that it "only discourages people and gives people too
 * much stress". So the board ranks the mode on a plain season total of
 * points instead: every match earns a placement result, every kill, assist
 * and death moves the total, and the total is never divided by matches,
 * minutes or anything else. It can go negative. Nobody's number moves
 * because somebody else played, which the percentile rating (lib/rating.ts,
 * now the Gauntlet archive's alone) could never say.
 *
 * The numbers are the owner's, settled over several passes against the
 * live Season 5 board (10/6/3/−3, then −6, then this). The −5 loss is the
 * brake on volume: a player who dies more than they kill and finishes
 * outside the medals most matches goes negative however much they play.
 */

/** Points for how a match ended. `unplaced` is shown on the board as "Losses". */
export const PLACEMENT_POINTS = { gold: 15, silver: 10, bronze: 5, unplaced: -5 } as const satisfies Record<string, number>;
export type Medal = keyof typeof PLACEMENT_POINTS;

/** Points for what happened in the fight. Applied in Solo too, where an assist count of 0 or 1 makes it inert. */
export const FIGHT_POINTS = { kill: 1, assist: 0.5, death: -1 } as const satisfies Record<string, number>;
export type FightEvent = keyof typeof FIGHT_POINTS;

/** The row field each fight event is counted from. */
export const FIGHT_FIELDS = { kill: 'kills', assist: 'assists', death: 'deaths' } as const satisfies Record<
  FightEvent,
  keyof BoardRow
>;

export type LedgerMode = 'rapidRoyale' | 'rapidRoyaleSolo';

/**
 * Where the medals fall, by mode: the API counts finishes in the top three,
 * five and ten, and a Solo lobby is far bigger than a Trio one, so Solo's
 * rungs are wider. Gold is always the win. Silver is the finishes inside
 * the silver rung but not won; bronze the finishes inside the bronze rung
 * but outside the silver one; a loss is everything else.
 */
export const MEDAL_RUNGS: Record<LedgerMode, { silver: 3 | 5; bronze: 5 | 10 }> = {
  rapidRoyale: { silver: 3, bronze: 5 },
  rapidRoyaleSolo: { silver: 5, bronze: 10 },
};

/** The row fields that carry a point value, in board order. */
export const LEDGER_FIELDS: readonly string[] = [
  ...(Object.keys(PLACEMENT_POINTS) as Medal[]),
  ...(Object.keys(FIGHT_POINTS) as FightEvent[]).map((e) => FIGHT_FIELDS[e]),
];

export function isLedgerMode(mode: ModeKey): mode is LedgerMode {
  return mode in MEDAL_RUNGS;
}

export type MedalCounts = Record<Medal, number>;
export type Ledger = MedalCounts & { placementPts: number; fightPts: number; rating: number };

/**
 * The trusted count of finishes inside a rung, or null.
 *
 * The build stores the counts (Metrics.top3/top5/top10). A row committed
 * before 2026-11-09 has only the rates, to two decimals, so the count is
 * recovered from the rate and the matches — exact below 10,000 matches,
 * which is every row there will ever be. Either way a null is a counter
 * that failed computeMetrics' trust test, and stays null.
 */
function rungCount(row: BoardRow, rung: 3 | 5 | 10): number | null {
  const count = rung === 3 ? row.top3 : rung === 5 ? row.top5 : row.top10;
  if (typeof count === 'number') return count;
  const pct = rung === 3 ? row.top3Pct : rung === 5 ? row.top5Pct : row.top10Pct;
  if (typeof pct !== 'number') return null;
  return Math.round((pct * row.matches) / 100);
}

/** How many of a player's matches ended in each medal, or null if a rung the mode needs is untrusted. */
export function medalCounts(row: BoardRow, mode: LedgerMode): MedalCounts | null {
  const rungs = MEDAL_RUNGS[mode];
  const silverRung = rungCount(row, rungs.silver);
  const bronzeRung = rungCount(row, rungs.bronze);
  if (silverRung === null || bronzeRung === null) return null;
  return {
    gold: row.wins,
    silver: silverRung - row.wins,
    bronze: bronzeRung - silverRung,
    unplaced: row.matches - bronzeRung,
  };
}

/** One player's ledger, or null where their placement cannot be trusted. */
export function ledgerOf(row: BoardRow, mode: LedgerMode): Ledger | null {
  const medals = medalCounts(row, mode);
  if (!medals) return null;
  const placementPts = (Object.keys(PLACEMENT_POINTS) as Medal[]).reduce(
    (sum, m) => sum + PLACEMENT_POINTS[m] * medals[m],
    0,
  );
  const fightPts = (Object.keys(FIGHT_POINTS) as FightEvent[]).reduce(
    (sum, e) => sum + FIGHT_POINTS[e] * (row[FIGHT_FIELDS[e]] as number),
    0,
  );
  return { ...medals, placementPts, fightPts, rating: placementPts + fightPts };
}

/**
 * Every row with its ledger written on it: the medal counts, the two
 * sub-totals, the rating (their sum), and no badges — the badge set is made
 * of the rate stats this board no longer ranks on. Nulls throughout where
 * the placement counters failed the trust test. Pure; the input is never
 * mutated.
 */
export function scoreLedger(rows: BoardRow[], mode: LedgerMode): BoardRow[] {
  return rows.map((row) => {
    const l = ledgerOf(row, mode);
    return {
      ...row,
      gold: l?.gold ?? null,
      silver: l?.silver ?? null,
      bronze: l?.bronze ?? null,
      unplaced: l?.unplaced ?? null,
      placementPts: l?.placementPts ?? null,
      fightPts: l?.fightPts ?? null,
      rating: l?.rating ?? null,
      standouts: [],
    };
  });
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const ones = n % 10;
  return `${n}${ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'}`;
}

/** The finishes a medal covers in a mode: "2nd–3rd place", "6th or worse". */
export function finishLabel(mode: LedgerMode, medal: Medal): string {
  const { silver, bronze } = MEDAL_RUNGS[mode];
  switch (medal) {
    case 'gold':
      return '1st place';
    case 'silver':
      return `2nd–${ordinal(silver)} place`;
    case 'bronze':
      return `${ordinal(silver + 1)}–${ordinal(bronze)} place`;
    case 'unplaced':
      return `${ordinal(bronze + 1)} or worse`;
  }
}

/**
 * The word under a medal's icon in the board header: what finish earns it,
 * in this mode's rungs. "Winner" · "Top 3" · "Top 5" on Trio; "Winner" ·
 * "Top 5" · "Top 10" on Solo. Losses is already a word.
 */
export function medalCaption(mode: LedgerMode, medal: Medal): string {
  const { silver, bronze } = MEDAL_RUNGS[mode];
  switch (medal) {
    case 'gold':
      return 'Winner';
    case 'silver':
      return `Top ${silver}`;
    case 'bronze':
      return `Top ${bronze}`;
    case 'unplaced':
      return 'Losses';
  }
}

/** "+15 each", "+0.5 each", "−5 each" — a true minus sign, not a hyphen. */
export function pointsEach(points: number): string {
  return `${points < 0 ? '−' : '+'}${Math.abs(points)} each`;
}
