import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RatingExplainer } from './RatingExplainer';
import { RATING_WEIGHTS } from '@/lib/rating';
import { MIN_MATCHES } from '@/lib/ranking';

describe('RatingExplainer', () => {
  it("shows the placement points and both modes' rungs from the constants", () => {
    render(<RatingExplainer />);
    const t = screen.getByRole('table', { name: 'Rapid Royale placement points' });
    const rowFor = (label: string) => within(t).getByText(label).closest('tr')!;
    expect(rowFor('Gold')).toHaveTextContent('1st place');
    expect(rowFor('Gold')).toHaveTextContent('+20');
    expect(rowFor('Silver')).toHaveTextContent('2nd–3rd place');
    expect(rowFor('Silver')).toHaveTextContent('2nd–5th place');
    expect(rowFor('Silver')).toHaveTextContent('+10');
    expect(rowFor('Bronze')).toHaveTextContent('4th–5th place');
    expect(rowFor('Bronze')).toHaveTextContent('6th–10th place');
    expect(rowFor('Bronze')).toHaveTextContent('+0');
    expect(rowFor('Loss')).toHaveTextContent('6th or worse');
    expect(rowFor('Loss')).toHaveTextContent('11th or worse');
    expect(rowFor('Loss')).toHaveTextContent('−5');
  });

  it('lets the point tables scroll inside themselves on a narrow screen', () => {
    // Four nowrap columns outrun a phone; the table, not the page, must scroll.
    render(<RatingExplainer />);
    for (const name of ['Rapid Royale placement points', 'Rapid Royale fight points', 'Gauntlet weights']) {
      expect(screen.getByRole('table', { name }).closest('.MuiTableContainer-root')).not.toBeNull();
    }
  });

  it('shows the fight points from the constants', () => {
    render(<RatingExplainer />);
    const t = screen.getByRole('table', { name: 'Rapid Royale fight points' });
    expect(within(t).getByText('Kill').closest('tr')).toHaveTextContent('+1');
    expect(within(t).getByText('Assist').closest('tr')).toHaveTextContent('+0.5');
    expect(within(t).getByText('Death').closest('tr')).toHaveTextContent('−1');
  });

  it("says the total is a plain sum that only the player's own games move", () => {
    render(<RatingExplainer />);
    expect(screen.getAllByText(/season total/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/only when you play/i)).toBeInTheDocument();
    // The blend is gone with the rates it blended.
    expect(screen.queryByText(/league-average/i)).toBeNull();
    expect(screen.queryByText(/games ÷/)).toBeNull();
  });

  it('names the reference columns as not part of the points', () => {
    render(<RatingExplainer />);
    const reference = screen.getByText(/reference only/i).closest('p')!;
    expect(reference).toHaveTextContent(/kills per minute/i);
    expect(reference).toHaveTextContent(/damage per minute/i);
    expect(reference).toHaveTextContent(/revives/i);
  });

  it('states who is ranked: the match floor and a total above zero', () => {
    render(<RatingExplainer />);
    const rule = screen.getByText(/a total above zero/i);
    expect(rule).toHaveTextContent(new RegExp(`${MIN_MATCHES} matches`));
    expect(rule).toHaveTextContent(/Provisional/);
  });

  it('keeps the Gauntlet weights for the archive, and no Rapid Royale weights', () => {
    render(<RatingExplainer />);
    const table = screen.getByRole('table', { name: 'Gauntlet weights' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(Object.keys(RATING_WEIGHTS.gauntlet).length);
    const rowFor = (label: string) => within(table).getByText(label).closest('tr');
    expect(rowFor('Win rate')).toHaveTextContent(`${Math.round(RATING_WEIGHTS.gauntlet.winPct! * 100)}%`);
    expect(rowFor('Objective points per hour')).toHaveTextContent(
      `${Math.round(RATING_WEIGHTS.gauntlet.objPtsPerHour! * 100)}%`,
    );
    expect(screen.queryByRole('table', { name: 'Rapid Royale Trio weights' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Rapid Royale Solo weights' })).toBeNull();
  });

  it('credits the objective formula to its author and states it in full', () => {
    render(<RatingExplainer />);
    expect(screen.getAllByText(/Kricked/).length).toBeGreaterThan(0);
    expect(screen.getByText(/0\.1 per second on the objective/)).toBeInTheDocument();
    expect(screen.getByText(/elimination format and match length varies/)).toBeInTheDocument();
  });

  it('links back to the board', () => {
    render(<RatingExplainer />);
    expect(screen.getByRole('link', { name: /back to the board/i })).toHaveAttribute('href', '/');
  });
});
