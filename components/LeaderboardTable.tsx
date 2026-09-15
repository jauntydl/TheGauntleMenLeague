'use client';

import * as React from 'react';
import { DataGrid, type GridColDef, type GridComparatorFn, type GridSortDirection } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { BoardRow } from '@/lib/types';
import { JET_BADGE_THRESHOLD } from '@/lib/metrics';
import type { StandoutTrait } from '@/lib/rating';

const DASH = '—';

// Grids with 100 rows or fewer show every row without paging, so the footer
// (page size / page controls) has nothing useful to control — hide it.
const FOOTER_ROW_THRESHOLD = 100;

export const fmtPct = (v: number | null): string => (v === null ? DASH : `${v.toFixed(1)}%`);
export const fmtNum = (v: number | null, digits = 2): string => (v === null ? DASH : v.toFixed(digits));
export const fmtHours = (sec: number): string => `${(sec / 3600).toFixed(1)}h`;

/**
 * Thousands separators for counts: 10,000 reads faster than 10000 down a
 * column. The locale is pinned rather than left to the runtime — the server
 * and the browser can disagree on it, and that is a hydration mismatch.
 */
const INT = new Intl.NumberFormat('en-US');
export const fmtInt = (v: number): string => INT.format(v);

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
      detail: `Pilot — ${row.jetPct.toFixed(1)}% of Gauntlet time flown in jets`,
    });
  }

  return earned;
}

