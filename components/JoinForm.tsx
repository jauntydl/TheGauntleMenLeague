'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { MIN_MATCHES } from '@/lib/ranking';

type Success = {
  ok: true;
  eaId: string;
  season: string;
  rank: number | null;
  rating: number | null;
  matches: number;
  provisional: boolean;
};
type Failure = { ok: false; reason: string; message: string };

export function JoinForm() {
  const [eaId, setEaId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Success | Failure | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || eaId.trim() === '') return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eaId }),
      });
      setResult((await res.json()) as Success | Failure);
    } catch {
      setResult({ ok: false, reason: 'error', message: 'Could not reach the board. Check your connection.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Add yourself to the board
      </Typography>

      <Typography sx={{ mb: 1 }}>
        Type the EA ID you play Battlefield 6 on. We check it against EA, pull your
        Rapid Royale stats and put you on the board — no account, no password.
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        Your in-game privacy has to be set to Everyone, or EA shares nothing for
        anyone to read. <Link href="/not-listed">How to check that</Link>.
      </Typography>

      <Box component="form" onSubmit={submit} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
        <TextField
          label="EA ID"
          value={eaId}
          onChange={(e) => setEaId(e.target.value)}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          inputProps={{ 'aria-label': 'EA ID', maxLength: 16 }}
          sx={{ flex: '1 1 220px' }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={busy || eaId.trim() === ''}
          sx={{ px: 3, flex: '0 0 auto' }}
        >
          {busy ? <CircularProgress size={22} aria-label="checking" /> : 'Add me'}
        </Button>
      </Box>

      {result?.ok === true && (
        <Alert severity="success" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
            {result.provisional
              ? `${result.eaId} is in — provisionally.`
              : `${result.eaId} is in at #${result.rank}.`}
          </Typography>
          <Typography variant="body2">
            {result.provisional
              ? `You have ${result.matches} ${result.season} matches. ${MIN_MATCHES} gets you a rating and a place in the standings.`
              : `Rating ${result.rating?.toFixed(1)} across ${result.matches} ${result.season} matches.`}{' '}
            The board rebuilds itself when someone joins, so give it about a minute,
            then <Link href="/">go and look</Link>.
          </Typography>
        </Alert>
      )}

      {result?.ok === false && (
        <Alert severity={result.reason === 'duplicate' ? 'info' : 'warning'} sx={{ mb: 2 }}>
          {result.message}
          {result.reason === 'no_data' && (
            <>
              {' '}
              <Link href="/not-listed">The full instructions are here</Link>.
            </>
          )}
        </Alert>
      )}

      <Box sx={{ mt: 4 }}>
        <Link href="/">← Back to the board</Link>
      </Box>
    </Container>
  );
}
