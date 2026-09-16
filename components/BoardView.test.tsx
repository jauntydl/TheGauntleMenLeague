import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('BoardView', () => {
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

  it('reaches the provisional players through the toggle', () => {
    // Ranked and Provisional take turns in one table so the board fits one
    // viewport. Provisional is therefore a click away, not a scroll away.
    render(<BoardView board={board} />);
    expect(screen.queryByText('Rookie')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /provisional \(1\)/i }));
    expect(screen.getByText('Rookie')).toBeInTheDocument();
  });

  it('counts both sides on the toggle, so an empty one is not a dead end', () => {
    render(<BoardView board={board} />);
    // Counts read from the fixture, so growing it cannot silently pass.
    const r = board.seasons.Season4.length;
    const pv = board.provisional.Season4.length;
    expect(screen.getByRole('button', { name: new RegExp(`ranked \\(${r}\\)`, 'i') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(`provisional \\(${pv}\\)`, 'i') })).toBeInTheDocument();
  });

  it('keeps the page to one viewport so only the table scrolls', () => {
    // The pinned header is only worth having if the body cannot scroll past
    // it. jsdom lays out no scrollbars, so this asserts the contract that
    // produces that — a viewport-height, overflow-hidden shell — rather than
    // the scrollbar itself, which nothing here can observe.
    const { container } = render(<BoardView board={board} />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell).toHaveStyle({ height: '100dvh', overflow: 'hidden' });
  });

  it('points at the rating explanation exactly once', () => {
    // Three separate links pointed at /rating at one stage — the header, the
    // summary line and the table legend. The legend is the one that earns it:
    // it sits directly above the amber columns it explains.
    render(<BoardView board={board} />);
    const toRating = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/rating');
    expect(toRating).toHaveLength(1);
  });

  it('carries no masthead subtitle and no rules paragraph', () => {
    // The board is the explanation now: the table legend names what builds
    // the Rating and links to the page that gives the weights. Everything
    // else above the table was prose the reader had to step over.
    render(<BoardView board={board} />);
    expect(screen.queryByText(/eight squads start/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ranked by overall rating/i)).not.toBeInTheDocument();
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