export function LeaderboardTable({
  rows,
  provisional = false,
}: {
  rows: BoardRow[];
  provisional?: boolean;
}) {
  // noSsr: true avoids a hydration mismatch — without it the server always
  // renders the desktop (non-matching) layout and the client immediately
  // re-renders narrow, producing a visible flash and a markup mismatch.
  // Three tiers, because two were not enough: the full board is ~1330px of
  // columns, which overflows a 1280px laptop even at full container width.
  // Rather than let it scroll sideways, progressively drop the columns a
  // reader is least likely to be scanning for.
  const isNarrow = useMediaQuery('(max-width:600px)', { noSsr: true });
  const isMedium = useMediaQuery('(max-width:1280px)', { noSsr: true });

  // Depends on isNarrow: a phone has roughly 368px of usable width, so the
  // handful of columns it does show have to be narrower too, not just fewer.
  const columns = React.useMemo<GridColDef<BoardRow>[]>(() => {
    // Annotated before the map: without it the array literal loses its
    // type and every renderCell parameter falls back to any.
    const base: GridColDef<BoardRow>[] = [
      {
        field: 'rank',
        headerName: '#',
        width: isNarrow ? 44 : 68,
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
                textShadow:
                  p.row.rank === 1
                    ? '0 0 18px rgba(255,176,32,0.75)'
                    : p.row.rank <= 3
                      ? '0 0 10px rgba(255,176,32,0.35)'
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
        flex: 1,
        minWidth: isNarrow ? 104 : 150,
        description:
          'The name on the scoreboard in game. Hover a player for their EA ID and the name they go by in Discord.',
        // Sort on what is read, not on the EA ID behind it.
        valueGetter: (_v, r) => r.inGameName ?? r.eaId,
        renderCell: (p) => {
          const shown = p.row.inGameName ?? p.row.eaId;
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
      {
        field: 'rating',
        headerName: 'Rating',
        width: isNarrow ? 92 : 124,
        description:
          'Overall rating out of 100: win rate 40%, objectives 15%, K/D 15%, kills per match 12%, damage per minute 10%, revives per hour 8% — each scored against the rest of the ranked field.',
        renderCell: (p) =>
          p.row.rating === null ? (
            <Box component="span" sx={{ color: 'text.secondary' }}>{DASH}</Box>
          ) : (
            <Box component="span" className="tnum" sx={{ fontWeight: 600, color: 'primary.main' }}>
              {p.row.rating.toFixed(1)}
            </Box>
          ),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'sniperPct',
        headerName: 'Badges',
        width: 130,
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
      { field: 'matches', headerName: 'M', width: 70 },
      {
        field: 'record',
        headerName: 'W–L',
        width: 84,
        valueGetter: (_v, r) => `${r.wins}–${r.losses}`,
      },
      {
        field: 'winPct',
        headerName: 'Win %',
        width: 84,
        renderCell: (p) => fmtPct(p.row.winPct),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'kills',
        headerName: 'Kills',
        width: 88,
        renderCell: (p) => fmtInt(p.row.kills),
      },
      {
        field: 'headshots',
        headerName: 'HS',
        width: 88,
        description: 'Headshot kills',
        renderCell: (p) => fmtInt(p.row.headshots),
      },
      {
        field: 'kd',
        headerName: 'K/D',
        width: 80,
        renderCell: (p) => fmtNum(p.row.kd),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'killsPerMatch',
        headerName: 'K/match',
        width: 84,
        description: 'Kills per match',
        renderCell: (p) => fmtNum(p.row.killsPerMatch, 1),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'kpm',
        headerName: 'KPM',
        width: 80,
        // Spelled out because K/match sits next to it and both start with K.
        description: 'Kills per minute',
        renderCell: (p) => fmtNum(p.row.kpm),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'dpm',
        headerName: 'DPM',
        width: 84,
        renderCell: (p) => fmtNum(p.row.dpm, 0),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'spm',
        headerName: 'SPM',
        width: 84,
        description: 'Score per minute',
        renderCell: (p) => fmtNum(p.row.spm, 0),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'objPtsPerHour',
        headerName: 'OBJ/h',
        width: 88,
        description:
          'Objective points per hour: 0.1 per second on the objective, 10 per objective destroyed, 5 per disarm, 3 per intel pickup',
        renderCell: (p) => fmtNum(p.row.objPtsPerHour, 0),
        getSortComparator: nullsLastComparator,
      },
      {
        field: 'revivesPerHour',
        headerName: 'Rev/h',
        width: 84,
        description: 'Revives per hour played',
        renderCell: (p) => fmtNum(p.row.revivesPerHour, 1),
        getSortComparator: nullsLastComparator,
      },
      { field: 'timeSec', headerName: 'Time', width: 84, renderCell: (p) => fmtHours(p.row.timeSec) },
    ];

    // Alignment applied in one place rather than on fifteen definitions.
    return base.map((c) => ({
      align: COLUMN_ALIGN[c.field] ?? 'center',
      headerAlign: COLUMN_ALIGN[c.field] ?? 'center',
      ...c,
    }));
  }, [isNarrow]);

  // Actually remove secondary columns from DataGrid's own column set on
  // narrow viewports, rather than hiding their cells with CSS — DataGrid
  // sizes its virtual scroller from the columns array, so CSS-only hiding
  // leaves the column's track (and horizontal scroll space) behind.
  const columnVisibility = React.useMemo(
    () => ({
      // A phone keeps only rank, player, rating and win rate — 310px of the
      // ~368px available. Match count and record go; the rating already
      // encodes them and the floor guarantees a meaningful sample.
      matches: !isNarrow,
      record: !isNarrow,
      // From a tablet up: how they play and their headline combat rates.
      sniperPct: !isNarrow,
      kd: !isNarrow,
      killsPerMatch: !isNarrow,
      // Only on a wide screen: the supporting detail.
      kills: !isMedium,
      headshots: !isMedium,
      kpm: !isMedium,
      dpm: !isMedium,
      spm: !isMedium,
      // Objective work is a quarter of the rating, so it earns a place a step
      // earlier than the other supporting rates.
      objPtsPerHour: !isNarrow,
      revivesPerHour: !isMedium,
      timeSec: !isMedium,
    }),
    [isNarrow, isMedium],
  );

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
      columnVisibilityModel={columnVisibility}
      // Win % descending is the agreed default ordering. The page size is
      // pinned to FOOTER_ROW_THRESHOLD explicitly — hideFooter above assumes
      // a single page holds every row up to that threshold, and DataGrid's
      // own default page size is not guaranteed to stay 100 forever.
      initialState={{
        sorting: { sortModel: [{ field: 'rating', sort: 'desc' }] },
        pagination: { paginationModel: { pageSize: FOOTER_ROW_THRESHOLD } },
      }}
      sx={{
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
        // A scanning highlight rather than a card hover: the row lights up
        // along its leading edge, like a selected line on an instrument panel.
        '& .MuiDataGrid-row:hover': {
          bgcolor: 'rgba(255,176,32,0.06)',
          boxShadow: 'inset 3px 0 0 rgba(255,176,32,0.9)',
        },
        '& .MuiDataGrid-footerContainer': { borderColor: 'divider' },
        '& .MuiDataGrid-columnSeparator': { color: 'rgba(27,38,52,0.9)' },
      }}
    />
  );
}
