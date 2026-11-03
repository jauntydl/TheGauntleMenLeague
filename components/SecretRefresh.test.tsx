import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SecretRefresh, SECRET_TAPS } from './SecretRefresh';

const setup = () =>
  render(
    <SecretRefresh>
      <span>Stats read today</span>
    </SecretRefresh>,
  );

afterEach(() => vi.unstubAllGlobals());

describe('SecretRefresh', () => {
  it('shows nothing extra until tapped enough times', () => {
    setup();
    const text = screen.getByText('Stats read today');
    for (let i = 0; i < SECRET_TAPS - 1; i++) fireEvent.click(text);
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    // Nothing to give it away: no button role on the wrapped text.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens a password box on the fifth quick tap and reports the server answer', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, message: 'Refresh started.' }));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    const text = screen.getByText('Stats read today');
    for (let i = 0; i < SECRET_TAPS; i++) fireEvent.click(text);

    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /refresh now/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Refresh started.'));
    expect(fetchMock).toHaveBeenCalledWith('/api/refresh', expect.objectContaining({ method: 'POST' }));
  });

  it('does not count taps spread out over time', () => {
    vi.useFakeTimers();
    try {
      setup();
      const text = screen.getByText('Stats read today');
      for (let i = 0; i < SECRET_TAPS; i++) {
        fireEvent.click(text);
        vi.advanceTimersByTime(1000);
      }
      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
