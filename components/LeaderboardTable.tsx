'use client';

import * as React from 'react';
import { DataGrid, type GridColDef, type GridComparatorFn, type GridSortDirection } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha } from '@mui/material/styles';
import type { BoardRow } from '@/lib/types';
import { JET_BADGE_THRESHOLD } from '@/lib/metrics';
import { MODES, type ModeKey } from '@/lib/modes';
import { shownName } from '@/lib/naming';
import { RATING_WEIGHTS, ratedMetrics, type RatedMetric, type StandoutTrait } from '@/lib/rating';
import {
  PLACEMENT_POINTS,
  FIGHT_POINTS,
  FIGHT_FIELDS,
  LEDGER_FIELDS,
  isLedgerMode,
  finishLabel,
  pointsEach,
  type FightEvent,
  type LedgerMode,
  type Medal,
} from '@/lib/ledger';
import { MIN_MATCHES } from '@/lib/ranking';

const DASH = '—';
const MINUS = '−';

/** The Player column flexes; this is the floor it will not go below. */
export const PLAYER_MIN_WIDTH_PX = 150;

/**
 * On a phone the rank and Player columns are frozen at the left edge while
 * the rest of the board scrolls sideways under them — otherwise a reader
 * scrolled out to DPM has no idea whose row they are on. Fixed widths, not
 * flex, because each pinned cell's left offset is the sum of those before it.
 */
export const PINNED_RANK_WIDTH_PX = 44;
export const PINNED_PLAYER_WIDTH_PX = 124;

/**
 * The tooltip a column carries in its header.
 *
 * The accent marks the rated columns as special; this is what says why, and
 * how much. The figure is read from RATING_WEIGHTS rather than written out,
 * so a retuned weight cannot leave a tooltip quoting the old one. Unrated
 * columns keep whatever description they already had, or none.
 */
export function columnDescription(
  field: string,
  base: string | undefined,
  headerName: string | undefined,
  mode: ModeKey,
): string | undefined {
  if (isLedgerMode(mode)) return ledgerDescription(field, base, headerName, mode);
  const weight = RATING_WEIGHTS[mode][field as RatedMetric];
  if (weight === undefined) return base;
  return `${base ?? headerName} · ${Math.round(weight * 100)}% of the Rating`;
}

/** The medal a column shows, or undefined. Losses is a medal column in the ledger's sense, not the board's. */
const medalOf = (field: string): Medal | undefined =>
  (Object.keys(PLACEMENT_POINTS) as Medal[]).find((m) => m === field);
const fightEventOf = (field: string): FightEvent | undefined =>
  (Object.keys(FIGHT_FIELDS) as FightEvent[]).find((e) => FIGHT_FIELDS[e] === field);

/** The rate columns a Rapid Royale board shows to read, not to rank on. */
const REFERENCE_FIELDS: ReadonlySet<string> = new Set(['kda', 'kd', 'kpm', 'dpm', 'revivesPerHour']);

/** The word behind a medal header, which is an icon. */
const MEDAL_NAME: Record<Medal, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze', unplaced: 'Losses' };

/**
 * A Rapid Royale header's tooltip says what the column is worth: the medal's
 * finishes and its points, a fight count's points, or that a rate column is
 * reference only. Read from the ledger constants so a changed value cannot
 * leave a tooltip quoting the old one.
 */
function ledgerDescription(
  field: string,
  base: string | undefined,
  headerName: string | undefined,
  mode: LedgerMode,
): string | undefined {
  const medal = medalOf(field);
  if (medal) {
    const finish = `${finishLabel(mode, medal)} · ${pointsEach(PLACEMENT_POINTS[medal])}`;
    // The three medal headers are icons, so the word goes in the tooltip;
    // Losses is already a word.
    return medal === 'unplaced' ? finish : `${MEDAL_NAME[medal]} · ${finish}`;
  }
  const event = fightEventOf(field);
  if (event) return pointsEach(FIGHT_POINTS[event]);
  if (REFERENCE_FIELDS.has(field)) return `${base ?? headerName} · reference only, not part of the points`;
  return base;
}

/**
 * The season total as the board shows it: a whole number with thousands
 * separators and a true minus sign. The half point an assist earns rounds
 * away from zero for display only; the sort is on the exact value.
 */
