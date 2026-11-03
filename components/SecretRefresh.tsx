'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/** Taps needed, and how close together they must land, to open the box. */
export const SECRET_TAPS = 5;
export const SECRET_TAP_WINDOW_MS = 2500;

/**
 * The owner's manual refresh, hidden behind whatever it wraps.
 *
 * Nothing about the wrapped element changes — no pointer cursor, no ripple,
 * no role — so it reads as plain text. Tapping it SECRET_TAPS times within
 * SECRET_TAP_WINDOW_MS opens a password box. Hiding it is courtesy, not
 * security: the server checks the password (app/api/refresh).
 */
export function SecretRefresh({ children }: { children: React.ReactNode }) {
  const taps = React.useRef<number[]>([]);
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  const onTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < SECRET_TAP_WINDOW_MS), now];
    if (taps.current.length >= SECRET_TAPS) {
      taps.current = [];
      setResult(null);
      setOpen(true);
    }
  };

  const close = () => {
    setOpen(false);
    setPassword('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      setResult({ ok: res.ok, message: body?.message ?? `Failed (${res.status}).` });
      if (res.ok) setPassword('');
    } catch {
      setResult({ ok: false, message: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Box component="span" onClick={onTap} sx={{ display: 'inline-flex', userSelect: 'none' }}>
        {children}
      </Box>
      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        <form onSubmit={submit}>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              type="password"
              label="Password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            {result && (
              <Typography
                role="status"
                variant="body2"
                sx={{ mt: 1.5, color: result.ok ? 'success.main' : 'error.main' }}
              >
                {result.message}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Close</Button>
            <Button type="submit" variant="contained" disabled={busy || password.length === 0}>
              Refresh now
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
