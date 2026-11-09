import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { RATING_WEIGHTS, STANDOUT_FLOOR, ratedMetrics, type RatedMetric } from '@/lib/rating';
import {
  PLACEMENT_POINTS,
  FIGHT_POINTS,
  finishLabel,
  type FightEvent,
  type Medal,
} from '@/lib/ledger';
import { MIN_MATCHES } from '@/lib/ranking';
import { FIRST_RAPID_ROYALE_SEASON } from '@/lib/modes';
import { MODE_ACCENT } from '@/app/accents';

/**
 * Read from RATING_WEIGHTS rather than repeating the numbers in prose, so the
 * page cannot quietly disagree with the code after someone retunes a weight.
 * Gauntlet's metrics only: Rapid Royale is ranked on points, below.
 */
const REASONS: Partial<Record<RatedMetric, { label: string; why: string }>> = {
  winPct: { label: 'Win rate', why: 'Last one standing is the whole point of the mode.' },
  kd: { label: 'Kills / deaths', why: 'Staying alive matters when dying ends your round.' },
  kpm: {
    label: 'Kills per minute',
    why: 'What you contributed per minute you were in, so playing more cannot inflate it.',
  },
  spm: {
    label: 'Score per minute',
    why: 'Catches the spotting and support work a kill count never sees.',
  },
  objPtsPerHour: {
    label: 'Objective points per hour',
    why: 'Gauntlet eliminates squads on objectives, and unlike the win this is yours alone.',
  },
  dpm: {
    label: 'Damage per minute',
    why: 'Counts the shots that set up a teammate’s kill — lightly, since the kill itself is already counted.',
  },
  revivesPerHour: {
    label: 'Revives per hour',
    why: 'Picking people up keeps a squad in the bracket.',
  },
};

const MEDAL_LABEL: Record<Medal, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze', unplaced: 'Loss' };
const MEDAL_ICON: Record<Medal, string> = { gold: '🥇', silver: '🥈', bronze: '🥉', unplaced: '' };
const FIGHT_LABEL: Record<FightEvent, string> = { kill: 'Kill', assist: 'Assist', death: 'Death' };

/** "+15", "−5": a true minus sign, as the board prints it. */
const signed = (v: number): string => `${v < 0 ? '−' : '+'}${Math.abs(v)}`;

const rr = MODE_ACCENT.rapidRoyale;

