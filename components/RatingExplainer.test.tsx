import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RatingExplainer } from './RatingExplainer';
import { RATING_WEIGHTS } from '@/lib/rating';
import { MIN_MATCHES } from '@/lib/ranking';

describe('RatingExplainer', () => {
  it('lists every weighted metric of both modes, so none can be silently unexplained', () => {
    render(<RatingExplainer />);
    for (const [mode, label] of [['gauntlet', 'Gauntlet'], ['rapidRoyale', 'Rapid Royale']] as const) {
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
    expect(rowFor('Rapid Royale', 'Win rate')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.rapidRoyale.winPct! * 100)}%`,
    );
    expect(rowFor('Rapid Royale', 'KDA')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.rapidRoyale.kda! * 100)}%`,
    );
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
