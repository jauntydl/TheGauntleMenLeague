import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoinForm } from './JoinForm';

const answer = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({ status, json: async () => body } as Response);

afterEach(() => vi.unstubAllGlobals());

describe('JoinForm', () => {
  it('will not submit an empty field', async () => {
    const fetchMock = answer({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<JoinForm />);
    expect(screen.getByRole('button', { name: /add me/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the EA ID and reports where the player landed', async () => {
    const fetchMock = answer({
      ok: true, eaId: 'Newbie', season: 'Season4', rank: 12, rating: 61.4, matches: 88, provisional: false,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<JoinForm />);
    await userEvent.type(screen.getByLabelText('EA ID'), 'Newbie');
    await userEvent.click(screen.getByRole('button', { name: /add me/i }));

    await waitFor(() => expect(screen.getByText(/Newbie is in at #12/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/join', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ eaId: 'Newbie' });
  });

  it('tells a provisional player what they still need', async () => {
    vi.stubGlobal('fetch', answer({
      ok: true, eaId: 'Fresh', season: 'Season4', rank: null, rating: null, matches: 4, provisional: true,
    }));

    render(<JoinForm />);
    await userEvent.type(screen.getByLabelText('EA ID'), 'Fresh');
    await userEvent.click(screen.getByRole('button', { name: /add me/i }));

    await waitFor(() => expect(screen.getByText(/provisionally/i)).toBeInTheDocument());
    expect(screen.getByText(/4 Season4 matches/)).toBeInTheDocument();
  });

  it('reports points, not a rating, on a Rapid Royale board', async () => {
    vi.stubGlobal('fetch', answer({
      ok: true, eaId: 'Trio', season: 'Season5 Trio', rank: 7, rating: 1990, matches: 85, provisional: false, ledger: true,
    }));

    render(<JoinForm />);
    await userEvent.type(screen.getByLabelText('EA ID'), 'Trio');
    await userEvent.click(screen.getByRole('button', { name: /add me/i }));

    await waitFor(() => expect(screen.getByText(/Trio is in at #7/)).toBeInTheDocument());
    expect(screen.getByText(/1,990 points across 85 Season5 Trio matches/)).toBeInTheDocument();
  });

  it('tells a Provisional Rapid Royale player their points and what earns a rank', async () => {
    vi.stubGlobal('fetch', answer({
      ok: true, eaId: 'Below', season: 'Season5 Trio', rank: null, rating: -40, matches: 12, provisional: true, ledger: true,
    }));

    render(<JoinForm />);
    await userEvent.type(screen.getByLabelText('EA ID'), 'Below');
    await userEvent.click(screen.getByRole('button', { name: /add me/i }));

    await waitFor(() => expect(screen.getByText(/provisionally/i)).toBeInTheDocument());
    expect(screen.getByText(/12 Season5 Trio matches and −40 points/)).toBeInTheDocument();
    expect(screen.getByText(/30 matches and a total above zero/)).toBeInTheDocument();
  });

  it('shows the server’s own wording when it refuses', async () => {
    // The route explains why in terms the visitor can act on, so the form
    // must not paper over it with a generic failure message.
    vi.stubGlobal('fetch', answer({ ok: false, reason: 'not_found', message: 'EA could not find a player called Ghost.' }, 404));

    render(<JoinForm />);
    await userEvent.type(screen.getByLabelText('EA ID'), 'Ghost');
    await userEvent.click(screen.getByRole('button', { name: /add me/i }));

    await waitFor(() => expect(screen.getByText(/EA could not find a player called Ghost/)).toBeInTheDocument());
  });

  it('survives the request failing outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<JoinForm />);
    await userEvent.type(screen.getByLabelText('EA ID'), 'Newbie');
    await userEvent.click(screen.getByRole('button', { name: /add me/i }));

    await waitFor(() => expect(screen.getByText(/could not reach the board/i)).toBeInTheDocument());
    // Still usable: the button comes back rather than spinning forever.
    expect(screen.getByRole('button', { name: /add me/i })).toBeEnabled();
  });
});
