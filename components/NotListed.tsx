import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { UnresolvedEntry } from '@/lib/types';

export function NotListed({ entries }: { entries: UnresolvedEntry[] }) {
  const notFound = entries.filter((e) => e.reason === 'not_found');
  const wentPrivate = entries.filter((e) => e.reason === 'no_data');

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Why am I not listed?
      </Typography>

      <Typography sx={{ mb: 2 }}>
        If you have never been added, you can{' '}
        <Link href="/join">add yourself in about a minute</Link>. If you are on the
        roster but show no stats, read on.
      </Typography>

      <Typography sx={{ mb: 2 }}>
        Battlefield 6 only shares your stats if you allow it. If your in-game privacy
        is not set to <strong>Everyone</strong>, nothing can read your stats —
        not this board, not any tracker.
      </Typography>

      <Typography sx={{ mb: 2 }}>
        To fix it: open Battlefield 6 → Settings → Privacy, set your stats visibility
        to <strong>Everyone</strong>, then play a match. DICE can take a while to
        publish the change, so give it a day or two before worrying.
      </Typography>

      <Typography sx={{ mb: 2 }}>
        Also double-check the EA ID you posted in <code>#introductions</code> matches
        your account exactly — it is case-sensitive, and capital <code>I</code> and
        lowercase <code>l</code> are easy to mix up.
      </Typography>

      {entries.length === 0 ? (
        <Typography sx={{ mt: 3 }}>
          Everyone on the roster is currently resolving. Nothing to fix.
        </Typography>
      ) : (
        <>
          {notFound.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" component="h2">
                Currently unreadable ({notFound.length})
              </Typography>
              <List dense>
                {notFound.map((e) => (
                  <ListItem key={e.eaId} disableGutters>
                    <ListItemText primary={e.displayName} secondary={`EA ID: ${e.eaId}`} />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {wentPrivate.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" component="h2">
                Went private ({wentPrivate.length})
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.7, mb: 1 }}>
                These members were readable before and aren&apos;t anymore — most
                often this means privacy was switched off again after resolving.
              </Typography>
              <List dense>
                {wentPrivate.map((e) => (
                  <ListItem key={e.eaId} disableGutters>
                    <ListItemText primary={e.displayName} secondary={`EA ID: ${e.eaId}`} />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </>
      )}

      <Box sx={{ mt: 4 }}>
        <Link href="/">← Back to the board</Link>
      </Box>
    </Container>
  );
}
