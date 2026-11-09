// components/LeaderboardTable.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  LeaderboardTable,
  fmtPct,
  fmtNum,
  fmtHours,
  fmtInt,
  fmtPoints,
  badges,
  columnDescription,
} from './LeaderboardTable';
import type { BoardRow } from '@/lib/types';
import { RATING_WEIGHTS, STANDOUT_TRAITS, type RatedMetric } from '@/lib/rating';
import { LEDGER_FIELDS } from '@/lib/ledger';
import { MIN_MATCHES } from '@/lib/ranking';

const row = (over: Partial<BoardRow>): BoardRow => {
  const base: BoardRow = {
    eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
    matches: 20, wins: 10, losses: 10, kills: 100, headshots: 25, deaths: 50, damage: 1000,
    assists: 0, revives: 0, score: 42000, timeSec: 3600,
    winPct: 50, kd: 2, killsPerMatch: 5, kpm: 1, dpm: 10, spm: 700, objPerMatch: 1.5, objPts: 900, objPtsPerHour: 60, top3Pct: null, top5Pct: null, top10Pct: null, top3: null, top5: null, top10: null, gold: null, silver: null, bronze: null, unplaced: null, placementPts: null, fightPts: null, kda: null, revivesPerHour: 3, rating: 50, standouts: [], sniperPct: 20, autoPct: 75, sniperKills: 20, autoKills: 75, sniperPerMatch: 1, autoPerMatch: 3.75, jetPct: 0, rank: 1,
    ...over,
  };
  // eaId is the roster key, is unique in production, and is what the Player
  // column shows. Keep the two names in step unless a test sets both.
  if (over.eaId && over.displayName) return base;
  return over.eaId ? { ...base, displayName: base.eaId } : { ...base, eaId: base.displayName };
};

describe('formatters', () => {
  it('formats points', () => {
    // A whole number with thousands separators and a true minus sign; the
    // half point an assist earns rounds away from zero for display only.
    expect(fmtPoints(2653.5)).toBe('2,654');
    expect(fmtPoints(-1188)).toBe('−1,188');
    expect(fmtPoints(-2.5)).toBe('−3');
    expect(fmtPoints(0)).toBe('0');
    expect(fmtPoints(null)).toBe('—');
    expect(fmtPoints(undefined)).toBe('—');
  });

  it('formats percentages to one decimal', () => {
    expect(fmtPct(77.7777)).toBe('77.8%');
  });
  it('renders an em dash for null', () => {
    expect(fmtPct(null)).toBe('—');
    expect(fmtNum(null, 2)).toBe('—');
  });
  it('separates thousands so long counts stay readable', () => {
    expect(fmtInt(10000)).toBe('10,000');
    expect(fmtInt(999)).toBe('999');
  });

  it('formats hours', () => {
    expect(fmtHours(3600)).toBe('1.0h');
  });
});

describe('badges', () => {
  // Two icons are SVG elements rather than emoji, so identity is the id.
  const ids = (r: BoardRow) => badges(r).map((b) => b.id);
  const icons = (r: BoardRow) => badges(r).map((b) => b.icon);

  it('awards one badge per trait the player stands out on', () => {
    for (const t of STANDOUT_TRAITS) {
      expect(ids(row({ standouts: [t] }))).toEqual([t]);
    }
  });

  it('gives every trait its own icon', () => {
    const all = badges(row({ standouts: [...STANDOUT_TRAITS], jetPct: 15 }));
    expect(all).toHaveLength(STANDOUT_TRAITS.length + 1);
    expect(new Set(all.map((b) => b.id)).size).toBe(all.length);
    for (const b of all) expect(b.icon).toBeTruthy();
  });

  it('awards every trait at once, strongest first', () => {
    // rateAll orders standouts by percentile, so badges must preserve the
    // order it was given rather than imposing one of its own.
    expect(ids(row({ standouts: ['revivesPerHour', 'winPct'] }))).toEqual(['revivesPerHour', 'winPct']);
  });

  it('stacks flying on top of traits', () => {
    expect(ids(row({ standouts: ['winPct'], jetPct: 40 }))).toEqual(['winPct', 'jet']);
  });

  it('awards the jet badge on an absolute share of time, not a percentile', () => {
    expect(ids(row({ jetPct: 10 }))).toEqual(['jet']);
    expect(ids(row({ jetPct: 9.9 }))).toEqual([]);
  });

  it('awards nothing to a player who met no threshold', () => {
    // No fallback badge: an unexceptional season earns none, which is what
    // makes the badges other people hold worth something.
    expect(badges(row({ standouts: [], jetPct: 0 }))).toEqual([]);
  });

  it('says what the badge was for and what the figure was', () => {
    expect(badges(row({ standouts: ['kd'], kd: 5.07 }))[0].detail).toBe('Top 10% — K/D — 5.07');
    expect(badges(row({ standouts: ['autoPerMatch'], autoPerMatch: 21.4, autoKills: 8132 }))[0].detail)
      .toBe('Top 10% — automatic kills — 21.4 per match, 8,132 all season');
    expect(badges(row({ jetPct: 34.6 }))[0].detail)
      .toBe('Pilot — 34.6% of their time flown in jets');
  });

  it('survives a row built before standouts existed', () => {
    // The committed board predates the field; an older file must not throw.
    const legacy = { ...row({}), standouts: undefined } as unknown as BoardRow;
    expect(badges(legacy)).toEqual([]);
  });
});

