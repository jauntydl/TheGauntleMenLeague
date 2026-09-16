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
import { LeaderboardTable } from './LeaderboardTable';
import { formatEastern, nextRefreshAfter } from '@/lib/schedule';
import type { BoardFile } from '@/lib/types';

export function BoardView({ board }: { board: BoardFile }) {
  const [season, setSeason] = React.useState(board.meta.currentSeason);
  // Ranked and Provisional are two answers to the same question, so they take
  // turns in one table rather than stacking. Stacking is what forced the page
  // to scroll, which cost the pinned header its point.
  const [view, setView] = React.useState<'ranked' | 'provisional'>('ranked');

  const ranked = board.seasons[season] ?? [];
  const provisional = board.provisional[season] ?? [];
  const showingProvisional = view === 'provisional';
  const rows = showingProvisional ? provisional : ranked;

  return (
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
              textShadow: '0 0 28px rgba(255,176,32,0.28)',
            }}
          >
            The GauntleMen League
          </Typography>

          {/* Both times in US Eastern, named so nobody has to guess, and both
              derived from builtAt so the server and the browser render the
              same string. "Stats read" rather than "updated": a signup adds a
              player without re-reading anyone else's stats. "after" because
              the job is scheduled, not guaranteed — see lib/schedule.ts. */}
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
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
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
              boxShadow: '0 0 24px rgba(255,176,32,0.35)',
              '&:hover': { boxShadow: '0 0 32px rgba(255,176,32,0.5)' },
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
          {board.meta.seasons.map((s) => (
            <Tab
              key={s}
              value={s}
              label={s === board.meta.currentSeason ? `${s} (current)` : s}
            />
          ))}
        </Tabs>

        {/* Counts on the labels because an empty side is a dead end otherwise:
            Season 2 has no ranked players at all, and without the number the
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

      {/* min-height: 0 is load-bearing. A flex child defaults to min-height
          auto, which refuses to shrink below its content — so without it the
          table grows to fit every row and pushes the page taller than the
          viewport, which is the whole problem. */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <LeaderboardTable rows={rows} provisional={showingProvisional} fill />
      </Box>
    </Container>
  );
}