export const fmtPoints = (v: number | null | undefined): string => {
  if (v == null) return DASH;
  const whole = Math.round(Math.abs(v));
  return `${v < 0 && whole > 0 ? MINUS : ''}${INT.format(whole)}`;
};

const fmtSigned = (v: number): string => `${v < 0 ? MINUS : '+'}${INT.format(Math.round(Math.abs(v)))}`;

/**
 * What a Points cell says on hover: the two halves of the total and the
 * counts behind each. Assists are left out of a Solo split, where the
 * column is hidden too — an assist there is damage on a kill somebody else
 * took, and the count reads 0 or 1.
 */
export function pointsSplitLabel(row: BoardRow, mode: LedgerMode): string {
  const medals = `${fmtInt(row.gold)} gold · ${fmtInt(row.silver)} silver · ${fmtInt(row.bronze)} bronze · ${fmtInt(row.unplaced)} losses`;
  const fights = [
    `${fmtInt(row.kills)} kills`,
    MODES[mode].squadSize > 1 ? `${fmtInt(row.assists)} assists` : null,
    `${fmtInt(row.deaths)} deaths`,
  ]
    .filter(Boolean)
    .join(' · ');
  return `Placement ${fmtSigned(row.placementPts ?? 0)} (${medals}) · Fights ${fmtSigned(row.fightPts ?? 0)} (${fights})`;
}

/**
 * The metal each medal column is set in, on the dark panel: a warm gold, a
 * cool silver, a copper bronze. The medal table's one loud element.
 */
export const MEDAL_TINT: Record<Exclude<Medal, 'unplaced'>, string> = {
  gold: '#FFD15C',
  silver: '#C9D1D9',
  bronze: '#D08A4E',
};


// Grids with 100 rows or fewer show every row without paging, so the footer
// (page size / page controls) has nothing useful to control — hide it.
const FOOTER_ROW_THRESHOLD = 100;

/** Left offset of each column pinned on a phone. */
const PINNED_LEFT: Record<string, number> = { rank: 0, eaId: PINNED_RANK_WIDTH_PX };

// `== null`, not `=== null`: archived rows were frozen before a later metric
// existed, so a field can be absent from committed JSON as well as null.
export const fmtPct = (v: number | null | undefined): string => (v == null ? DASH : `${v.toFixed(1)}%`);
export const fmtNum = (v: number | null | undefined, digits = 2): string =>
  v == null ? DASH : v.toFixed(digits);
export const fmtHours = (sec: number): string => `${(sec / 3600).toFixed(1)}h`;

/**
 * Thousands separators for counts: 10,000 reads faster than 10000 down a
 * column. The locale is pinned rather than left to the runtime — the server
 * and the browser can disagree on it, and that is a hydration mismatch.
 */
const INT = new Intl.NumberFormat('en-US');
// `== null` for the same reason as fmtNum: a count can be absent from an
// archived row as well as null.
export const fmtInt = (v: number | null | undefined): string => (v == null ? DASH : INT.format(v));

/**
 * lib/ranking.ts documents "nulls sort last regardless of direction" for the
 * server-side standings comparator. DataGrid's own default numeric comparator
 * doesn't know that rule — its default puts nulls first on an ascending sort
 * — so a user sorting a nullable column (K/D, KPM, DPM, Win %, Rank)
 * ascending would see em dashes on top. getSortComparator hands us the
 * direction and takes full control (unlike sortComparator, whose result the
 * grid still negates for desc), so we can enforce "nulls last" both ways.
 */
const nullsLastComparator =
  (sortDirection: GridSortDirection): GridComparatorFn<number | null> =>
  (v1, v2) => {
    if (v1 === null && v2 === null) return 0;
    if (v1 === null) return 1;
    if (v2 === null) return -1;
    return sortDirection === 'desc' ? v2 - v1 : v1 - v2;
  };

/**
 * Centre by default. Names and the style label read better ranged left; kill
 * counts line up on their last digit ranged right.
 */
const COLUMN_ALIGN: Record<string, 'left' | 'right' | 'center'> = {
  eaId: 'left',
  sniperPct: 'left',
  kills: 'right',
  headshots: 'right',
};

/**
 * Two badges are drawn rather than picked from the emoji set: there is no
 * assault-rifle emoji at all (🔫 renders as a water pistol on every current
 * platform) and no medical cross that keeps its shape at 17px. Both take
 * currentColor, so they sit on the theme rather than beside it.
 */
