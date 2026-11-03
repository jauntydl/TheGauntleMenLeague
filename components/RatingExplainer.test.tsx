import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RatingExplainer } from './RatingExplainer';
import { RATING_WEIGHTS } from '@/lib/rating';
import { MIN_MATCHES } from '@/lib/ranking';

describe('RatingExplainer', () => {
  it('lists every weighted metric of every mode, so none can be silently unexplained', () => {
    render(<RatingExplainer />);
    for (const [mode, label] of [
      ['gauntlet', 'Gauntlet'],
      ['rapidRoyale', 'Rapid Royale Trio'],
      ['rapidRoyaleSolo', 'Rapid Royale Solo'],
    ] as const) {
      const table = screen.getByRole('table', { name: `${label} weights` });
      expect(table.querySelectorAll('tbody tr')).toHaveLength(Object.keys(RATING_WEIGHTS[mode]).length);
    }
  });

  it('shows the weights the code actually uses, against the right metric', () => {
    // Read from RATING_WEIGHTS rather than repeated in prose: retuning a
    // weight must not leave the page quietly lying about it. Pinned per row —
    // win rate and objective work are both 25%, so merely finding the text
    // somewhere on the page would no longer prove either row is right.
    render(<RatingExplainer />);
    const rowFor = (table: string, label: string) =>
      within(screen.getByRole('table', { name: `${table} weights` })).getByText(label).closest('tr');
    expect(rowFor('Gauntlet', 'Win rate')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.gauntlet.winPct! * 100)}%`,
    );
    expect(rowFor('Gauntlet', 'Objective points per hour')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.gauntlet.objPtsPerHour! * 100)}%`,
    );
    expect(rowFor('Rapid Royale Trio', 'Win rate')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.rapidRoyale.winPct! * 100)}%`,
    );
    expect(rowFor('Rapid Royale Trio', 'KDA')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.rapidRoyale.kda! * 100)}%`,
    );
    expect(rowFor('Rapid Royale Solo', 'Kills per minute')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.rapidRoyaleSolo.kpm! * 100)}%`,
    );
    expect(rowFor('Rapid Royale Solo', 'Top-five rate')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.rapidRoyaleSolo.top5Pct! * 100)}%`,
    );
    expect(rowFor('Rapid Royale Solo', 'Top-ten rate')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.rapidRoyaleSolo.top10Pct! * 100)}%`,
    );
  });

  it('explains Solo\'s placement ladder beside Trio\'s top three', () => {
    render(<RatingExplainer />);
    expect(screen.getByText(/top ten/i)).toBeInTheDocument();
  });

  it('credits the objective formula to its author and states it in full', () => {
    render(<RatingExplainer />);
    expect(screen.getAllByText(/Kricked/).length).toBeGreaterThan(0);
    expect(screen.getByText(/0\.1 per second on the objective/)).toBeInTheDocument();
    expect(screen.getByText(/elimination format and match length varies/)).toBeInTheDocument();
  });

  it('states the match floor from the constant', () => {
    render(<RatingExplainer />);
    expect(screen.getByText(new RegExp(`${MIN_MATCHES} matches`))).toBeInTheDocument();
  });

  it('explains that a rate counts for the games behind it, from the day of the season', () => {
    render(<RatingExplainer confidenceGames={30} weekOfSeason={3} />);
    expect(screen.getAllByText(/10 games a week/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/week 3/).length).toBeGreaterThan(0);
  });

  it('warns that a rating moves when other people play', () => {
    render(<RatingExplainer />);
    expect(screen.getByText(/can move when other people/i)).toBeInTheDocument();
  });

  it('explains what is deliberately excluded', () => {
    render(<RatingExplainer />);
    expect(screen.getByText(/headshot rate/i)).toBeInTheDocument();
    expect(screen.getByText(/finishing position/i)).toBeInTheDocument();
  });

  it('links back to the board', () => {
    render(<RatingExplainer />);
    expect(screen.getByRole('link', { name: /back to the board/i })).toHaveAttribute('href', '/');
  });
});
