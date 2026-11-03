'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { ThemeProvider, alpha } from '@mui/material/styles';
import { LeaderboardTable } from './LeaderboardTable';
import { SecretRefresh } from './SecretRefresh';
import { formatEastern, nextRefreshAfter } from '@/lib/schedule';
import { boardKey, modeForSeason, modesForSeason, type ModeKey } from '@/lib/modes';
import type { BoardFile } from '@/lib/types';
import { MODE_ACCENT, MODE_THEMES } from '@/app/theme';

/** "Season5" reads as "Season 5". */
const seasonLabel = (key: string): string => key.replace(/^(\D+?)(\d+)$/, '$1 $2');

export function BoardView({ board }: { board: BoardFile }) {
  const [season, setSeason] = React.useState(board.meta.currentSeason);
  // Ranked and Provisional are two answers to the same question, so they take
  // turns in one table rather than stacking. Stacking is what forced the page
  // to scroll, which cost the pinned header its point.
  const [view, setView] = React.useState<'ranked' | 'provisional'>('ranked');
  // Which of the season's boards — Trio or Solo — is showing. Kept across a
  // season change, and falls back to the season's main board where the
  // season has no such board.
  const [modeKey, setModeKey] = React.useState<ModeKey>(modeForSeason(board.meta.currentSeason).key);

  // Only the boards the file actually holds: a season archived before it had
  // a Solo board must not offer an empty one.
  const present = modesForSeason(season).filter((m) => boardKey(season, m) in board.seasons);
  const modes = present.length > 0 ? present : [modeForSeason(season)];
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0];
  const key = boardKey(season, mode);

  const ranked = board.seasons[key] ?? [];
  const provisional = board.provisional[key] ?? [];
  const showingProvisional = view === 'provisional';
  const rows = showingProvisional ? provisional : ranked;

  // The whole board takes the selected season's accent, not just the table:
  // the title glow, the button and the scrollbars all say which mode this is.
  return (
    <ThemeProvider theme={MODE_THEMES[mode.key]}>
    <Container
      maxWidth="xl"
      sx={{
        // The board owns exactly one viewport and never more. Everything above
        // the table is fixed height; the table takes what is left and scrolls
        // inside itself, so the page body has nothing to scroll.
        //
        // dvh rather than vh: on mobile Safari and Chrome, vh is the viewport
        // with the URL bar hidden, so a vh-sized page is taller than the
        // screen the moment the bar is showing — which is exactly the body
        // scrollbar this is meant to remove.
        height: '100dvh',
        // Read by the global scrollbar rules in globals.css.
        '--accent': MODE_ACCENT[mode.key],
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        py: { xs: 1.5, sm: 2.5 },
        px: { xs: 2, sm: 3 },
      }}
    >
      <Box
        component="header"
        sx={{
          flex: '0 0 auto',
          mb: 1.5,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', minWidth: 0 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontSize: { xs: '1.6rem', sm: '2.2rem' },
              lineHeight: 1.05,
              color: 'text.primary',
              textShadow: (t) => `0 0 28px ${alpha(t.palette.primary.main, 0.28)}`,
            }}
          >
            The GauntleMen League
          </Typography>

          {/* Both times in US Eastern, named so nobody has to guess, and both
              derived from builtAt so the server and the browser render the
              same string. "Stats read" rather than "updated": a signup adds a
              player without re-reading anyone else's stats. "after" because
              the job is scheduled, not guaranteed — see lib/schedule.ts.
              Five quick taps on it open the owner's manual refresh. */}
          <SecretRefresh>
          <Chip
            size="small"
            variant="outlined"
            className="tnum"
            label={`Stats read ${formatEastern(new Date(board.meta.builtAt))} · next refresh after ${formatEastern(nextRefreshAfter(new Date(board.meta.builtAt)))}`}
            sx={{
              borderColor: 'divider',
              color: 'text.secondary',
              // Chips are single-line by default, which overflows a phone at
              // this length. Let the label wrap and the chip grow instead.
              height: 'auto',
              '& .MuiChip-label': { whiteSpace: 'normal', py: 0.4, lineHeight: 1.35 },
            }}
          />
          </SecretRefresh>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
          <Link href="/rating" variant="body2">
            How the rating works
          </Link>
          <Link href="/not-listed" variant="body2">
            Not listed?
          </Link>
          <Button
            href="/join"
            variant="contained"
            sx={{
              flex: '0 0 auto',
              px: 3,
              py: 1,
              fontWeight: 700,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              // Lit rather than outlined: this is the one thing a visitor who
              // is not on the board should do, and it competes with a table
              // full of amber numbers for attention.
              boxShadow: (t) => `0 0 24px ${alpha(t.palette.primary.main, 0.35)}`,
              '&:hover': { boxShadow: (t) => `0 0 32px ${alpha(t.palette.primary.main, 0.5)}` },
            }}
          >
            Add your EA ID
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Tabs
          value={season}
          onChange={(_e, v: string) => setSeason(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {/* Each tab names its mode and is drawn in its mode's accent, so the
              strip itself is the key: amber Gauntlet seasons, magenta Rapid
              Royale ones. Every season but the current one is archived — its
              standings were frozen when it ended (see buildBoard). */}
          {board.meta.seasons.map((s) => {
            const m = modeForSeason(s);
            const current = s === board.meta.currentSeason;
            return (
              <Tab
                key={s}
                value={s}
                sx={{ '&.Mui-selected': { color: MODE_ACCENT[m.key] }, lineHeight: 1.15, py: 0.75 }}
                label={
                  <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span>{seasonLabel(s)}</span>
                    <Box
                      component="span"
                      sx={{ fontSize: '0.68rem', letterSpacing: '0.06em', color: MODE_ACCENT[m.key], opacity: 0.85 }}
                    >
                      {m.label} · {current ? 'current' : 'archived'}
                    </Box>
                  </Box>
                }
              />
            );
          })}
        </Tabs>

        {/* The mode and the Ranked / Provisional switch sit together on the
            right: both choose which table shows, the season strip which season. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* The season's own boards, where it has more than one: Rapid Royale
              is ranked separately for Trio and for Solo. */}
          {modes.length > 1 && (
            <Tabs
              value={mode.key}
              onChange={(_e, v: ModeKey) => setModeKey(v)}
              aria-label="Which mode to show"
              sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
            >
              {modes.map((m) => (
                <Tab key={m.key} value={m.key} label={m.variant ?? m.label} />
              ))}
            </Tabs>
          )}

          {/* Counts on the labels because an empty side is a dead end otherwise:
              a new season has no ranked players at first, and without the number the
              reader would click into a blank table to find that out. */}
          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            onChange={(_e, v: 'ranked' | 'provisional' | null) => v && setView(v)}
            aria-label="Which players to show"
          >
            <ToggleButton value="ranked">Ranked ({ranked.length})</ToggleButton>
            <ToggleButton value="provisional">Provisional ({provisional.length})</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* min-height: 0 is load-bearing. A flex child defaults to min-height
          auto, which refuses to shrink below its content — so without it the
          table grows to fit every row and pushes the page taller than the
          viewport, which is the whole problem. */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <LeaderboardTable
          rows={rows}
          mode={mode.key}
          provisional={showingProvisional}
          confidenceGames={board.meta.confidenceGames}
          fill
        />
      </Box>
    </Container>
    </ThemeProvider>
  );
}