const MedicCross = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden focusable="false">
    <path d="M9.4 3h5.2v6.4H21v5.2h-6.4V21H9.4v-6.4H3V9.4h6.4z" />
  </svg>
);

const AutoRifle = () => (
  <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="currentColor" aria-hidden focusable="false">
    {/* Barrel, front sight, receiver, top rail, stock, magazine, grip. */}
    <path d="M13.2 9.5h8.6v1.5h-8.6z" />
    <path d="M17.4 7.8h1.2v1.9h-1.2z" />
    <path d="M6.2 8.5h7.6v3.4H6.2z" />
    <path d="M7.2 7h6v1.3h-6z" />
    <path d="M1.6 10.3l4.6-1v2.9l-4.6.6z" />
    <path d="M9.6 11.9h2.7l-.6 4.6H9z" />
    <path d="M6.7 11.9h2.1l-.8 3.5H6z" />
  </svg>
);

/**
 * A badge is an icon and nothing else: the picture carries the meaning, and
 * the tooltip carries the number behind it. Names were tried first and did
 * not survive contact — a title tells you a player earned something without
 * telling you what.
 */
export type Badge = { id: StandoutTrait | 'jet'; icon: React.ReactNode; detail: string };

const TRAIT_BADGES: Record<StandoutTrait, { icon: React.ReactNode; detail: (r: BoardRow) => string }> = {
  winPct: { icon: '🏆', detail: (r) => `win rate — ${r.winPct?.toFixed(1)}%` },
  kd: { icon: '🛡️', detail: (r) => `K/D — ${r.kd?.toFixed(2)}` },
  killsPerMatch: { icon: '💀', detail: (r) => `kills — ${r.killsPerMatch?.toFixed(1)} per match` },
  spm: { icon: '⭐', detail: (r) => `score — ${fmtInt(Math.round(r.spm ?? 0))} per minute` },
  objPtsPerHour: {
    // A flag read as "captured a point". This is the carry badge — the player
    // doing the work the round is actually decided on — so it lifts instead.
    icon: '🏋️',
    detail: (r) => `carrying the objective — ${r.objPtsPerHour?.toFixed(0)} points per hour`,
  },
  revivesPerHour: {
    icon: <MedicCross />,
    detail: (r) => `revives — ${r.revivesPerHour?.toFixed(1)} per hour`,
  },
  sniperPerMatch: {
    icon: '🎯',
    detail: (r) =>
      `scoped kills — ${r.sniperPerMatch?.toFixed(1)} per match, ${fmtInt(r.sniperKills ?? 0)} all season`,
  },
  autoPerMatch: {
    icon: <AutoRifle />,
    detail: (r) =>
      `automatic kills — ${r.autoPerMatch?.toFixed(1)} per match, ${fmtInt(r.autoKills ?? 0)} all season`,
  },
};

/**
 * Every badge this player has earned, strongest first.
 *
 * Each one is a threshold met, so earning none is a normal outcome rather
 * than a gap to paper over — a badge that everybody holds says nothing.
 */
export function badges(row: BoardRow): Badge[] {
  const earned: Badge[] = (row.standouts ?? []).map((t) => ({
    id: t,
    icon: TRAIT_BADGES[t].icon,
    detail: `Top 10% — ${TRAIT_BADGES[t].detail(row)}`,
  }));

  // Flying keeps an absolute threshold rather than a percentile. Almost
  // nobody flies, so a tenth of this field is still a player who touched a
  // jet once; an hour in ten is a pilot.
  if (row.jetPct >= JET_BADGE_THRESHOLD) {
    earned.push({
      id: 'jet',
      icon: '✈️',
      detail: `Pilot — ${row.jetPct.toFixed(1)}% of their time flown in jets`,
    });
  }

  return earned;
}

/**
 * The rated columns, keyed by the metric they show. Which of them a board
 * carries, and in what order, is the mode's weights — see the column list.
 */
