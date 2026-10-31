import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotListed } from './NotListed';

describe('NotListed', () => {
  const entries = [
    { eaId: 'kathemkh9', displayName: 'Kathem', reason: 'not_found' as const },
    { eaId: 'IHerkyI', displayName: 'herky', reason: 'not_found' as const },
  ];

  it('lists every unresolved member', () => {
    render(<NotListed entries={entries} />);
    expect(screen.getByText(/kathemkh9/)).toBeInTheDocument();
    expect(screen.getByText(/IHerkyI/)).toBeInTheDocument();
  });

  it('explains the privacy fix', () => {
    render(<NotListed entries={entries} />);
    // The copy names "Everyone" twice on purpose: once for the cause, once for
    // the fix. Pin both so a future copy edit can't silently drop one.
    expect(screen.getAllByText('Everyone')).toHaveLength(2);
  });

  it('links back to the board', () => {
    render(<NotListed entries={entries} />);
    expect(screen.getByRole('link', { name: /board/i })).toHaveAttribute('href', '/');
  });

  it('reports when nobody is missing', () => {
    render(<NotListed entries={[]} />);
    expect(screen.getByText(/everyone on the roster/i)).toBeInTheDocument();
  });

  it('explains a member skipped after a failed lookup as a fault on the stats side, not privacy', () => {
    render(<NotListed entries={[{ eaId: 'hiccup', displayName: 'Hiccup', reason: 'fetch_failed' }]} />);
    expect(screen.getByText(/skipped on the last refresh/i)).toBeInTheDocument();
    expect(screen.getAllByText(/technical/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Hiccup')).toBeInTheDocument();
    expect(screen.queryByText(/went private/i)).not.toBeInTheDocument();
  });

  it('explains no_data members separately from not_found members', () => {
    render(
      <NotListed
        entries={[
          { eaId: 'kathemkh9', displayName: 'Kathem', reason: 'not_found' },
          { eaId: 'ghost', displayName: 'Ghost', reason: 'no_data' },
        ]}
      />,
    );
    expect(screen.getByText(/currently unreadable/i)).toBeInTheDocument();
    expect(screen.getByText(/went private/i)).toBeInTheDocument();
    expect(screen.getByText('Kathem')).toBeInTheDocument();
    expect(screen.getByText('Ghost')).toBeInTheDocument();
  });
});
