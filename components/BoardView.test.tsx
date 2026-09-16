import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardView } from './BoardView';
import type { BoardFile, BoardRow } from '@/lib/types';
import { MIN_MATCHES } from '@/lib/ranking';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', platform: 'pc', region: 'NA West', mainMode: 'gauntlet',
  matches: 20, wins: 10, losses: 10, kills: 100, headshots: 25, deaths: 50, damage: 1000,
  assists: 0, revives: 0, score: 42000, timeSec: 3600,
  winPct: 50, kd: 2, killsPerMatch: 5, kpm: 1, dpm: 10, spm: 700, objPerMatch: 1.5, objPts: 900, objPtsPerHour: 60, revivesPerHour: 3, rating: 50, standouts: [], sniperPct: 20, autoPct: 75, sniperKills: 20, autoKills: 75, sniperPerMatch: 1, autoPerMatch: 3.75, jetPct: 0, rank: 1,
  ...over,
  // The Player column shows the in-game id, so fixtures are named by it.
  displayName: over.displayName ?? over.eaId ?? 'X',
});

const board: BoardFile = {
  meta: { currentSeason: 'Season4', seasons: ['Season3', 'Season4'], builtAt: '2026-09-12T00:00:00.000Z' },
  seasons: {
    Season4: [row({ eaId: 'Current' })],
    Season3: [row({ eaId: 'Archived' })],
  },
  provisional: { Season4: [row({ eaId: 'Rookie', matches: 3, rank: null })], Season3: [] },
  unresolved: [],
};

import { RATING_WEIGHTS, RATED_LABELS, ratedSummary, type RatedMetric } from '@/lib/rating';

describe('BoardView', () => {
  it('names every rated metric in the summary line', () => {
    // This line said "win rate, K/D, kills, damage and revives" for a while
    // after the rating had stopped working that way. Derived from
    // RATING_WEIGHTS on both sides so it cannot drift again. Matched on the
    // container because an inline <Link> splits the sentence across nodes.
    const { container } = render(<BoardView board={board} />);
    expect(container).toHaveTextContent(ratedSummary());
    for (const m of Object.keys(RATING_WEIGHTS) as RatedMetric[]) {
      expect(ratedSummary()).toContain(RATED_LABELS[m]);
    }
  });

  it('lists the rated metrics heaviest first', () => {
    const summary = ratedSummary();
    const positions = (Object.keys(RATING_WEIGHTS) as RatedMetric[])
      .sort((a, b) => RATING_WEIGHTS[b] - RATING_WEIGHTS[a])
      .map((m) => summary.indexOf(RATED_LABELS[m]));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('promises a refresh "after" the scheduled time, not at it', () => {
    // GitHub schedules are best-effort and this job has run hours late every
    // time. Saying "next refresh <time>" made lateness look like breakage.
    render(<BoardView board={board} />);
    expect(screen.getByText(/next refresh after/)).toBeInTheDocument();
  });

  it('puts the signup call to action in the header', () => {
    // A visitor who is not on the board should not have to scroll past the
    // whole table to find out they can add themselves.
    render(<BoardView board={board} />);
    const cta = screen.getByRole('link', { name: /add your EA ID/i });
    expect(cta).toHaveAttribute('href', '/join');
  });

  it('opens on the current season', () => {
    render(<BoardView board={board} />);
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('renders a tab per season', () => {
    render(<BoardView board={board} />);
    expect(screen.getByRole('tab', { name: /Season4/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Season3/ })).toBeInTheDocument();
  });

  it('switches seasons', async () => {
    render(<BoardView board={board} />);
    await userEvent.click(screen.getByRole('tab', { name: /Season3/ }));
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('shows the provisional section', () => {
    render(<BoardView board={board} />);
    expect(screen.getByRole('heading', { name: /provisional/i })).toBeInTheDocument();
    expect(screen.getByText('Rookie')).toBeInTheDocument();
  });

  it('states the ranking rule and the match floor on the board', () => {
    render(<BoardView board={board} />);
    // The rule has to be visible where the ranking is, not only inside the
    // Provisional section, which a reader may never scroll to.
    expect(screen.getByText(/ranked by overall rating/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`minimum ${MIN_MATCHES} matches`, 'i'))).toBeInTheDocument();
  });

  it('links to the rating explanation', () => {
    render(<BoardView board={board} />);
    // A column tooltip is invisible on a phone, which is where most people
    // open this — the explanation needs a reachable page.
    expect(screen.getAllByRole('link', { name: /how (the rating works|that works)/i })[0])
      .toHaveAttribute('href', '/rating');
  });

  it('links to the not-listed page', () => {
    render(<BoardView board={board} />);
    expect(screen.getByRole('link', { name: /not listed/i })).toHaveAttribute('href', '/not-listed');
  });

});