const RATED_COLUMNS: Record<string, GridColDef<BoardRow>> = {
  winPct: {
    field: 'winPct',
    headerName: 'Win %',
    width: 76,
    description: 'Share of matches won',
    renderCell: (p) => fmtPct(p.row.winPct),
    getSortComparator: nullsLastComparator,
  },
  // The field is the win count, so the column sorts on wins and is what the
  // rating reads where a mode rates total wins; the cell shows the record.
  wins: {
    field: 'wins',
    headerName: 'W–L',
    width: 80,
    description: 'Wins–losses this season',
    renderCell: (p) => `${p.row.wins}–${p.row.losses}`,
  },
  objPtsPerHour: {
    field: 'objPtsPerHour',
    headerName: 'OBJ/h',
    width: 72,
    description:
      'Objective points per hour: 0.1 per second on the objective, 10 per objective destroyed, 5 per disarm, 3 per intel pickup',
    renderCell: (p) => fmtNum(p.row.objPtsPerHour, 0),
    getSortComparator: nullsLastComparator,
  },
  kd: {
    field: 'kd',
    headerName: 'K/D',
    width: 68,
    description: 'Kills per death',
    renderCell: (p) => fmtNum(p.row.kd),
    getSortComparator: nullsLastComparator,
  },
  kda: {
    field: 'kda',
    headerName: 'KDA',
    width: 68,
    description: '(Kills + assists) per death',
    renderCell: (p) => fmtNum(p.row.kda),
    getSortComparator: nullsLastComparator,
  },
  kpm: {
    field: 'kpm',
    headerName: 'KPM',
    width: 68,
    // Spelled out because K/match is also on the board and both start
    // with K — they no longer sit side by side, which makes the tooltip
    // more load-bearing rather than less.
    description: 'Kills per minute',
    renderCell: (p) => fmtNum(p.row.kpm),
    getSortComparator: nullsLastComparator,
  },
  spm: {
    field: 'spm',
    headerName: 'SPM',
    width: 72,
    description: 'Score per minute',
    renderCell: (p) => fmtNum(p.row.spm, 0),
    getSortComparator: nullsLastComparator,
  },
  revivesPerHour: {
    field: 'revivesPerHour',
    headerName: 'Rev/h',
    width: 76,
    description: 'Revives per hour played',
    renderCell: (p) => fmtNum(p.row.revivesPerHour, 1),
    getSortComparator: nullsLastComparator,
  },
  dpm: {
    field: 'dpm',
    headerName: 'DPM',
    width: 76,
    description: 'Damage per minute',
    renderCell: (p) => fmtNum(p.row.dpm, 0),
    getSortComparator: nullsLastComparator,
  },
};

/** A whole-number count, right-aligned by COLUMN_ALIGN where it is a kill count. */
const countColumn = (field: keyof BoardRow, headerName: string, width = 80): GridColDef<BoardRow> => ({
  field,
  headerName,
  width,
  renderCell: (p) => fmtInt(p.row[field] as number | null),
});

/**
 * The points ledger's columns, shared by both Rapid Royale boards: the three
 * medals under their icons, the losses, the fight counts, and the matches
 * that stand behind the 30-match rule. What each is worth is said in the
 * header tooltip (ledgerDescription), not here.
 */
const LEDGER_COLUMNS: Record<string, GridColDef<BoardRow>> = {
  gold: { ...countColumn('gold', '🥇', 64), cellClassName: 'medal-col medal-gold' },
  silver: { ...countColumn('silver', '🥈', 64), cellClassName: 'medal-col medal-silver' },
  bronze: { ...countColumn('bronze', '🥉', 64), cellClassName: 'medal-col medal-bronze' },
  unplaced: { ...countColumn('unplaced', 'Losses', 76), cellClassName: 'losses-col' },
  kills: countColumn('kills', 'Kills'),
  assists: countColumn('assists', 'Assists'),
  deaths: countColumn('deaths', 'Deaths'),
  matches: {
    ...countColumn('matches', 'Matches', 84),
    description: `Matches this season · ${MIN_MATCHES} for a rank`,
  },
};

/** A Rapid Royale board's columns, in medal-table order; the rating column is the Points total. */
function ledgerFields(mode: LedgerMode): string[] {
  const squad = MODES[mode].squadSize > 1;
  const ledger = LEDGER_FIELDS.filter((f) => f !== 'assists' || squad);
  const reference = [squad ? 'kda' : 'kd', 'kpm', 'dpm', ...(squad ? ['revivesPerHour'] : [])];
  return [...ledger, 'rating', ...reference, 'matches'];
}