function PlacementTable() {
  return (
    <Table size="small" sx={{ mb: 3 }} aria-label="Rapid Royale placement points">
      <TableHead>
        <TableRow>
          <TableCell>Result</TableCell>
          <TableCell>Trio finish</TableCell>
          <TableCell>Solo finish</TableCell>
          <TableCell align="right">Points</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {(Object.keys(PLACEMENT_POINTS) as Medal[]).map((m) => (
          <TableRow key={m}>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>
              {MEDAL_ICON[m] && (
                <Box component="span" aria-hidden sx={{ mr: 0.75 }}>
                  {MEDAL_ICON[m]}
                </Box>
              )}
              {MEDAL_LABEL[m]}
            </TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{finishLabel('rapidRoyale', m)}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{finishLabel('rapidRoyaleSolo', m)}</TableCell>
            <TableCell align="right" className="tnum" sx={{ color: rr, fontWeight: 600 }}>
              {signed(PLACEMENT_POINTS[m])}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FightTable() {
  return (
    <Table size="small" sx={{ mb: 3, maxWidth: 320 }} aria-label="Rapid Royale fight points">
      <TableHead>
        <TableRow>
          <TableCell>Each</TableCell>
          <TableCell align="right">Points</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {(Object.keys(FIGHT_POINTS) as FightEvent[]).map((e) => (
          <TableRow key={e}>
            <TableCell>{FIGHT_LABEL[e]}</TableCell>
            <TableCell align="right" className="tnum" sx={{ color: rr, fontWeight: 600 }}>
              {signed(FIGHT_POINTS[e])}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GauntletWeightTable() {
  const weights = RATING_WEIGHTS.gauntlet;
  return (
    <Table size="small" sx={{ mb: 3 }} aria-label="Gauntlet weights">
      <TableHead>
        <TableRow>
          <TableCell>Counts for</TableCell>
          <TableCell>What</TableCell>
          <TableCell>Why</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ratedMetrics('gauntlet').map((m) => (
          <TableRow key={m}>
            <TableCell className="tnum" sx={{ whiteSpace: 'nowrap', color: MODE_ACCENT.gauntlet }}>
              {Math.round(weights[m]! * 100)}%
            </TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{REASONS[m]?.label ?? m}</TableCell>
            <TableCell sx={{ color: 'text.secondary' }}>{REASONS[m]?.why}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RatingExplainer() {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        How the rating works
      </Typography>

      <Typography sx={{ mb: 3 }}>
        From Season {FIRST_RAPID_ROYALE_SEASON} the board ranks Rapid Royale, and
        it ranks it on <strong>points</strong>: a season total you bank match by
        match. Trio and Solo each have their own board and their own tab. Gauntlet
        ended with Season {FIRST_RAPID_ROYALE_SEASON - 1}; its seasons are kept as
        they finished, with the rating they were ranked on then, explained at the
        bottom of this page.
      </Typography>

      <Typography variant="h5" component="h2" gutterBottom sx={{ color: rr }}>
        Rapid Royale{' '}
        <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.75em' }}>
          · Season {FIRST_RAPID_ROYALE_SEASON} on
        </Box>
      </Typography>

      <Typography variant="h6" component="h3" gutterBottom>
        Why points
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Rapid Royale is hectic. Ranking it on rates — win %, K/D, kills per
        minute — turned every match into a threat to a number, and that only
        discourages people from playing. So every match you play can bank
        points instead. Finish in the medals and you earn them; fight well and
        you earn more. The only ways down are finishing out of the medals and
        dying more than you kill.
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Your points are a plain <strong>season total</strong>. Nothing is divided
        by matches or minutes, nothing is weighed against the rest of the field,
        and your number moves <strong>only when you play</strong> — nobody
        else&rsquo;s games can move it.
      </Typography>

      <Typography variant="h6" component="h3" gutterBottom>
        Where you finished
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Every match ends in exactly one of these. A Solo lobby is far bigger than
        a Trio one, so Solo&rsquo;s medals reach further down the finishing order.
      </Typography>
      <PlacementTable />

      <Typography variant="h6" component="h3" gutterBottom>
        How you fought
      </Typography>
      <FightTable />
      <Typography sx={{ mb: 2 }}>
        Hover any total on the board to see the two halves: what your finishes
        earned, and what your fights earned.
      </Typography>

      <Typography variant="h6" component="h3" gutterBottom>
        What the other columns are
      </Typography>
      <Typography sx={{ mb: 2 }}>
        The columns after Points — KDA or K/D, kills per minute, damage per
        minute and revives per hour — are <strong>reference only</strong>. They
        are there to read, not to rank on, and nothing about them changes your
        points.
      </Typography>

      <Typography variant="h6" component="h3" gutterBottom>
        Who is ranked
      </Typography>
      <Typography sx={{ mb: 2 }}>
        A rank needs {MIN_MATCHES} matches and a total above zero. Below either
        you appear under Provisional with your points showing, and you are back
        on the board the moment you climb above zero.
      </Typography>
      <Typography sx={{ mb: 4 }}>
        Each placement count is checked before it counts: it must sit between
        your wins and your matches, and a wider rung can never be smaller than
        the one inside it, as they have to if they are real. A count that fails
        that test leaves your points blank until the next refresh reads it
        cleanly.
      </Typography>

      <Typography variant="h5" component="h2" gutterBottom sx={{ color: MODE_ACCENT.gauntlet }}>
        Gauntlet{' '}
        <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.75em' }}>
          · Seasons 3–{FIRST_RAPID_ROYALE_SEASON - 1}, archived
        </Box>
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Gauntlet seasons were ranked on a score out of 100 that blended several
        rate stats, because winning alone did not say whether you carried your
        squad or were carried by it. The weights were these:
      </Typography>
      <GauntletWeightTable />

      <Typography variant="h6" component="h3" gutterBottom>
        Where the objective figure comes from
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Objective points are{' '}
        <strong>
          0.1 per second on the objective, plus 10 per objective destroyed, plus
          5 per disarm, plus 3 per intel pickup
        </strong>{' '}
        — divided by hours played. The formula and its weightings are{' '}
        <strong>Kricked</strong>&rsquo;s, from the community spreadsheet, and the
        board uses them as written.
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Per <strong>hour</strong> rather than per match, because Gauntlet is an
        elimination format and match length varies — a winning squad plays more
        rounds, so a per-match average would flatter you for how deep your team
        went rather than for the objective work you actually did. Kricked&rsquo;s
        sheet totals this over a whole Gauntlet lifetime; the board is per
        season, so the numbers will not match the sheet one-for-one.
      </Typography>

      <Typography variant="h6" component="h3" gutterBottom>
        Scored against the field
      </Typography>
      <Typography sx={{ mb: 2 }}>
        For each stat the board worked out where a player sat among everyone
        else ranked that season — top of the field 100, bottom 0, middle 50 —
        and blended those positions with the weights above. A 3.0 K/D and 420
        damage per minute cannot be added directly, and comparing positions
        avoided inventing numbers to make them comparable. Gauntlet needed{' '}
        {MIN_MATCHES} matches for a rank, and its badges mark the top{' '}
        {100 - STANDOUT_FLOOR}% of the field on one stat each, plus one for
        flying jets.
      </Typography>

      <Box sx={{ mt: 4 }}>
        <Link href="/">← Back to the board</Link>
      </Box>
    </Container>
  );
}
