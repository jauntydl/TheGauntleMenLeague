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
import { MIN_MATCHES } from '@/lib/ranking';
import { FIRST_RAPID_ROYALE_SEASON, MODES, type ModeKey } from '@/lib/modes';
import { MODE_ACCENT } from '@/app/accents';

/**
 * Read from RATING_WEIGHTS rather than repeating the numbers in prose, so the
 * page cannot quietly disagree with the code after someone retunes a weight.
 */
const REASONS: Record<RatedMetric, { label: string; why: string }> = {
  winPct: { label: 'Win rate', why: 'Last squad standing is the whole point of the mode.' },
  kd: { label: 'Kills / deaths', why: 'Staying alive matters when dying ends your squad’s round.' },
  kda: {
    label: 'KDA',
    why: 'Kills plus assists, per death: staying alive, crediting the knocks you set up.',
  },
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
  top3Pct: {
    label: 'Top-three rate',
    why: 'Going deep every match, not just winning some and dropping early in the rest.',
  },
  dpm: { label: 'Damage per minute', why: 'Counts the shots that set up a teammate’s kill — lightly, since the kill itself is already counted.' },
  revivesPerHour: {
    label: 'Revives per hour',
    why: 'Picking people up keeps a squad in the bracket.',
  },
};

/** Newest mode first: the one being played is the one people came to read. */
const MODE_ORDER: { mode: ModeKey; seasons: string }[] = [
  { mode: 'rapidRoyale', seasons: `Season ${FIRST_RAPID_ROYALE_SEASON} on` },
  { mode: 'gauntlet', seasons: `Seasons 3–${FIRST_RAPID_ROYALE_SEASON - 1}, archived` },
];

function WeightTable({ mode }: { mode: ModeKey }) {
  const weights = RATING_WEIGHTS[mode];
  return (
    <Table size="small" sx={{ mb: 3 }} aria-label={`${MODES[mode].label} weights`}>
      <TableHead>
        <TableRow>
          <TableCell>Counts for</TableCell>
          <TableCell>What</TableCell>
          <TableCell>Why</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ratedMetrics(mode).map((m) => (
          <TableRow key={m}>
            <TableCell className="tnum" sx={{ whiteSpace: 'nowrap', color: MODE_ACCENT[mode] }}>
              {Math.round(weights[m]! * 100)}%
            </TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{REASONS[m].label}</TableCell>
            <TableCell sx={{ color: 'text.secondary' }}>{REASONS[m].why}</TableCell>
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

      <Typography sx={{ mb: 2 }}>
        Every ranked player gets a score out of 100. It blends several stats,
        because winning alone does not say whether you carried your squad or
        were carried by it. Gauntlet ended with Season 4; from Season{' '}
        {FIRST_RAPID_ROYALE_SEASON} the board ranks Rapid Royale, which is
        weighted for how that mode is played. Each season&rsquo;s tab is drawn
        in its mode&rsquo;s colour.
      </Typography>

      {MODE_ORDER.map(({ mode, seasons }) => (
        <Box key={mode}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ color: MODE_ACCENT[mode] }}>
            {MODES[mode].label}{' '}
            <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.85em' }}>
              · {seasons}
            </Box>
          </Typography>
          <WeightTable mode={mode} />
        </Box>
      ))}

      <Typography variant="h6" component="h2" gutterBottom>
        Placement, in Rapid Royale
      </Typography>
      <Typography sx={{ mb: 2 }}>
        <strong>Finishing position</strong> is the best input a battle royale
        has — placing second every time beats alternating first and last. Rapid
        Royale counts it twice over, at the same weight each: the win, and
        finishing in the top three, which is what separates someone who goes
        deep every match from someone who wins a few and drops early in the
        rest. Every win is already a top three, so weighting the win more would
        count it twice. Top five was left out; every top three is already a top
        five.
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Together they are held to under a third of the rating on purpose. A win is shared
        with two teammates, so it says as much about who you queued with as
        about you. The rest — KDA, kills, score, revives and damage, all per
        minute or hour — is yours alone, and it carries the rating.
      </Typography>
      <Typography sx={{ mb: 2 }}>
        The figure is checked before it counts: a top-three count must sit
        between your wins and your matches, as it has to if it is real.
        Gauntlet&rsquo;s placement figures failed exactly that — one player
        showed more top-ten finishes than matches played — so Gauntlet seasons
        were never ranked on placement.
      </Typography>

      <Typography variant="h6" component="h2" gutterBottom>
        No objective stat, in Rapid Royale
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Rapid Royale has no objectives to hold, destroy or disarm, so the
        Gauntlet formula below has nothing to count, and the mode is rated
        without an objective stat. What objective play the game does score
        still counts, inside score per minute.
      </Typography>

      <Typography variant="h6" component="h2" gutterBottom>
        Where Gauntlet&rsquo;s objective figure comes from
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
        went rather than for the objective work you actually did. Per hour
        measures the rate of that work, independent of your team&rsquo;s run.
      </Typography>
      <Typography sx={{ mb: 2 }}>
        One difference worth naming: Kricked&rsquo;s sheet totals this over your
        whole Gauntlet lifetime. This board is per season, like every other stat
        on it, so the numbers here will not match the sheet one-for-one.
      </Typography>

      <Typography variant="h6" component="h2" gutterBottom>
        You are scored against the field, not against a target
      </Typography>
      <Typography sx={{ mb: 2 }}>
        For each stat, we work out where you sit among everyone else ranked
        this season. Top of the field on a stat is worth 100, bottom is worth 0,
        middle is 50. Those positions are then blended using the weights above.
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Two consequences worth knowing. A 3.0 K/D and 420 damage per minute cannot
        be added together directly, and any formula that tried would need arbitrary
        numbers invented to make them comparable — comparing positions avoids that
        entirely. But it also means <strong>your rating can move when other people
        play</strong>, even on a day you do not. You are ranked against the field,
        so the field shifting moves you.
      </Typography>

      <Typography variant="h6" component="h2" gutterBottom>
        You need {MIN_MATCHES} matches
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Below that you appear under Provisional with no rating. A short run of good
        luck should not outrank someone with several hundred matches, and comparing
        you against a field you are not in would not mean anything.
      </Typography>

      <Typography variant="h6" component="h2" gutterBottom>
        Badges are separate
      </Typography>
      <Typography sx={{ mb: 2 }}>
        The icons beside a name are not part of the rating. Each one marks the
        top {100 - STANDOUT_FLOOR}% of the ranked field on one stat — win rate,
        K/D, kills per match, score per minute, objective points per hour
        (Gauntlet only), revives per hour, scoped kills per match or automatic
        kills per match —
        plus one for flying jets. Hover a badge to see which stat it is and what your figure
        was. Most players hold none, which is what makes the rest worth
        something.
      </Typography>

      <Typography variant="h6" component="h2" gutterBottom>
        What is deliberately not in it
      </Typography>
      <Typography sx={{ mb: 2 }}>
        <strong>Headshot rate</strong> mostly measures which gun you hold. Snipers
        and DMRs are headshot-or-nothing, so a sniper main posts a high rate by
        playing normally. What they favour is shown as a badge instead, where it
        belongs.
      </Typography>
      <Typography sx={{ mb: 2 }}>
        <strong>Total kills and total score</strong> reward whoever plays the most
        hours. Every part of the rating is a rate for that reason.
      </Typography>
      <Box sx={{ mt: 4 }}>
        <Link href="/">← Back to the board</Link>
      </Box>
    </Container>
  );
}