/** The Rating header's tooltip, written from the mode's weights. */
const RATED_LABEL: Partial<Record<string, string>> = {
  winPct: 'win rate',
  wins: 'total wins',
  top3Pct: 'top-three rate',
  top5Pct: 'top-five rate',
  top10Pct: 'top-ten rate',
  objPtsPerHour: 'objectives',
  kd: 'K/D',
  kda: 'KDA',
  kpm: 'kills per minute',
  spm: 'score per minute',
  revivesPerHour: 'revives per hour',
  dpm: 'damage per minute',
};

/** The Points header's tooltip, written from the ledger constants. */
function pointsDescription(): string {
  const placement = (Object.keys(PLACEMENT_POINTS) as Medal[])
    .map((m) => `${MEDAL_NAME[m].toLowerCase().replace('losses', 'loss')} ${fmtSignedPoint(PLACEMENT_POINTS[m])}`)
    .join(', ');
  const fights = (Object.keys(FIGHT_POINTS) as FightEvent[])
    .map((e) => `${e} ${fmtSignedPoint(FIGHT_POINTS[e])}`)
    .join(', ');
  return `Season points: ${placement}; ${fights}. Hover a total for the split; see How the rating works.`;
}

const fmtSignedPoint = (v: number): string => `${v < 0 ? MINUS : '+'}${Math.abs(v)}`;

function ratingDescription(mode: ModeKey): string {
  const parts = ratedMetrics(mode).map(
    (m) => `${RATED_LABEL[m]} ${Math.round(RATING_WEIGHTS[mode][m]! * 100)}%`,
  );
  return `Overall rating out of 100: ${parts.join(', ')} — each scored against the rest of the ranked field. See How the rating works.`;
}

