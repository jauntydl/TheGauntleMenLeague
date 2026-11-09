// components/LeaderboardTable.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  LeaderboardTable,
  fmtPct,
  fmtNum,
  fmtHours,
  fmtInt,
  badges,
  columnDescription,
} from './LeaderboardTable';
import type { BoardRow } from '@/lib/types';
import { RATING_WEIGHTS, STANDOUT_TRAITS, type RatedMetric } from '@/lib/rating';

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
    expect(badges(row({ standouts: ['wins'], wins: 1298 }))[0].detail).toBe('Top 10% — wins — 1,298 all season');
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

  it.each(MODE_KEYS)('marks exactly the rated columns in the header, and no others (%s)', (mode) => {
    // Derived from RATING_WEIGHTS on both sides, so this cannot be satisfied
    // by a hand-kept list drifting alongside the weights. It asserts the set
    // is exact: a context column picking up the marking would claim to feed
    // the rating when it does not.
    withViewport([], () => {
      const { container } = render(<LeaderboardTable mode={mode} rows={[row({ displayName: 'Marked' })]} />);
      expect(new Set(markedFields(container))).toEqual(new Set(Object.keys(RATING_WEIGHTS[mode])));
    });
  });

  it.each(MODE_KEYS)('orders the rated columns by weight, heaviest first (%s)', (mode) => {
    // The legend promises "heaviest first". This is what makes that true.
    withViewport([], () => {
      const { container } = render(<LeaderboardTable mode={mode} rows={[row({ displayName: 'Ordered' })]} />);
      const marked = markedFields(container);
      const w = RATING_WEIGHTS[mode];
      expect(marked).toEqual([...marked].sort((a, b) => w[b]! - w[a]!));
    });
  });

  it('shows each mode only the columns it rates', () => {
    withViewport([], () => {
      const g = render(<LeaderboardTable mode="gauntlet" rows={[row({ displayName: 'G' })]} />);
      const gFields = [...g.container.querySelectorAll('.MuiDataGrid-columnHeader')].map((el) => el.getAttribute('data-field'));
      expect(gFields).toContain('objPtsPerHour');
      expect(gFields).not.toContain('top3Pct');
      g.unmount();
      const r = render(<LeaderboardTable mode="rapidRoyale" rows={[row({ displayName: 'R' })]} />);
      const rFields = [...r.container.querySelectorAll('.MuiDataGrid-columnHeader')].map((el) => el.getAttribute('data-field'));
      expect(rFields).toEqual(expect.arrayContaining(['top3Pct', 'kda', 'kd']));
      expect(rFields).not.toContain('objSpm');
      expect(rFields).not.toContain('apm');
      // KDA is rated; K/D stays, unmarked, for reference.
      expect(markedFields(r.container)).not.toContain('kd');
      expect(rFields).not.toContain('objPtsPerHour');
    });
  });

  const fieldsOf = (mode: (typeof MODE_KEYS)[number]): (string | null)[] => {
    const r = render(<LeaderboardTable mode={mode} rows={[row({ displayName: `F-${mode}` })]} />);
    const fields = [...r.container.querySelectorAll('.MuiDataGrid-columnHeader')].map((el) => el.getAttribute('data-field'));
    r.unmount();
    return fields;
  };

  it('shows Solo its placement ladder — Top 5 and Top 10, and no Top 3', () => {
    withViewport([], () => {
      const fields = fieldsOf('rapidRoyaleSolo');
      expect(fields).toEqual(expect.arrayContaining(['top5Pct', 'top10Pct']));
      expect(fields).not.toContain('top3Pct');
      // Trio is unchanged: top three, and neither of the wider rungs.
      const trio = fieldsOf('rapidRoyale');
      expect(trio).toContain('top3Pct');
      expect(trio).not.toContain('top5Pct');
      expect(trio).not.toContain('top10Pct');
    });
  });

  it('labels the Solo placement columns', () => {
    withViewport([], () => {
      render(<LeaderboardTable mode="rapidRoyaleSolo" rows={[row({ displayName: 'Labels' })]} />);
      expect(screen.getByText('Top 5')).toBeInTheDocument();
      expect(screen.getByText('Top 10')).toBeInTheDocument();
    });
  });

  it('shows no Assists column on Solo, where nobody has a kill to assist', () => {
    withViewport([], () => {
      expect(fieldsOf('rapidRoyaleSolo')).not.toContain('assists');
      // The squad modes keep it: in Trio it is the count behind KDA.
      expect(fieldsOf('rapidRoyale')).toContain('assists');
      expect(fieldsOf('gauntlet')).toContain('assists');
    });
  });

  it('gives every rated column a tooltip naming its weight', () => {
    // The accent marks these columns as special; the tooltip says why, and
    // how much. Both sides read RATING_WEIGHTS, so a retuned weight cannot
    // leave a tooltip quoting the old one.
    //
    // Asserted on the description rather than by hovering: MUI opens the
    // tooltip on a real pointer, and jsdom never opens it.
    for (const mode of MODE_KEYS) {
      for (const [m, w] of Object.entries(RATING_WEIGHTS[mode])) {
        expect(columnDescription(m, undefined, 'Header', mode)).toContain(`${Math.round(w * 100)}% of the Rating`);
      }
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

  it('says on each rating how much of it is the player\'s own', () => {
    withViewport([], () => {
      render(
        <LeaderboardTable
          mode="gauntlet"
          confidenceGames={30}
          rows={[row({ eaId: 'Thirty', matches: 30 }), row({ eaId: 'Ninety', matches: 90 })]}
        />,
      );
      expect(screen.getByLabelText(/30 games: 50% their own rates, 50% league average/)).toBeInTheDocument();
      expect(screen.getByLabelText(/90 games: 75% their own rates, 25% league average/)).toBeInTheDocument();
    });
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
