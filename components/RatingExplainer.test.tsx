import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RatingExplainer } from './RatingExplainer';
import { RATING_WEIGHTS } from '@/lib/rating';
import { MIN_MATCHES } from '@/lib/ranking';

describe('RatingExplainer', () => {
  it('lists every weighted metric, so none can be silently unexplained', () => {
    render(<RatingExplainer />);
    for (const weight of Object.values(RATING_WEIGHTS)) {
      expect(screen.getAllByText(`${Math.round(weight * 100)}%`).length).toBeGreaterThan(0);
    }
  });

  it('shows the weights the code actually uses, against the right metric', () => {
    // Read from RATING_WEIGHTS rather than repeated in prose: retuning a
    // weight must not leave the page quietly lying about it. Pinned per row —
    // win rate and objective work are both 25%, so merely finding the text
    // somewhere on the page would no longer prove either row is right.
    render(<RatingExplainer />);
    const rowFor = (label: string) => screen.getByText(label).closest('tr');
    expect(rowFor('Win rate')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.winPct * 100)}%`,
    );
    expect(rowFor('Objective points per hour')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.objPtsPerHour * 100)}%`,
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