export function LeaderboardTable({
  rows,
  mode,
  provisional = false,
  fill = false,
}: {
  rows: BoardRow[];
  /** The mode the season is ranked on, which decides the rated columns. */
  mode: ModeKey;
  provisional?: boolean;
  /**
   * Fill the parent's height and scroll inside, instead of growing to fit
   * every row. The parent must have a definite height and min-height: 0 — a
   * percentage height against an auto-height parent resolves to auto, and the
   * grid quietly goes back to pushing the page taller than the screen.
   */
  fill?: boolean;
}) {
  // noSsr: true avoids a hydration mismatch — without it the server always
  // renders the desktop (non-matching) layout and the client immediately
  // re-renders narrow, producing a visible flash and a markup mismatch.
  //
  // Every column shows at every width. Narrower screens used to drop columns
  // instead of scrolling, which left phone readers no way to see anything but
  // the rating and win rate. Now the grid scrolls sideways inside itself and,
  // on a phone, keeps rank and Player pinned (see PINNED_*_WIDTH_PX).
  const isNarrow = useMediaQuery('(max-width:600px)', { noSsr: true });

  // Depends on isNarrow: a phone has roughly 368px of usable width, so the
  // handful of columns it does show have to be narrower too, not just fewer.
  const columns = React.useMemo<GridColDef<BoardRow>[]>(() => {
    // Annotated before the map: without it the array literal loses its
    // type and every renderCell parameter falls back to any.
    const base: GridColDef<BoardRow>[] = [
      {
        field: 'rank',
        headerName: '#',
        width: isNarrow ? PINNED_RANK_WIDTH_PX : 56,
        // The one place this board raises its voice. Gauntlet is an
        // elimination mode, so position is the story — the numeral is lit
        // like a panel readout, brightest at the top and falling away.
        renderCell: (p) =>
          p.row.rank === null ? (
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {DASH}
            </Box>
          ) : (
            <Box
              component="span"
              className="tnum"
              sx={{
                fontFamily: 'var(--font-display), sans-serif',
                fontWeight: 700,
                fontSize: p.row.rank === 1 ? '1.5rem' : p.row.rank <= 3 ? '1.2rem' : '1rem',
                lineHeight: 1,
                color: p.row.rank <= 3 ? 'primary.main' : 'text.primary',
                textShadow: (t) =>
                  p.row.rank === 1
                    ? `0 0 18px ${alpha(t.palette.primary.main, 0.75)}`
                    : p.row.rank! <= 3
                      ? `0 0 10px ${alpha(t.palette.primary.main, 0.35)}`
                      : 'none',
              }}
            >
              {p.row.rank}
            </Box>
          ),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'eaId',
        headerName: 'Player',
        ...(isNarrow ? { width: PINNED_PLAYER_WIDTH_PX } : { flex: 1, minWidth: PLAYER_MIN_WIDTH_PX }),
        description:
          'The name on the scoreboard in game. Hover a player for their EA ID and the name they go by in Discord.',
        // Sort on what is read, not on the EA ID behind it.
        valueGetter: (_v, r) => shownName(r),
        renderCell: (p) => {
          const shown = shownName(p.row);
          // An EA ID is often a suffixed variant of the in-game name, and a
          // Discord handle can be a third name again. Both belong somewhere
          // findable, neither belongs in a column you scan down.
          const also = [
            shown !== p.row.eaId ? `${p.row.eaId} on EA` : null,
            p.row.displayName !== p.row.eaId && p.row.displayName !== shown
              ? `${p.row.displayName} in Discord`
              : null,
          ].filter(Boolean);

          const name = (
            <Box
              component="span"
              sx={{
                fontWeight: 500,
                letterSpacing: '0.01em',
                color: 'text.primary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {shown}
            </Box>
          );

          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0, height: '100%' }}>
              {also.length > 0 ? <Tooltip title={also.join(' · ')}>{name}</Tooltip> : name}
            </Box>
          );
        },
      },
    ];

    // The Points total on a Rapid Royale board, the medal table's bold
    // "Total" closing the ledger group; the 0–100 Rating on a Gauntlet one.
    const rating: GridColDef<BoardRow> = isLedgerMode(mode)
      ? {
          field: 'rating',
          headerName: 'Points',
          width: isNarrow ? 84 : 96,
          description: pointsDescription(),
          cellClassName: 'points-col',
          renderCell: (p) =>
            p.row.rating == null ? (
              <Box component="span" sx={{ color: 'text.secondary' }}>{DASH}</Box>
            ) : (
              <Tooltip title={pointsSplitLabel(p.row, mode)} placement="right">
                <Box component="span" className="tnum" sx={{ fontWeight: 700, color: 'primary.main', fontSize: '1.05em' }}>
                  {fmtPoints(p.row.rating)}
                </Box>
              </Tooltip>
            ),
          getSortComparator: nullsLastComparator,
        }
      : {
          field: 'rating',
          headerName: 'Rating',
          width: isNarrow ? 88 : 96,
          description: ratingDescription(mode),
          renderCell: (p) =>
            p.row.rating == null ? (
              <Box component="span" sx={{ color: 'text.secondary' }}>{DASH}</Box>
            ) : (
              <Box component="span" className="tnum" sx={{ fontWeight: 600, color: 'primary.main' }}>
                {p.row.rating.toFixed(1)}
              </Box>
            ),
          getSortComparator: nullsLastComparator,
        };

    // Olympic medal-table order on a Rapid Royale board: the medals, the
    // losses, the fight counts, the total, then the rates kept for reference.
    const ledgerColumns: GridColDef<BoardRow>[] = isLedgerMode(mode)
      ? ledgerFields(mode).map((f) => (f === 'rating' ? rating : (LEDGER_COLUMNS[f] ?? RATED_COLUMNS[f])))
      : [];

    const gauntletColumns: GridColDef<BoardRow>[] = isLedgerMode(mode) ? [] : [
      rating,
      {
        field: 'sniperPct',
        headerName: 'Badges',
        width: 116,
        sortable: false,
        description:
          'Earned by finishing in the top 10% of the season on a stat, or by flying jets. Hover a badge to see which.',
        renderCell: (p) => {
          const earned = badges(p.row);
          if (earned.length === 0) {
            return <Box component="span" sx={{ color: 'text.secondary' }}>{DASH}</Box>;
          }
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', gap: 0.5, minWidth: 0 }}>
              {earned.map((b) => (
                // Tooltip per badge rather than per cell: with icons alone, the
                // name is only reachable by pointing at the one you mean.
                <Tooltip key={b.id} title={b.detail}>
                  <Box
                    component="span"
                    role="img"
                    aria-label={b.detail}
                    // Emoji draw above their own line box, so a flex box of
                    // the glyph's own height centres them; lineHeight 1 rides
                    // them visibly high in the row.
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '1.05rem',
                      cursor: 'default',
                    }}
                  >
                    {b.icon}
                  </Box>
                </Tooltip>
              ))}
            </Box>
          );
        },
      },
      // The rated columns come first, in descending weight, so reading left to
      // right walks the rating from its largest component to its smallest —
      // and the ones that produce the Rating sit together instead of being
      // interleaved with the volume stats. Read from the mode's weights, so a
      // retuned weight moves its column, and a mode only shows what it rates.
      ...ratedMetrics(mode).map((m) => RATED_COLUMNS[m]),

      // Everything below here is context, not rating input: the W–L record,
      // volume, and the counts the rating deliberately does not read. (K/D is
      // rated in Gauntlet, so it already sits in the group above.)
      RATED_COLUMNS.wins,
      {
        field: 'kills',
        headerName: 'Kills',
        width: 80,
        renderCell: (p) => fmtInt(p.row.kills),
      },
      // Only where there is a squad to assist. In Solo an assist is damage
      // on a kill somebody else took — the column read 0 or 1 all the way
      // down — so it was dropped there (2026-11-03). Trio keeps it as the
      // count behind KDA.
      ...(MODES[mode].squadSize > 1
        ? [
            {
              field: 'assists',
              headerName: 'Assists',
              width: 80,
              renderCell: (p: { row: BoardRow }) => fmtInt(p.row.assists),
            } satisfies GridColDef<BoardRow>,
          ]
        : []),
      {
        field: 'headshots',
        headerName: 'HS',
        width: 76,
        description: 'Headshot kills',
        renderCell: (p) => fmtInt(p.row.headshots),
      },
      {
        field: 'killsPerMatch',
        headerName: 'K/match',
        width: 76,
        description: 'Kills per match — earns a badge, but is not part of the rating',
        renderCell: (p) => fmtNum(p.row.killsPerMatch, 1),
        getSortComparator: nullsLastComparator,
      },
      { field: 'timeSec', headerName: 'Time', width: 76, renderCell: (p) => fmtHours(p.row.timeSec) },
    ];

    // Alignment applied in one place rather than on fifteen definitions.
    // headerClassName and description land after the spread so a column
    // cannot opt out of being marked as rated by setting its own. On a
    // Rapid Royale board the lit set is the ledger — every column that
    // carries a point value — and the total they make.
    return [...base, ...ledgerColumns, ...gauntletColumns].map((c) => {
      const lit = isLedgerMode(mode)
        ? LEDGER_FIELDS.includes(c.field) || c.field === 'rating'
        : RATING_WEIGHTS[mode][c.field as RatedMetric] !== undefined;
      const medal = isLedgerMode(mode) ? medalOf(c.field) : undefined;
      const pinned = isNarrow && PINNED_LEFT[c.field] !== undefined;
      return {
        align: COLUMN_ALIGN[c.field] ?? 'center',
        headerAlign: COLUMN_ALIGN[c.field] ?? 'center',
        ...c,
        headerClassName:
          [lit && 'rated-col', medal && medal !== 'unplaced' && `medal-col medal-${medal}`, pinned && 'pinned-col']
            .filter(Boolean)
            .join(' ') || undefined,
        cellClassName: [c.cellClassName, pinned && 'pinned-col'].filter(Boolean).join(' ') || undefined,
        description: columnDescription(c.field, c.description, c.headerName, mode),
      };
    });
  }, [isNarrow, mode]);

  if (rows.length === 0) {
    return (
      <Typography sx={{ py: 4, opacity: 0.7 }}>
        No players to show for this season yet.
      </Typography>
    );
  }

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      getRowId={(r) => r.eaId}
      disableRowSelectionOnClick
      density="compact"
      hideFooter={rows.length <= FOOTER_ROW_THRESHOLD}
      // Render every cell rather than virtualising, so the pinned rank and
      // Player cells still exist once the reader has scrolled far enough right
      // that DataGrid would otherwise drop them (columnBufferPx did not hold
      // them in a real browser). Cheap: a page is at most 100 rows.
      disableVirtualization
      // Win % descending is the agreed default ordering. The page size is
      // pinned to FOOTER_ROW_THRESHOLD explicitly — hideFooter above assumes
      // a single page holds every row up to that threshold, and DataGrid's
      // own default page size is not guaranteed to stay 100 forever.
      initialState={{
        sorting: { sortModel: [{ field: 'rating', sort: 'desc' }] },
        pagination: { paginationModel: { pageSize: FOOTER_ROW_THRESHOLD } },
      }}
      sx={{
        // Take the space the parent has left rather than the space the rows
        // want. DataGrid renders its column headers outside the virtual
        // scroller, so bounding the height is all it takes to pin them — the
        // rows scroll underneath and the header row stays.
        ...(fill ? { flex: 1, minHeight: 0 } : {}),
        opacity: provisional ? 0.68 : 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 0,
        bgcolor: 'rgba(12,17,24,0.55)',
        backdropFilter: 'blur(2px)',
        // Numbers are compared down a column, so they must not shift width.
        '& .MuiDataGrid-cell': {
          fontVariantNumeric: 'tabular-nums',
          borderColor: 'rgba(27,38,52,0.7)',
        },
        '& .MuiDataGrid-columnHeaders': {
          bgcolor: 'rgba(6,8,13,0.9)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        },
        '& .MuiDataGrid-columnHeaderTitle': {
          fontFamily: 'var(--font-display), sans-serif',
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: 'text.secondary',
        },
        // Rated columns are lit in the mode's accent and underscored, so the
        // ones that produce the Rating read as a group at a glance and the
        // context columns visibly are not. The legend above the table says
        // what the marking means — colour alone would only tell someone that
        // these columns are different, not why.
        '& .MuiDataGrid-columnHeader.rated-col': {
          boxShadow: (t) => `inset 0 -2px 0 ${alpha(t.palette.primary.main, 0.85)}`,
        },
        '& .MuiDataGrid-columnHeader.rated-col .MuiDataGrid-columnHeaderTitle': {
          color: 'primary.main',
          fontWeight: 700,
        },
        // The medal table's one loud element: each medal column is set in
        // its metal, header rule and counts alike, so the eye reads gold,
        // silver, bronze before it reads a single number. Losses stay quiet.
        ...Object.fromEntries(
          (Object.keys(MEDAL_TINT) as (keyof typeof MEDAL_TINT)[]).flatMap((m) => [
            [
              `& .MuiDataGrid-columnHeader.medal-${m}`,
              { boxShadow: `inset 0 -2px 0 ${alpha(MEDAL_TINT[m], 0.9)}`, bgcolor: alpha(MEDAL_TINT[m], 0.08) },
            ],
            [`& .MuiDataGrid-columnHeader.medal-${m} .MuiDataGrid-columnHeaderTitle`, { fontSize: '1.15rem', lineHeight: 1 }],
            [`& .MuiDataGrid-cell.medal-${m}`, { color: MEDAL_TINT[m], fontWeight: 600, bgcolor: alpha(MEDAL_TINT[m], 0.04) }],
          ]),
        ),
        '& .MuiDataGrid-cell.losses-col': { color: 'text.secondary' },
        // A scanning highlight rather than a card hover: the row lights up
        // along its leading edge, like a selected line on an instrument panel.
        '& .MuiDataGrid-row:hover': {
          bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
          boxShadow: (t) => `inset 3px 0 0 ${alpha(t.palette.primary.main, 0.9)}`,
        },
        // Frozen columns. Each pinned cell sticks at its own left offset inside
        // DataGrid's scroller, and needs an opaque fill or the scrolled cells
        // show through it.
        ...Object.fromEntries(
          Object.entries(PINNED_LEFT).map(([field, left]) => [
            `& .pinned-col[data-field="${field}"]`,
            {
              position: 'sticky',
              left,
              zIndex: 3,
              // The last pinned column carries a rule so the seam is visible.
              ...(field === 'eaId' ? { borderRight: '1px solid', borderRightColor: 'divider' } : {}),
            },
          ]),
        ),
        '& .pinned-col': { bgcolor: 'background.default' },
        '& .MuiDataGrid-row:hover .pinned-col': {
          backgroundImage: (t) =>
            `linear-gradient(${alpha(t.palette.primary.main, 0.06)}, ${alpha(t.palette.primary.main, 0.06)})`,
        },
        // Above DataGrid's column separators (zIndex 30 in GridRootStyles):
        // the headers are position: relative with no z-index of their own,
        // so a scrolled-under header's separator otherwise draws through the
        // frozen "#" and "Player" headers.
        '& .MuiDataGrid-columnHeader.pinned-col': { bgcolor: 'rgba(6,8,13,1)', zIndex: 31 },
        '& .MuiDataGrid-footerContainer': { borderColor: 'divider' },
        '& .MuiDataGrid-columnSeparator': { color: 'rgba(27,38,52,0.9)' },
      }}
    />
  );
}
