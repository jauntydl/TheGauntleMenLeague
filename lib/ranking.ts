import type { BoardRow } from './types';
import { rateAll } from './rating';
import { isLedgerMode, scoreLedger } from './ledger';
import type { ModeKey } from './modes';

/**
 * Players below this many matches are shown as Provisional, not ranked.
 *
 * Raised from 10 when the board grew past fifty players: at that size a
 * 10-match run of luck outranked veterans with several hundred matches, which
 * is the exact distortion a rate-ranked board exists to avoid.
 *
 * On a Rapid Royale board (the points ledger) a rank also needs a total
 * above zero — see rankPlayers.
 */
export const MIN_MATCHES = 30;

/** Nulls sort last regardless of direction. */
const desc = (a: number | null | undefined, b: number | null | undefined): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
};

/**
 * Order by overall rating, falling back to win rate then volume. Rating is
 * the headline because win rate alone ignores how a player contributed to
 * the wins — but win rate still breaks ties, since it is the mode's goal.
 * Gauntlet's order; its boards are archived and never re-sorted.
 */
const byStanding = (a: BoardRow, b: BoardRow): number =>
  desc(a.rating, b.rating) || desc(a.winPct, b.winPct) || desc(a.matches, b.matches) || desc(a.kd, b.kd);

/**
 * The points ledger's order: the total, then the wins behind it, then the
 * fight points, then the EA ID so two identical records land the same way
 * on every build (the build's idempotence depends on a total order).
 */
const byPoints = (a: BoardRow, b: BoardRow): number =>
  desc(a.rating, b.rating) || desc(a.gold, b.gold) || desc(a.fightPts, b.fightPts) || a.eaId.localeCompare(b.eaId);

/**
 * Split rows into the ranked board and the provisional section. Returns new
 * objects; the input is never mutated.
 *
 * Rapid Royale boards are scored on the points ledger (lib/ledger.ts) and a
 * rank needs MIN_MATCHES matches *and* a total above zero: "all 0 and
 * negative players can go back to provisional" (the owner, 2026-11-09).
 * Provisional therefore holds newcomers, players at or below break-even,
 * and anyone whose placement counters failed the trust test (rating null).
 * All of them keep their points — a total is as true at 5 matches as at
 * 500 — and climb straight back onto the board above zero.
 *
 * Gauntlet boards are rated on percentiles against the ranked field, so a
 * provisional Gauntlet player carries no rating: a percentile is
 * meaningless against a population you were excluded from.
 */
export function rankPlayers(rows: BoardRow[], mode: ModeKey): { ranked: BoardRow[]; provisional: BoardRow[] } {
  if (isLedgerMode(mode)) {
    const scored = scoreLedger(rows, mode).map((r) => ({ ...r, rank: null }));
    const ranked = scored.filter((r) => r.matches >= MIN_MATCHES && r.rating !== null && r.rating > 0);
    const provisional = scored.filter((r) => !ranked.includes(r));
    ranked.sort(byPoints);
    provisional.sort(byPoints);
    return { ranked: ranked.map((r, i) => ({ ...r, rank: i + 1 })), provisional };
  }

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