describe('LeaderboardTable', () => {
  it('renders a row per player', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Dark' }), row({ displayName: 'Noxious', rank: 2 })]} />);
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('Noxious')).toBeInTheDocument();
  });

  it('awards the jet badge at or above the threshold', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Jetty', jetPct: 14.8 })]} />);
    expect(screen.getByLabelText(/flown in jets/)).toBeInTheDocument();
  });

  it('withholds the jet badge below the threshold', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Grunt', jetPct: 9.9 })]} />);
    expect(screen.queryByLabelText(/flown in jets/)).not.toBeInTheDocument();
  });

  it('shows the name on the scoreboard in game, not the EA ID or the Discord handle', () => {
    // TTVLezWin on EA is LezWin on Steam and "Lez" in Discord. Only one of
    // those is the name you saw in the match you just played.
    render(<LeaderboardTable mode="gauntlet" rows={[row({
      eaId: 'TTVLezWin', displayName: 'Lez', inGameName: 'LezWin', inGamePlatform: 'steam',
    })]} />);
    expect(screen.getByText('LezWin')).toBeInTheDocument();
    expect(screen.queryByText('TTVLezWin')).not.toBeInTheDocument();
    // Both other names stay reachable rather than being dropped.
    expect(screen.getByLabelText('TTVLezWin on EA · Lez in Discord')).toBeInTheDocument();
  });

  it('shows a hand-set name in place of the EA ID, keeping the EA ID on hover', () => {
    render(<LeaderboardTable mode="rapidRoyale" rows={[row({
      eaId: 'Antimere99', displayName: 'Antimere99', inGameName: 'Antimere99',
    })]} />);
    expect(screen.getByText('OO')).toBeInTheDocument();
    expect(screen.getByLabelText('Antimere99 on EA')).toBeInTheDocument();
  });


  it('falls back to the EA ID when no persona was resolved', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({ eaId: 'CyclonicNinja', displayName: 'CyclonicNinja' })]} />);
    expect(screen.getByText('CyclonicNinja')).toBeInTheDocument();
  });

  it('renders an em dash for null rate stats', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Empty', kd: null, kpm: null })]} />);
    // kd and kpm are null in this fixture, and the default row earns no
    // badge, so three dashes. Pinned so a partial regression (only one of
    // the two stats rendering a dash) is caught.
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('shows a rank in ranked mode', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({ rank: 3 })]} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an em dash for rank in provisional mode', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({ rank: null })]} provisional />);
    // Rank is null, and the default row earns no badge — two dashes.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('renders an empty-state message with no rows', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[]} />);
    expect(screen.getByText(/no players/i)).toBeInTheDocument();
  });

  it('shows badges as icons alone, with the figure only in the tooltip', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({
      displayName: 'Scoped', standouts: ['sniperPerMatch'], sniperPerMatch: 8.25, sniperKills: 1650,
    })]} />);
    expect(screen.getByLabelText('Top 10% — scoped kills — 8.3 per match, 1,650 all season'))
      .toBeInTheDocument();
    expect(screen.queryByText(/scoped kills/)).not.toBeInTheDocument();
  });

  it('renders every badge a player earned', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({
      displayName: 'Stacked', standouts: ['winPct', 'kd', 'autoPerMatch'], jetPct: 40,
    })]} />);
    // Anchored on "Top 10%"/"Pilot" so a column menu's own aria-label
    // ("K/D column menu") cannot satisfy the query instead of the badge.
    for (const detail of [/^Top 10% — win rate/, /^Top 10% — K\/D/, /^Top 10% — automatic kills/, /^Pilot —/]) {
      expect(screen.getByLabelText(detail)).toBeInTheDocument();
    }
  });

  it('shows a dash when a player earned nothing', () => {
    render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Plain', standouts: [], jetPct: 0 })]} />);
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('renders the default sort order — Rating descending — regardless of input order', () => {
    // Deliberately out of Rating order: low, high, mid. Win % is set opposite
    // to Rating so a regression to the old win-rate sort would fail loudly
    // rather than coincidentally producing the same order.
    render(
      <LeaderboardTable
        mode="gauntlet"
        rows={[
          row({ eaId: 'Low', rating: 20, winPct: 90 }),
          row({ eaId: 'High', rating: 90, winPct: 20 }),
          row({ eaId: 'Mid', rating: 55, winPct: 55 }),
        ]}
      />,
    );
    const names = screen.getAllByText(/^(Low|High|Mid)$/).map((el) => el.textContent);
    expect(names).toEqual(['High', 'Mid', 'Low']);
  });

  it('shows the footer once rows exceed the page-size threshold', () => {
    const rows = Array.from({ length: 101 }, (_, i) => row({ eaId: `p${i}`, displayName: `P${i}` }));
    const { container } = render(<LeaderboardTable mode="gauntlet" rows={rows} />);
    expect(container.querySelector('.MuiDataGrid-footerContainer')).not.toBeNull();
  });

  it('hides the footer at or below the page-size threshold', () => {
    const rows = Array.from({ length: 100 }, (_, i) => row({ eaId: `p${i}`, displayName: `P${i}` }));
    const { container } = render(<LeaderboardTable mode="gauntlet" rows={rows} />);
    expect(container.querySelector('.MuiDataGrid-footerContainer')).toBeNull();
  });

  const withViewport = (matchWidths: string[], run: () => void) => {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: matchWidths.some((w) => query.includes(w)),
        media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {},
        addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
      }),
    });
    try { run(); } finally {
      Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: original });
    }
  };

  const MODE_KEYS = ['gauntlet', 'rapidRoyale', 'rapidRoyaleSolo'] as const;
  const markedFields = (container: HTMLElement) =>
    [...container.querySelectorAll('.MuiDataGrid-columnHeader.rated-col')].map(
      (el) => el.getAttribute('data-field') as RatedMetric,
    );

  it('marks exactly the rated columns in the header, and no others (gauntlet)', () => {
    // Derived from RATING_WEIGHTS on both sides, so this cannot be satisfied
    // by a hand-kept list drifting alongside the weights. It asserts the set
    // is exact: a context column picking up the marking would claim to feed
    // the rating when it does not.
    withViewport([], () => {
      const { container } = render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Marked' })]} />);
      expect(new Set(markedFields(container))).toEqual(new Set(Object.keys(RATING_WEIGHTS.gauntlet)));
    });
  });

  it('orders the rated columns by weight, heaviest first (gauntlet)', () => {
    withViewport([], () => {
      const { container } = render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Ordered' })]} />);
      const marked = markedFields(container);
      const w = RATING_WEIGHTS.gauntlet;
      expect(marked).toEqual([...marked].sort((a, b) => w[b]! - w[a]!));
    });
  });

  it('shows Gauntlet its rated columns and none of Rapid Royale\'s', () => {
    withViewport([], () => {
      const fields = fieldsOf('gauntlet');
      expect(fields).toContain('objPtsPerHour');
      expect(fields).not.toContain('top3Pct');
      expect(fields).not.toContain('gold');
      expect(fields).not.toContain('kda');
    });
  });

  // Olympic medal-table order: rank, name, the medals, then the rest of the
  // ledger, and the total closing the group; the reference columns after.
  const LEDGER_ORDER = {
    rapidRoyale: ['rank', 'eaId', 'gold', 'silver', 'bronze', 'unplaced', 'kills', 'assists', 'deaths', 'rating', 'kda', 'kpm', 'dpm', 'revivesPerHour', 'matches'],
    rapidRoyaleSolo: ['rank', 'eaId', 'gold', 'silver', 'bronze', 'unplaced', 'kills', 'deaths', 'rating', 'kd', 'kpm', 'dpm', 'matches'],
  } as const;

  it.each(['rapidRoyale', 'rapidRoyaleSolo'] as const)('shows a Rapid Royale board the ledger, then the reference columns (%s)', (mode) => {
    withViewport([], () => expect(fieldsOf(mode)).toEqual([...LEDGER_ORDER[mode]]));
  });

  it('lights exactly the columns that carry a point value, and the total', () => {
    withViewport([], () => {
      const { container } = render(<LeaderboardTable mode="rapidRoyale" rows={[row({ displayName: 'Lit' })]} />);
      expect(markedFields(container)).toEqual([...LEDGER_FIELDS, 'rating']);
    });
  });

  it('heads the medal columns with the medals and tints their counts', () => {
    withViewport([], () => {
      const { container } = render(
        <LeaderboardTable mode="rapidRoyale" rows={[row({ displayName: 'Medals', gold: 20, silver: 7, bronze: 3, unplaced: 4 })]} />,
      );
      // The icon says which metal; the caption says what finish earns it,
      // in this mode's rungs. Solo's captions are checked below.
      const header = (f: string) => container.querySelector(`.MuiDataGrid-columnHeader[data-field="${f}"]`)!.textContent!;
      expect(header('gold')).toContain('🥇');
      expect(header('gold')).toContain('Winner');
      expect(header('gold')).toContain('+15');
      expect(header('silver')).toContain('🥈');
      expect(header('silver')).toContain('Top 3');
      expect(header('silver')).toContain('+10');
      expect(header('bronze')).toContain('🥉');
      expect(header('bronze')).toContain('Top 5');
      expect(header('bronze')).toContain('+5');
      // Every column that moves the total says by how much, right in the header.
      expect(header('unplaced')).toContain('Losses');
      expect(header('unplaced')).toContain('−5');
      expect(header('kills')).toContain('+1');
      expect(header('assists')).toContain('+0.5');
      expect(header('deaths')).toContain('−1');
      // The reference columns say nothing of the sort.
      expect(header('kpm')).not.toMatch(/[+−]\d/);
      // jsdom lays out nothing and resolves no stylesheet, so the tint is
      // asserted by class, as the pinned columns are.
      const cell = (f: string) => container.querySelector(`.MuiDataGrid-cell[data-field="${f}"]`)!;
      expect(cell('gold').className).toContain('medal-gold');
      expect(cell('silver').className).toContain('medal-silver');
      expect(cell('bronze').className).toContain('medal-bronze');
      expect(cell('unplaced').className).not.toContain('medal-');
      expect(cell('gold').textContent).toBe('20');
      expect(screen.getByText('Losses')).toBeInTheDocument();
    });
  });

  it('captions Solo\'s medals by its wider rungs', () => {
    withViewport([], () => {
      const { container } = render(<LeaderboardTable mode="rapidRoyaleSolo" rows={[row({ displayName: 'SoloMedals' })]} />);
      const header = (f: string) => container.querySelector(`.MuiDataGrid-columnHeader[data-field="${f}"]`)!.textContent!;
      expect(header('gold')).toContain('Winner');
      expect(header('silver')).toContain('Top 5');
      expect(header('bronze')).toContain('Top 10');
      expect(header('unplaced')).toContain('−5');
    });
  });

  it('says what each ledger column is worth, by mode', () => {
    // Through columnDescription, as the weight-tooltip test does: jsdom never
    // opens a tooltip, and the description is what the header shows.
    expect(columnDescription('gold', undefined, '🥇', 'rapidRoyale')).toBe('Gold · 1st place · +15 each');
    expect(columnDescription('silver', undefined, '🥈', 'rapidRoyale')).toBe('Silver · 2nd–3rd place · +10 each');
    expect(columnDescription('silver', undefined, '🥈', 'rapidRoyaleSolo')).toBe('Silver · 2nd–5th place · +10 each');
    expect(columnDescription('unplaced', undefined, 'Losses', 'rapidRoyaleSolo')).toBe('11th or worse · −5 each');
    expect(columnDescription('assists', undefined, 'Assists', 'rapidRoyale')).toBe('+0.5 each');
    expect(columnDescription('deaths', undefined, 'Deaths', 'rapidRoyale')).toBe('−1 each');
    expect(columnDescription('kpm', 'Kills per minute', 'KPM', 'rapidRoyale')).toBe('Kills per minute · reference only, not part of the points');
    expect(columnDescription('matches', `Matches this season · ${MIN_MATCHES} for a rank`, 'Matches', 'rapidRoyale')).toBe(
      `Matches this season · ${MIN_MATCHES} for a rank`,
    );
  });

  it('shows the split on hover', () => {
    withViewport([], () => {
      render(
        <LeaderboardTable
          mode="rapidRoyale"
          rows={[row({ eaId: 'Split', gold: 20, silver: 20, bronze: 15, unplaced: 45, kills: 300, assists: 100, deaths: 200, placementPts: 350, fightPts: 150, rating: 500 })]}
        />,
      );
      expect(
        screen.getByLabelText('Placement +350 (20 gold · 20 silver · 15 bronze · 45 losses) · Fights +150 (300 kills · 100 assists · 200 deaths)'),
      ).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument();
    });
  });

  it('leaves assists out of a Solo split, and keeps the half point so the halves add up', () => {
    withViewport([], () => {
      render(
        <LeaderboardTable
          mode="rapidRoyaleSolo"
          rows={[row({ eaId: 'Solo', gold: 4, silver: 9, bronze: 16, unplaced: 11, kills: 120, assists: 1, deaths: 36, placementPts: 175, fightPts: 84.5, rating: 259.5 })]}
        />,
      );
      // The cell rounds (260); the split shows the exact halves, so a reader
      // who adds them lands on the same total, not one off.
      expect(screen.getByLabelText('Placement +175 (4 gold · 9 silver · 16 bronze · 11 losses) · Fights +84.5 (120 kills · 36 deaths)')).toBeInTheDocument();
      expect(screen.getByText('260')).toBeInTheDocument();
    });
  });

  it('shows a negative half in the split exactly', () => {
    withViewport([], () => {
      render(
        <LeaderboardTable
          mode="rapidRoyale"
          rows={[row({ eaId: 'Half', gold: 10, silver: 0, bronze: 0, unplaced: 10, kills: 40, assists: 1, deaths: 91, placementPts: 100, fightPts: -50.5, rating: 49.5 })]}
        />,
      );
      expect(screen.getByLabelText(/Fights −50\.5 \(40 kills · 1 assists · 91 deaths\)/)).toBeInTheDocument();
    });
  });

  it('renders a dash for null points and medals', () => {
    withViewport([], () => {
      const { container } = render(
        <LeaderboardTable mode="rapidRoyale" rows={[row({ eaId: 'Broken', rating: null, gold: null, silver: null, bronze: null, unplaced: null })]} />,
      );
      const text = (f: string) => container.querySelector(`.MuiDataGrid-cell[data-field="${f}"]`)!.textContent;
      expect([text('rating'), text('gold'), text('unplaced')]).toEqual(['—', '—', '—']);
    });
  });

  it('shows a Provisional Rapid Royale player\'s points', () => {
    withViewport([], () => {
      const { container } = render(
        <LeaderboardTable mode="rapidRoyale" provisional rows={[row({ eaId: 'Below', rank: null, rating: -240, gold: 0, silver: 2, bronze: 3, unplaced: 45 })]} />,
      );
      expect(screen.getByText('−240')).toBeInTheDocument();
      expect(container.querySelector('.MuiDataGrid-cell[data-field="rank"]')!.textContent).toBe('—');
    });
  });

  it('renders an archived Gauntlet row that predates the ledger fields', () => {
    const archived = { ...row({ eaId: 'Old', rating: 61.4, standouts: ['kd'] }) } as Record<string, unknown>;
    for (const k of ['top3', 'top5', 'top10', 'gold', 'silver', 'bronze', 'unplaced', 'placementPts', 'fightPts']) delete archived[k];
    withViewport([], () => {
      render(<LeaderboardTable mode="gauntlet" rows={[archived as unknown as BoardRow]} />);
      expect(screen.getByText('61.4')).toBeInTheDocument();
      expect(screen.getByText('🛡️')).toBeInTheDocument();
    });
  });

  const fieldsOf = (mode: (typeof MODE_KEYS)[number]): (string | null)[] => {
    const r = render(<LeaderboardTable mode={mode} rows={[row({ displayName: `F-${mode}` })]} />);
    const fields = [...r.container.querySelectorAll('.MuiDataGrid-columnHeader')].map((el) => el.getAttribute('data-field'));
    r.unmount();
    return fields;
  };

  it('shows no Assists column on Solo, where nobody has a kill to assist', () => {
    withViewport([], () => {
      expect(fieldsOf('rapidRoyaleSolo')).not.toContain('assists');
      // The squad modes keep it: in Trio it is the count behind KDA.
      expect(fieldsOf('rapidRoyale')).toContain('assists');
      expect(fieldsOf('gauntlet')).toContain('assists');
    });
  });

  it('gives every rated Gauntlet column a tooltip naming its weight', () => {
    // The accent marks these columns as special; the tooltip says why, and
    // how much. Both sides read RATING_WEIGHTS, so a retuned weight cannot
    // leave a tooltip quoting the old one.
    //
    // Asserted on the description rather than by hovering: MUI opens the
    // tooltip on a real pointer, and jsdom never opens it.
    for (const [m, w] of Object.entries(RATING_WEIGHTS.gauntlet)) {
      expect(columnDescription(m, undefined, 'Header', 'gauntlet')).toContain(`${Math.round(w * 100)}% of the Rating`);
    }
  });

  it('keeps an existing description and appends the weight to it', () => {
    const text = columnDescription('spm', 'Score per minute', 'SPM', 'gauntlet');
    expect(text).toBe(`Score per minute · ${Math.round(RATING_WEIGHTS.gauntlet.spm! * 100)}% of the Rating`);
  });

  it('leaves an unrated column\'s description alone', () => {
    expect(columnDescription('headshots', 'Headshot kills', 'HS', 'gauntlet')).toBe('Headshot kills');
    expect(columnDescription('timeSec', undefined, 'Time', 'gauntlet')).toBeUndefined();
    // Rated in one mode is not rated in the other.
    expect(columnDescription('objPtsPerHour', 'Objective points', 'OBJ/h', 'rapidRoyale')).toBe('Objective points');
  });

  it('shows no match-count column — W-L already carries it', () => {
    // 492-75 is 567 matches and says more doing it, so the M column was pure
    // duplication taking width from a board that has none to spare.
    withViewport([], () => {
      const { container } = render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'NoM' })]} />);
      const fields = [...container.querySelectorAll('.MuiDataGrid-columnHeader')]
        .map((el) => el.getAttribute('data-field'));
      expect(fields).not.toContain('matches');
      // The column's field is the win count, so it sorts on wins and, where
      // the mode rates total wins, lights up as a rated column.
      expect(fields).toContain('wins');
      expect(fields).not.toContain('record');
    });
  });

  const ALL_HEADERS = ['Rating', 'Win %', 'W–L', 'Badges', 'Kills', 'Assists', 'HS', 'K/D', 'K/match', 'KPM', 'DPM', 'Rev/h', 'Time'];

  it('shows every column on a phone, scrolled sideways rather than dropped', () => {
    // Phones used to keep only rank, player, rating and win rate, which left
    // no way to read anything else. Every column now renders and the grid
    // scrolls horizontally.
    withViewport(['max-width:600px'], () => {
      render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Phone' })]} />);
      for (const shown of ALL_HEADERS) {
        expect(screen.getByText(shown)).toBeInTheDocument();
      }
    });
  });

  it('pins rank and player on a phone, and nothing else', () => {
    withViewport(['max-width:600px'], () => {
      const { container } = render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Pinned' })]} />);
      const pinned = (sel: string) =>
        new Set([...container.querySelectorAll(sel)].map((el) => el.getAttribute('data-field')));
      expect(pinned('.MuiDataGrid-columnHeader.pinned-col')).toEqual(new Set(['rank', 'eaId']));
      expect(pinned('.MuiDataGrid-cell.pinned-col')).toEqual(new Set(['rank', 'eaId']));
    });
  });

  it('pins nothing on a wide screen', () => {
    withViewport([], () => {
      const { container } = render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Wide' })]} />);
      expect(container.querySelector('.pinned-col')).toBeNull();
    });
  });

  it('shows every column on a wide screen', () => {
    withViewport([], () => {
      render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'Desktop' })]} />);
      for (const shown of ALL_HEADERS) {
        expect(screen.getByText(shown)).toBeInTheDocument();
      }
    });
  });
});
