'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { LeaderboardTable } from './LeaderboardTable';
import { MIN_MATCHES } from '@/lib/ranking';
import { formatEastern, nextRefreshAfter } from '@/lib/schedule';
import { ratedSummary } from '@/lib/rating';
import type { BoardFile } from '@/lib/types';

export function BoardView({ board }: { board: BoardFile }) {
  const [season, setSeason] = React.useState(board.meta.currentSeason);

  const ranked = board.seasons[season] ?? [];
  const provisional = board.provisional[season] ?? [];

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
      <Box
        component="header"
        sx={{
          mb: 3,
          pb: 2.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: { xs: 'stretch', sm: 'flex-end' },
          justifyContent: 'space-between',
          gap: 2,
          // The call to action sits beside the title on a desktop and under
          // it on a phone, where a row would squeeze both into nothing.
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontSize: { xs: '1.9rem', sm: '2.6rem' },
              lineHeight: 1.05,
              color: 'text.primary',
              textShadow: '0 0 28px rgba(255,176,32,0.28)',
            }}
          >
            The GauntleMen League
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            Battlefield 6 Gauntlet. Eight squads start, one is left standing.
          </Typography>
          {/* Both times in US Eastern, named so nobody has to guess, and both
              derived from builtAt so the server and the browser render the
              same string. "Stats read" rather than "updated": a signup adds a
              player without re-reading anyone else's stats. */}
          <Typography
            variant="caption"
            className="tnum"
            sx={{ color: 'text.secondary', opacity: 0.75, display: 'block', mt: 0.5 }}
          >
            Stats read {formatEastern(new Date(board.meta.builtAt))} · next refresh after{' '}
            {formatEastern(nextRefreshAfter(new Date(board.meta.builtAt)))}
          </Typography>
        </Box>

        <Button
          href="/join"
          variant="contained"
          size="large"
          sx={{
            flex: '0 0 auto',
            alignSelf: { xs: 'flex-start', sm: 'flex-end' },
            px: 3,
            py: 1.15,
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

      <Tabs
        value={season}
        onChange={(_e, v: string) => setSeason(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2 }}
      >
        {board.meta.seasons.map((s) => (
          <Tab
            key={s}
            value={s}
            label={s === board.meta.currentSeason ? `${s} (current)` : s}
          />
        ))}
      </Tabs>

      {/* State the rule where the ranking is, not only in the Provisional
          section below it — someone looking at the top of the board should
          not have to scroll to learn what qualified these players. */}
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
        Ranked by overall rating, minimum {MIN_MATCHES} matches this season. Rating
        blends {ratedSummary()}, each scored against the
        rest of the field — <Link href="/rating">how that works</Link>.
        Fewer matches and you appear under Provisional.
      </Typography>

      <LeaderboardTable rows={ranked} />

      {provisional.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" component="h2">
            Provisional
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.7, mb: 1 }}>
            Fewer than {MIN_MATCHES} matches this season — not yet ranked.
          </Typography>
          <LeaderboardTable rows={provisional} provisional />
        </Box>
      )}

      <Box sx={{ mt: 4, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        <Link href="/rating">How the rating works</Link>
        <Link href="/not-listed">Not listed? Here&apos;s why</Link>
      </Box>
    </Container>
  );
}
