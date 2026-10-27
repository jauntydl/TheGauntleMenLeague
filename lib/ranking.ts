import type { BoardRow } from './types';
import { rateAll } from './rating';
import type { ModeKey } from './modes';

/**
 * Players below this many matches are shown as Provisional, not ranked.
 *
 * Raised from 10 when the board grew past fifty players: at that size a
 * 10-match run of luck outranked veterans with several hundred matches, which
 * is the exact distortion a rate-ranked board exists to avoid.
 */
export const MIN_MATCHES = 30;

/** Nulls sort last regardless of direction. */
const desc = (a: number | null, b: number | null): number => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
};

/**
 * Order by overall rating, falling back to win rate then volume. Rating is
 * the headline because win rate alone ignores how a player contributed to
 * the wins — but win rate still breaks ties, since it is the mode's goal.
 */
const byStanding = (a: BoardRow, b: BoardRow): number =>
  desc(a.rating, b.rating) || desc(a.winPct, b.winPct) || desc(a.matches, b.matches) || desc(a.kd, b.kd);

/**
 * Split rows into the ranked board and the provisional section, sorting both
 * by Win % descending. Returns new objects; the input is never mutated.
 */
export function rankPlayers(
  rows: BoardRow[],
  mode: ModeKey,
): { ranked: BoardRow[]; provisional: BoardRow[] } {
  const eligible: BoardRow[] = [];
  const provisional: BoardRow[] = [];

  for (const r of rows) {
    if (r.matches >= MIN_MATCHES) {
      eligible.push({ ...r, rank: null });
    } else {
      // Rating is a percentile against the ranked field. Provisional players
      // are not in that field, so any rating they carry — including one left
      // over from a previous pass — is meaningless and must be cleared.
      provisional.push({ ...r, rank: null, rating: null, standouts: [] });
    }
  }

  // Rate against the ranked field only: a percentile is meaningless against a
  // population you were excluded from, so provisional players keep rating null
  // and are ordered on win rate alone.
  const rated = rateAll(eligible, mode);
  rated.sort(byStanding);
  provisional.sort(byStanding);

  return {
    ranked: rated.map((r, i) => ({ ...r, rank: i + 1 })),
    provisional,
  };
}
