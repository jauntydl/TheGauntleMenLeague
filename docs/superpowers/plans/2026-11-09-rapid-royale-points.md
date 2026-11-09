# Rapid Royale Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank the Rapid Royale Trio and Solo boards on a season points ledger (placement medals plus kills, assists and deaths) in place of the percentile rating, leaving Gauntlet's archive untouched.

**Architecture:** A new framework-free `lib/ledger.ts` holds the point constants and a pure scorer; `rankPlayers` dispatches Rapid Royale rows to it and Gauntlet rows to the existing percentile path. The table and the explainer read the ledger constants, never literals. The blend-by-games (K) machinery is deleted once nothing live reads it. Shipping is a code commit followed by `npm run data:rerank` and a data commit.

**Tech Stack:** TypeScript, Next.js 15 App Router, MUI 7 + MUI X DataGrid, Vitest + Testing Library. `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-11-09-rapid-royale-points-design.md`

## Global Constraints

- Placement points: gold **+15**, silver **+10**, bronze **+5**, loss **−5**. Fight points: kill **+1**, assist **+0.5**, death **−1**. Rating = plain season total, may be negative, never divided by anything.
- Rungs: Trio silver = `topthree`, bronze = `topfive`. Solo silver = `topfive`, bronze = `topten`. Gold is always `wins`.
- Ranked on a Rapid Royale board = `matches >= MIN_MATCHES (30)` **and** `rating > 0`. Everything else is Provisional and keeps its points.
- The user-facing word for the unplaced count is **Losses**; the row field is `unplaced`. The existing `losses` field (API `matches − wins`) is left alone.
- Gauntlet (Seasons 3–4) is never recomputed and its board, rating, weights, badges, columns and explainer sections stay. `data/board.json` is the archive; never regenerate it from empty.
- `lib/` stays framework-free; `buildBoard` stays pure; the build stays idempotent (ties break on `eaId`).
- Work on `main` per CLAUDE.md. Commit source first; `data/` and `roster.json` only in the final data commit after `git pull --rebase`. Do not push until the user has seen the re-ranked standings.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Run `npm test` and `npx tsc --noEmit` before each commit from Task 3 on; both must be clean at the end of Task 6.

## Review Focus

1. A committed row built before this change (has `top3Pct` etc., no `top3` counts) reaches the join route or `rerankBoard`; its medals must derive from the percentages exactly. Test: Task 2, "derives counts from the stored rates when the counts are absent".
2. A Trio row whose `topfive` counter is missing (reads 0 with wins > 0) fails the trust test; it must land in Provisional with a dash, never crash or score on fight points alone. Tests: Task 2 "returns null when a rung the mode needs is untrusted"; Task 3 "sends a player whose placement failed the trust test to Provisional, last"; Task 4 "renders a dash for null points".
3. A player with 30+ matches and exactly 0 points is Provisional (zero is "at or below"). Test: Task 3 "ranks only players above zero".
4. A negative total renders with a real minus sign and thousands separators, and half points round away from zero for display only. Test: Task 4 "formats points".
5. An archived Gauntlet row has none of the new fields and must still render its 0–100 rating and badges. Test: Task 4 "renders an archived Gauntlet row that predates the ledger fields".

---

### Task 1: Trusted placement counts on every row

**Files:**
- Modify: `lib/types.ts` (the `Metrics` type)
- Modify: `lib/metrics.ts` (`computeMetrics` return)
- Modify fixtures: `lib/rating.test.ts`, `lib/ranking.test.ts`, `lib/join.test.ts`, `components/LeaderboardTable.test.tsx`, `components/BoardView.test.tsx` (the `row()` builders)
- Test: `lib/metrics.test.ts`

**Interfaces:**
- Produces, on `Metrics`: `top3: number | null; top5: number | null; top10: number | null;` (counts, null under the same trust guard as the rates) and `gold: number | null; silver: number | null; bronze: number | null; unplaced: number | null; placementPts: number | null; fightPts: number | null;` (always null from `computeMetrics`; filled by the ledger scorer in Task 2).

- [ ] **Step 1: Write the failing tests** in `lib/metrics.test.ts`, inside `describe('computeMetrics on Rapid Royale Solo')`:

```ts
it('reports the trusted placement counts beside the rates', () => {
  const m = solo(soloSlice);
  expect([m.top3, m.top5, m.top10]).toEqual([30, 42, 72]);
});

it('nulls a count under the same guard as its rate', () => {
  const m = solo({ ...soloSlice, topfive_gm_rr_solo: 120 });
  expect(m.top5).toBeNull();
  expect(m.top10).toBeNull(); // measured against a broken top five
  expect(m.top3).toBe(30);
});

it('leaves the ledger fields for the scorer', () => {
  const m = solo(soloSlice);
  expect([m.gold, m.silver, m.bronze, m.unplaced, m.placementPts, m.fightPts]).toEqual([null, null, null, null, null, null]);
});
```

And in `describe('computeMetrics')` (Gauntlet): `expect([m.top3, m.top5, m.top10]).toEqual([null, null, null])` for `darkSlice`.

- [ ] **Step 2: Run** `npx vitest run lib/metrics.test.ts` — expect FAIL on the new tests (`undefined` is not `30`).

- [ ] **Step 3: Add the fields** to `Metrics` in `lib/types.ts` with one-line doc comments (counts: "the trusted count behind each rate, for the Rapid Royale points ledger"; ledger fields: "filled by scoreLedger (lib/ledger.ts) on Rapid Royale rows; null on Gauntlet rows and on rows built before 2026-11-09"). In `computeMetrics` return `top3: top3Trusted ? top3 : null` (and likewise top5, top10) and the six ledger fields as `null`.

- [ ] **Step 4: Add the nine keys to every `row()` fixture builder** listed under Files (`top3: null, top5: null, top10: null, gold: null, silver: null, bronze: null, unplaced: null, placementPts: null, fightPts: null`).

- [ ] **Step 5: Run** `npm test` and `npx tsc --noEmit` — expect all green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/metrics.ts lib/metrics.test.ts lib/rating.test.ts lib/ranking.test.ts lib/join.test.ts components/LeaderboardTable.test.tsx components/BoardView.test.tsx
git commit -m "Carry trusted placement counts and empty ledger fields on every row"
```

---

### Task 2: The ledger

**Files:**
- Create: `lib/ledger.ts`
- Test: `lib/ledger.test.ts`

**Interfaces:**
- Consumes: `BoardRow`, `Metrics` fields from Task 1; `ModeKey`, `MODES` from `lib/modes.ts`.
- Produces (all exported from `lib/ledger.ts`):

```ts
export type LedgerMode = 'rapidRoyale' | 'rapidRoyaleSolo';
export type Medal = 'gold' | 'silver' | 'bronze' | 'unplaced';
export type FightEvent = 'kill' | 'assist' | 'death';
export const PLACEMENT_POINTS: Record<Medal, number>;            // { gold: 15, silver: 10, bronze: 5, unplaced: -5 }
export const FIGHT_POINTS: Record<FightEvent, number>;           // { kill: 1, assist: 0.5, death: -1 }
export const FIGHT_FIELDS: Record<FightEvent, 'kills' | 'assists' | 'deaths'>;
export const MEDAL_RUNGS: Record<LedgerMode, { silver: 3 | 5; bronze: 5 | 10 }>; // Trio {3,5}, Solo {5,10}
/** The row fields that carry a point value, in board order: the four medals then kills, assists, deaths. */
export const LEDGER_FIELDS: readonly string[];
export function isLedgerMode(mode: ModeKey): mode is LedgerMode;
export type MedalCounts = Record<Medal, number>;
export type Ledger = MedalCounts & { placementPts: number; fightPts: number; rating: number };
export function medalCounts(row: BoardRow, mode: LedgerMode): MedalCounts | null;
export function ledgerOf(row: BoardRow, mode: LedgerMode): Ledger | null;
/** Every row with its ledger fields and rating filled (nulls where the rungs are untrusted) and standouts []. Pure. */
export function scoreLedger(rows: BoardRow[], mode: LedgerMode): BoardRow[];
export function ordinal(n: number): string;                      // 1st 2nd 3rd 4th … 10th 11th
/** "1st place" · "2nd–3rd place" · "4th–5th place" · "6th or worse" (Solo: 2nd–5th, 6th–10th, 11th or worse). */
export function finishLabel(mode: LedgerMode, medal: Medal): string;
/** "+15 each" · "+0.5 each" · "−5 each" (U+2212 minus). */
export function pointsEach(points: number): string;
```

- [ ] **Step 1: Write the failing tests** in `lib/ledger.test.ts`. Build rows with a `row()` helper copied from `lib/ranking.test.ts` (Task 1 shape).

```ts
const trio = (over: Partial<BoardRow>) => row({ matches: 100, wins: 20, top3: 40, top5: 55, top10: 70, kills: 300, assists: 100, deaths: 200, ...over });

it('scores the owner\'s table: 15/10/5/−5 and 1/0.5/−1', () => {
  expect(PLACEMENT_POINTS).toEqual({ gold: 15, silver: 10, bronze: 5, unplaced: -5 });
  expect(FIGHT_POINTS).toEqual({ kill: 1, assist: 0.5, death: -1 });
  expect(MEDAL_RUNGS).toEqual({ rapidRoyale: { silver: 3, bronze: 5 }, rapidRoyaleSolo: { silver: 5, bronze: 10 } });
});

it('derives Trio medals from wins, top three and top five', () => {
  expect(medalCounts(trio({}), 'rapidRoyale')).toEqual({ gold: 20, silver: 20, bronze: 15, unplaced: 45 });
  expect(ledgerOf(trio({}), 'rapidRoyale')).toEqual({ gold: 20, silver: 20, bronze: 15, unplaced: 45, placementPts: 350, fightPts: 150, rating: 500 });
});

it('derives Solo medals from wins, top five and top ten — same points, wider rungs', () => {
  expect(ledgerOf(trio({}), 'rapidRoyaleSolo')).toEqual({ gold: 20, silver: 35, bronze: 15, unplaced: 30, placementPts: 575, fightPts: 150, rating: 725 });
});

it('goes negative for a player below break-even', () => {
  const l = ledgerOf(trio({ matches: 50, wins: 0, top3: 2, top5: 5, kills: 40, assists: 0, deaths: 90 }), 'rapidRoyale');
  expect(l).toMatchObject({ placementPts: -190, fightPts: -50, rating: -240 });
});

it('keeps the half point an assist earns', () => {
  expect(ledgerOf(trio({ assists: 1 }), 'rapidRoyale')!.fightPts).toBe(300 + 0.5 - 200);
});

it('derives counts from the stored rates when the counts are absent', () => {
  // A row committed before 2026-11-09: rates to two decimals, no counts.
  const old = { ...trio({}), top3: undefined, top5: undefined, top10: undefined, top3Pct: 40, top5Pct: 55, top10Pct: 70 } as unknown as BoardRow;
  expect(medalCounts(old, 'rapidRoyale')).toEqual(medalCounts(trio({}), 'rapidRoyale'));
  const antimere = { ...trio({ matches: 289, wins: 187 }), top3: undefined, top5: undefined, top3Pct: 84.08, top5Pct: 91.7 } as unknown as BoardRow;
  expect(medalCounts(antimere, 'rapidRoyale')).toEqual({ gold: 187, silver: 56, bronze: 22, unplaced: 24 });
});

it('returns null when a rung the mode needs is untrusted', () => {
  expect(ledgerOf(trio({ top5: null, top5Pct: null }), 'rapidRoyale')).toBeNull();
  expect(ledgerOf(trio({ top5: null, top5Pct: null }), 'rapidRoyaleSolo')).toBeNull();
  expect(ledgerOf(trio({ top10: null, top10Pct: null }), 'rapidRoyale')).not.toBeNull(); // Trio never reads top ten
});

it('scores every row, fills the ledger fields and clears badges', () => {
  const [a, b] = scoreLedger([trio({ eaId: 'a', standouts: ['kd'] }), trio({ eaId: 'b', top5: null, top5Pct: null })], 'rapidRoyale');
  expect(a).toMatchObject({ gold: 20, silver: 20, bronze: 15, unplaced: 45, placementPts: 350, fightPts: 150, rating: 500, standouts: [] });
  expect(b).toMatchObject({ gold: null, silver: null, bronze: null, unplaced: null, placementPts: null, fightPts: null, rating: null });
});

it('names the modes that keep a ledger', () => {
  expect(isLedgerMode('rapidRoyale') && isLedgerMode('rapidRoyaleSolo') && !isLedgerMode('gauntlet')).toBe(true);
  expect(LEDGER_FIELDS).toEqual(['gold', 'silver', 'bronze', 'unplaced', 'kills', 'assists', 'deaths']);
});

it('labels finishes and point values for the board', () => {
  expect(['gold', 'silver', 'bronze', 'unplaced'].map((m) => finishLabel('rapidRoyale', m as Medal))).toEqual(['1st place', '2nd–3rd place', '4th–5th place', '6th or worse']);
  expect(['gold', 'silver', 'bronze', 'unplaced'].map((m) => finishLabel('rapidRoyaleSolo', m as Medal))).toEqual(['1st place', '2nd–5th place', '6th–10th place', '11th or worse']);
  expect([15, 0.5, -5].map(pointsEach)).toEqual(['+15 each', '+0.5 each', '−5 each']);
  expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
});
```

- [ ] **Step 2: Run** `npx vitest run lib/ledger.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement `lib/ledger.ts`** per the Interfaces block. `medalCounts`: for each rung the mode needs, take the stored count when it is a number, else `Math.round(pct × matches / 100)` from the matching `topNPct`, else null; then `gold = wins`, `silver = silverRung − wins`, `bronze = bronzeRung − silverRung`, `unplaced = matches − bronzeRung`. Header comment: the spec's intent paragraph in two sentences, the owner's numbers and date (2026-11-09), and why the fallback to rates exists (rows committed before the counts existed; exact below 10,000 matches at two decimals).

- [ ] **Step 4: Run** `npx vitest run lib/ledger.test.ts` — expect PASS. Run `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add lib/ledger.ts lib/ledger.test.ts
git commit -m "Add the Rapid Royale points ledger"
```

---

### Task 3: Rank Rapid Royale on the ledger

**Files:**
- Modify: `lib/ranking.ts`
- Modify tests: `lib/ranking.test.ts`, `lib/pipeline.test.ts` (Rapid Royale cases), `lib/join.test.ts` (Solo case at ~line 137)

**Interfaces:**
- Consumes: `scoreLedger`, `isLedgerMode` (Task 2).
- Produces: `rankPlayers(rows, mode, confidenceGames?)` keeps its signature for now (Task 6 drops the third parameter). On a ledger mode: `ranked` = scored rows with `matches >= MIN_MATCHES && rating !== null && rating > 0`, ranks 1…n; `provisional` = every other scored row, `rank: null`, points kept. Both sides sorted by `byPoints`: rating desc (nulls last) → `gold` desc → `fightPts` desc → `eaId` ascending. Gauntlet path unchanged.

- [ ] **Step 1: Write the failing tests** in `lib/ranking.test.ts`, a new `describe('rankPlayers on a Rapid Royale board')` using `rankFor(rows, 'rapidRoyale')` and the Task 2 `trio()` fixture shape:

```ts
it('ranks only players with the match floor and a total above zero', () => {
  const { ranked, provisional } = rankFor([
    trio({ eaId: 'positive' }),                                                       // 500
    trio({ eaId: 'zero', matches: 50, wins: 0, top3: 0, top5: 0, kills: 250, assists: 0, deaths: 0 }), // −250 + 250 = 0
    trio({ eaId: 'negative', matches: 50, wins: 0, top3: 2, top5: 5, kills: 40, assists: 0, deaths: 90 }),
    trio({ eaId: 'rookie', matches: MIN_MATCHES - 1, top3: 10, top5: 12 }),
  ], 'rapidRoyale');
  expect(ranked.map((r) => r.eaId)).toEqual(['positive']);
  expect(ranked[0].rank).toBe(1);
  expect(provisional.map((r) => r.eaId)).toEqual(['rookie', 'zero', 'negative']);
  expect(provisional.map((r) => r.rank)).toEqual([null, null, null]);
  expect(provisional.map((r) => r.rating)).toEqual([expect.any(Number), 0, -240]);
});

it('orders by points, then gold, then fight points, then EA ID', () => {
  // All three total 500: more-gold trades 20 fight points for one more win
  // (placement 370, fights 130); a and b are identical but for their IDs.
  const { ranked } = rankFor([
    trio({ eaId: 'b' }),
    trio({ eaId: 'a' }),
    trio({ eaId: 'more-gold', wins: 21, top3: 41, top5: 56, kills: 280 }),
  ], 'rapidRoyale');
  expect(ranked.map((r) => r.rating)).toEqual([500, 500, 500]);
  expect(ranked.map((r) => r.eaId)).toEqual(['more-gold', 'a', 'b']);
  expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
});

it('sends a player whose placement failed the trust test to Provisional, last', () => {
  const { ranked, provisional } = rankFor([trio({ eaId: 'ok' }), trio({ eaId: 'broken', top5: null, top5Pct: null })], 'rapidRoyale');
  expect(ranked.map((r) => r.eaId)).toEqual(['ok']);
  expect(provisional.map((r) => r.eaId)).toEqual(['broken']);
  expect(provisional[0].rating).toBeNull();
});

it('leaves no badges on a Rapid Royale row', () => {
  expect(rankFor([trio({ eaId: 'x', standouts: ['kd'] })], 'rapidRoyale').ranked[0].standouts).toEqual([]);
});
```

For the tie test, engineer three rows with equal `rating`: e.g. A `wins 20` (gold 20) vs B `wins 21, top3 41, top5 56, kills 285` — check the arithmetic so A and B tie on rating and B has more gold; add C equal to A in everything but `eaId`. Expected order: `['B', 'A-eaId-first', 'A-eaId-second']` with the two A's in `eaId` order.

- [ ] **Step 2: Run** `npx vitest run lib/ranking.test.ts` — expect FAIL (Rapid Royale rows still go through percentiles; negatives are ranked).

- [ ] **Step 3: Implement the dispatch** in `rankPlayers`: `if (isLedgerMode(mode)) { … } else { existing body }`. Put `byPoints` beside `byStanding`. Keep `MIN_MATCHES` as the single floor constant. Update the doc comments: the Gauntlet comment stays; add the Rapid Royale rule with the owner's words ("all 0 and negative players can go back to provisional", 2026-11-09).

- [ ] **Step 4: Adapt the pipeline and join tests.** In `lib/pipeline.test.ts`: `ranks Rapid Royale Solo on a board of its own` — the Trio row in `soloResponse` has 85 matches and no wins or placements, so its ledger is −425 and it is now Provisional: read it from `board.provisional.Season5[0]`; assert the Solo row's `{ gold: 4, silver: 9, bronze: 16, unplaced: 11, placementPts: 175, fightPts: 99, rating: 274 }` and `standouts: []`. `ranks a Rapid Royale season on Rapid Royale counters` — assert `{ gold: 52, silver: 16, bronze: 7, unplaced: 10, placementPts: 925, fightPts: 1065, rating: 1990 }`. In `lib/join.test.ts` `finds a Solo-only player on the Solo board` (line ~137): give the Solo fixture row Solo-trusted counts (`wins: 10, top5: 30, top10: 60, matches: 100`) so it stays ranked with a positive total; keep the assertion on placement.

- [ ] **Step 5: Run** `npm test` and `npx tsc --noEmit` — green.

- [ ] **Step 6: Commit**

```bash
git add lib/ranking.ts lib/ranking.test.ts lib/pipeline.test.ts lib/join.test.ts
git commit -m "Rank Rapid Royale boards on the points ledger; zero or below is Provisional"
```

---

### Task 4: The board shows the ledger

**Files:**
- Modify: `components/LeaderboardTable.tsx`
- Test: `components/LeaderboardTable.test.tsx`

**Interfaces:**
- Consumes: everything exported from `lib/ledger.ts` (Task 2); `MODES[mode].squadSize`.
- Produces (exported from the component file): `fmtPoints(v: number | null | undefined): string` (em dash for null; otherwise an integer with `en-US` thousands separators, half points rounded away from zero, negatives prefixed with U+2212 `−`); `pointsSplitLabel(row: BoardRow, mode: LedgerMode): string` → `Placement +350 (20 gold · 20 silver · 15 bronze · 45 losses) · Fights +150 (300 kills · 100 assists · 200 deaths)` (omit the assists term when `squadSize === 1`; signed numbers use `+`/`−`).
- Column order on a ledger board (data-field names), Olympic medal-table style per the spec: `rank, eaId, gold, silver, bronze, unplaced, kills, [assists], deaths, rating, kda | kd, kpm, dpm, [revivesPerHour], matches` — `assists` and `revivesPerHour` on Trio only; `kda` on Trio, `kd` on Solo; `rating` is the Points column and closes the ledger group like the medal table's Total. Gauntlet's column list is unchanged.
- Medal headers are the emoji 🥇 🥈 🥉 (the word goes first in the tooltip: `Gold · 1st place · +15 each`); medal cells are tinted `MEDAL_TINT: Record<'gold' | 'silver' | 'bronze', string>` exported from the component (gold `#FFD15C`, silver `#C9D1D9`, bronze `#D08A4E`, the builder may adjust); the Losses cell is `text.secondary`; the Points cell is bold in `primary.main`. Load `frontend-design:frontend-design` before styling.
- The lit header class stays `rated-col`; on a ledger board it marks exactly `LEDGER_FIELDS` plus `rating`.

- [ ] **Step 1: Write the failing tests.** Replace the Rapid Royale assertions in `shows each mode only the columns it rates`, `shows Solo its placement ladder…`, `labels the Solo placement columns`, `marks exactly the rated columns…` and `orders the rated columns…` (make the last two Gauntlet-only) and add:

```ts
const LEDGER_ORDER = { rapidRoyale: ['rank', 'eaId', 'gold', 'silver', 'bronze', 'unplaced', 'kills', 'assists', 'deaths', 'rating', 'kda', 'kpm', 'dpm', 'revivesPerHour', 'matches'],
  rapidRoyaleSolo: ['rank', 'eaId', 'gold', 'silver', 'bronze', 'unplaced', 'kills', 'deaths', 'rating', 'kd', 'kpm', 'dpm', 'matches'] };

it.each(['rapidRoyale', 'rapidRoyaleSolo'] as const)('shows a Rapid Royale board the ledger, then the reference columns (%s)', (mode) => {
  withViewport([], () => expect(fieldsOf(mode)).toEqual(LEDGER_ORDER[mode]));
});

it('lights exactly the columns that carry a point value, and the total', () => {
  withViewport([], () => {
    const { container } = render(<LeaderboardTable mode="rapidRoyale" rows={[row({ displayName: 'Lit' })]} />);
    expect(markedFields(container)).toEqual([...LEDGER_FIELDS, 'rating']);
  });
});

it('heads the medal columns with the medals and tints their counts', () => {
  withViewport([], () => {
    const { container } = render(<LeaderboardTable mode="rapidRoyale" rows={[row({ displayName: 'Medals', gold: 20, silver: 7, bronze: 3 })]} />);
    const header = (f: string) => container.querySelector(`.MuiDataGrid-columnHeader[data-field="${f}"]`)!.textContent;
    expect([header('gold'), header('silver'), header('bronze')]).toEqual(['🥇', '🥈', '🥉']);
    const cell = (f: string) => container.querySelector(`.MuiDataGrid-cell[data-field="${f}"] span`) as HTMLElement;
    expect(cell('gold').textContent).toBe('20');
    expect(cell('gold').style.color || getComputedStyle(cell('gold')).color).not.toBe(cell('unplaced').style.color);
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
  expect(columnDescription('matches', undefined, 'Matches', 'rapidRoyale')).toBe(`Matches this season · ${MIN_MATCHES} for a rank`);
});

it('formats points', () => {
  expect(fmtPoints(2653.5)).toBe('2,654');
  expect(fmtPoints(-1188)).toBe('−1,188');
  expect(fmtPoints(-2.5)).toBe('−3');
  expect(fmtPoints(0)).toBe('0');
  expect(fmtPoints(null)).toBe('—');
});

it('shows the split on hover', () => {
  withViewport([], () => {
    render(<LeaderboardTable mode="rapidRoyale" rows={[row({ eaId: 'Split', gold: 20, silver: 20, bronze: 15, unplaced: 45, kills: 300, assists: 100, deaths: 200, placementPts: 350, fightPts: 150, rating: 500 })]} />);
    expect(screen.getByLabelText('Placement +350 (20 gold · 20 silver · 15 bronze · 45 losses) · Fights +150 (300 kills · 100 assists · 200 deaths)')).toBeInTheDocument();
  });
});

it('renders a dash for null points and medals', () => { /* row with rating null, gold null on rapidRoyale → the Points and Gold cells read '—' */ });

it('shows a Provisional Rapid Royale player\'s points', () => { /* provisional mode, rating −240 → '−240' is in the document, rank cell is '—' */ });

it('renders an archived Gauntlet row that predates the ledger fields', () => {
  const archived = { ...row({ eaId: 'Old', rating: 61.4, standouts: ['kd'] }) } as Record<string, unknown>;
  for (const k of ['top3', 'top5', 'top10', 'gold', 'silver', 'bronze', 'unplaced', 'placementPts', 'fightPts']) delete archived[k];
  withViewport([], () => {
    render(<LeaderboardTable mode="gauntlet" rows={[archived as unknown as BoardRow]} />);
    expect(screen.getByText('61.4')).toBeInTheDocument();
  });
});
```

Also remove `says on each rating how much of it is the player's own` only in Task 6 (it still passes on Gauntlet until then). Rename the Gauntlet-only `shows no match-count column` test to say Gauntlet.

- [ ] **Step 2: Run** `npx vitest run components/LeaderboardTable.test.tsx` — expect FAIL.

- [ ] **Step 3: Implement.** Restructure the column definitions into one `COLUMNS: Record<string, GridColDef<BoardRow>>` (the current `RATED_COLUMNS` entries plus new `gold`, `silver`, `bronze`, `unplaced` (header `Losses`), `deaths`, `matches` (header `Matches`, description `Matches this season · ${MIN_MATCHES} for a rank`)); drop the `top3Pct`/`top5Pct`/`top10Pct` definitions. Type `RATED_LABEL` as `Partial<Record<string, string>>`. In the `useMemo`, branch on `isLedgerMode(mode)`: build the ledger order from `LEDGER_FIELDS`, `squadSize`, and the reference list; otherwise the existing Gauntlet list. Header descriptions on a ledger board: medals `${finishLabel(mode, m)} · ${pointsEach(PLACEMENT_POINTS[m])}`; kills/assists/deaths `pointsEach(FIGHT_POINTS[e])`; reference columns `${base} · reference only, not part of the points`. The `rating` column on a ledger board: header `Points`, description built from the constants (`Season points: gold +15, silver +10, bronze +5, loss −5; kill +1, assist +0.5, death −1. Hover a total for the split; see How the rating works.`), cell `fmtPoints` inside a `Tooltip` titled `pointsSplitLabel(row, mode)`. The lit test becomes `isLedgerMode(mode) ? LEDGER_FIELDS.includes(field) : RATING_WEIGHTS[mode][field] !== undefined`. Medal and deaths cells use `fmtInt` with `== null` guards (`fmtInt(v: number | null | undefined)` may now return the dash for null).

- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` — green. Then `npm run dev` and look at Season 5 Trio and Solo once (the committed rows have no ledger fields yet, so Points shows dashes — that is expected until Task 8; check the headers, order and tooltips).

- [ ] **Step 5: Commit**

```bash
git add components/LeaderboardTable.tsx components/LeaderboardTable.test.tsx
git commit -m "Show the points ledger on Rapid Royale boards, rates as reference"
```

---

### Task 5: Explain the points

**Files:**
- Modify: `components/RatingExplainer.tsx`, `app/rating/page.tsx`
- Test: `components/RatingExplainer.test.tsx`

**Interfaces:**
- Consumes: `PLACEMENT_POINTS`, `FIGHT_POINTS`, `MEDAL_RUNGS`, `finishLabel`, `pointsEach` (Task 2); `MIN_MATCHES`; `RATING_WEIGHTS.gauntlet`, `STANDOUT_FLOOR`.
- Produces: `RatingExplainer()` takes no props. Tables carry `aria-label`s `Rapid Royale placement points` (rows gold, silver, bronze, loss; columns Result · Trio finish · Solo finish · Points), `Rapid Royale fight points` (rows kill, assist, death) and `Gauntlet weights` (as today). `app/rating/page.tsx` renders `<RatingExplainer />` with no data read and no `revalidate` export.

- [ ] **Step 1: Write the failing tests** (replace the file's Rapid Royale weight tests; keep the Gauntlet weight, objective-formula and back-link tests):

```ts
it('shows the placement points and both modes\' rungs from the constants', () => {
  render(<RatingExplainer />);
  const t = screen.getByRole('table', { name: 'Rapid Royale placement points' });
  const rowFor = (label: string) => within(t).getByText(label).closest('tr')!;
  expect(rowFor('Gold')).toHaveTextContent('1st place'); expect(rowFor('Gold')).toHaveTextContent('+15');
  expect(rowFor('Silver')).toHaveTextContent('2nd–3rd place'); expect(rowFor('Silver')).toHaveTextContent('2nd–5th place'); expect(rowFor('Silver')).toHaveTextContent('+10');
  expect(rowFor('Bronze')).toHaveTextContent('4th–5th place'); expect(rowFor('Bronze')).toHaveTextContent('6th–10th place'); expect(rowFor('Bronze')).toHaveTextContent('+5');
  expect(rowFor('Loss')).toHaveTextContent('6th or worse'); expect(rowFor('Loss')).toHaveTextContent('11th or worse'); expect(rowFor('Loss')).toHaveTextContent('−5');
});

it('shows the fight points from the constants', () => {
  render(<RatingExplainer />);
  const t = screen.getByRole('table', { name: 'Rapid Royale fight points' });
  expect(within(t).getByText('Kill').closest('tr')).toHaveTextContent('+1');
  expect(within(t).getByText('Assist').closest('tr')).toHaveTextContent('+0.5');
  expect(within(t).getByText('Death').closest('tr')).toHaveTextContent('−1');
});

it('says the total is a plain sum that only the player\'s own games move', () => {
  render(<RatingExplainer />);
  expect(screen.getByText(/season total/i)).toBeInTheDocument();
  expect(screen.queryByText(/league-average/i)).toBeNull();
  expect(screen.queryByText(/games ÷/)).toBeNull();
});

it('names the reference columns as not part of the points', () => {
  render(<RatingExplainer />);
  expect(screen.getByText(/reference/i)).toHaveTextContent(/kills per minute|KPM/i);
});

it('states who is ranked: the match floor and a total above zero', () => {
  render(<RatingExplainer />);
  expect(screen.getByText(new RegExp(`${MIN_MATCHES} matches`))).toBeInTheDocument();
  expect(screen.getByText(/above zero|zero or below/i)).toBeInTheDocument();
});

it('keeps the Gauntlet weights for the archive', () => {
  render(<RatingExplainer />);
  expect(screen.getByRole('table', { name: 'Gauntlet weights' }).querySelectorAll('tbody tr')).toHaveLength(Object.keys(RATING_WEIGHTS.gauntlet).length);
  expect(screen.queryByRole('table', { name: 'Rapid Royale Trio weights' })).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run components/RatingExplainer.test.tsx` — expect FAIL.

- [ ] **Step 3: Rewrite `RatingExplainer`** in the spec's order: intro (Rapid Royale is ranked on points since 2026-11-09; Gauntlet's archive keeps its rating); **Rapid Royale** heading in `MODE_ACCENT.rapidRoyale` with: why points (the owner's reasoning: a hectic mode, rate stats stress people; every match can bank points; the only way down is finishing out of the medals or dying more than you kill; "your number moves only when you play"); the two tables; "Reference only" paragraph (KDA or K/D, KPM, DPM, revives per hour are shown to read, not ranked on); "Who is ranked" (`MIN_MATCHES` and a total above zero; zero or below is Provisional until you climb back); the trust-check paragraph kept. **Gauntlet · Seasons 3–4, archived** heading in `MODE_ACCENT.gauntlet` with the weight table (`REASONS` trimmed to Gauntlet's metrics, typed `Partial<Record<RatedMetric, …>>`), the objective-formula paragraphs, one paragraph on percentile scoring, the match floor and the badges paragraph (minus total wins). Delete the blend section, the placement-in-Rapid-Royale section, "No objective stat", "What is deliberately not in it", and the `confidenceGames`/`weekOfSeason` props and the `shrinkRate`/`CONFIDENCE_GAMES_PER_WEEK` imports. Simplify `app/rating/page.tsx` to a sync component returning `<RatingExplainer />`.

- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` — green. View `/rating` in `npm run dev` once.

- [ ] **Step 5: Commit**

```bash
git add components/RatingExplainer.tsx components/RatingExplainer.test.tsx app/rating/page.tsx
git commit -m "Explain the Rapid Royale points from the ledger constants"
```

---

### Task 6: Remove the blend and the Rapid Royale weights

**Files:**
- Modify: `lib/rating.ts`, `lib/ranking.ts`, `lib/pipeline.ts`, `lib/join.ts`, `lib/types.ts` (meta comment), `scripts/build.ts`, `scripts/rerank.ts`, `components/BoardView.tsx`, `components/LeaderboardTable.tsx`, `components/JoinForm.tsx`
- Tests: `lib/rating.test.ts`, `lib/pipeline.test.ts`, `lib/join.test.ts`, `components/LeaderboardTable.test.tsx`, `components/JoinForm.test.tsx`

**Interfaces:**
- Produces: `rateAll(rows: BoardRow[], mode: ModeKey): BoardRow[]` (percentiles, no blend); `rankPlayers(rows: BoardRow[], mode: ModeKey)`; `buildBoard(roster, responses, currentSeason, now?, archive?, failed?, seasonStart?)` unchanged in shape but `meta` no longer carries `confidenceGames`; `rerankBoard(board)` unchanged in shape. `RATING_WEIGHTS` keeps `gauntlet` and has `{}` for both Rapid Royale modes (type unchanged: `Record<ModeKey, Partial<Record<RatedMetric, number>>>`); `RatedMetric = keyof typeof GAUNTLET_WEIGHTS`. `STANDOUT_TRAITS` loses `'wins'`. Removed exports: `CONFIDENCE_GAMES_PER_WEEK`, `FALLBACK_CONFIDENCE_GAMES`, `weekOfSeason`, `confidenceGames`, `ownRateShare`, `shrinkRate`, `COUNT_METRICS`; from the table, `ownShareLabel` and the `confidenceGames` prop.

- [ ] **Step 1: Rewrite the tests first.** `lib/rating.test.ts`: delete the `confidenceGames` and `shrinkRate` describes and every Rapid Royale `rateAll` case (`rates the same good rate higher over more games…`, `weights harder as K rises…`, `rates Solo…`, `scores total wins…`, `awards a badge for total wins…`, `rates a Rapid Royale field…`); change `totals one in every mode` to Gauntlet only plus `expect(RATING_WEIGHTS.rapidRoyale).toEqual({}); expect(RATING_WEIGHTS.rapidRoyaleSolo).toEqual({});`; `rates the metrics the explainer promises` keeps only the Gauntlet list; add `expect(STANDOUT_TRAITS).not.toContain('wins')`. `lib/pipeline.test.ts`: replace the three K tests with `records the season launch, and no K` (`meta.seasonStart` set, `'confidenceGames' in board.meta` false) and `re-ranks the current season from committed rows, keeping builtAt` (stale copy with ratings zeroed → `rerankBoard(stale)` equals `live`). `lib/join.test.ts`: `moves existing ratings, because rating is a percentile of the field` stays (Gauntlet fixture); add `leaves everyone else's points alone on a Rapid Royale board` (Season5 Trio fixture rows with trusted counts; after `mergePlayer`, the existing rows' `rating` values are unchanged). `components/LeaderboardTable.test.tsx`: delete `says on each rating how much of it is the player's own`; drop the `wins` badge from the badge tests' fixtures.

- [ ] **Step 2: Run** `npm test` — the rewritten tests fail or the suite does not compile where names are gone; that is the signal.

- [ ] **Step 2b: Add the join-copy tests.** In `lib/join.test.ts` (`describe('placementOf')`): `reports a Provisional Rapid Royale player's points and that the board is a ledger` — a Season5 board whose provisional row has `rating: -240` → `placementOf` returns `{ rank: null, rating: -240, provisional: true, ledger: true }`; and the existing Gauntlet case returns `ledger: false` with `rating: null` for a provisional row. In `components/JoinForm.test.tsx`: a ranked ledger result renders `Points 1,990 across 85 Season 5 Trio matches.`; a provisional ledger result renders `You have 12 … matches and −40 points. 30 matches and a total above zero puts you in the standings.`; a Gauntlet result keeps today's wording.

- [ ] **Step 3: Delete the machinery.** In `lib/rating.ts` remove the two Rapid Royale weight objects and their comments, the blend block (`CONFIDENCE_GAMES_PER_WEEK` through `shrinkRate`), `COUNT_METRICS`, the `confidenceGames` parameter and `blended()` in `rateAll` (score raw values), and `'wins'` from `STANDOUT_TRAITS`; write a short header noting the percentile rating now serves the Gauntlet archive only and pointing at `lib/ledger.ts`. In `lib/ranking.ts` drop the third parameter. In `lib/pipeline.ts` drop `k` and `meta.confidenceGames` in both functions (keep `seasonStart` in meta). In `lib/join.ts` call `rankPlayers(all, modeForBoard(season).key)` and update its comment (re-ranking is still required: ranks and the Provisional split change, even though points do not). In `scripts/build.ts` replace the K log with `console.log(\`${currentSeason} launched ${seasonStart.toISOString()}\`)` or the existing warn without "rating with the fallback K". In `scripts/rerank.ts` log `re-ranked ${n} Rapid Royale rows on the points ledger`. In `lib/types.ts` mark `meta.confidenceGames?` as "legacy, written until 2026-11-09, ignored". In `components/BoardView.tsx` stop passing `confidenceGames`. In `components/LeaderboardTable.tsx` remove `ownShareLabel`, the prop, the `ratingDescription` blend sentence, and the `wins` entry of `TRAIT_BADGES`. `rerankBoard` returns `meta` without `confidenceGames` (destructure it away) so the first scheduled build after shipping is not a meta-only commit. `placementOf` in `lib/join.ts` gains `ledger: boolean` (`isLedgerMode` of the board the player was found on) and, on a ledger board, returns a Provisional player's `rating` instead of null; `processJoin`'s result and the `JoinForm` result type carry `ledger` through, and `JoinForm` uses `fmtPoints` (import from the table) for the ledger wording in Step 2b.

- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` — both clean. `grep -rn "confidenceGames\|shrinkRate\|CONFIDENCE_GAMES" lib components app scripts` finds only the legacy type comment.

- [ ] **Step 5: Commit**

```bash
git add lib components app scripts
git commit -m "Remove the games-blended rating and the Rapid Royale weights; percentiles serve the Gauntlet archive only"
```

---

### Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-11-09-rapid-royale-points-design.md` (status line)
- Modify: `/Users/davis.lee/.claude/projects/-Users-davis-lee-iCloud-Drive--Archive--Documents-MainProjects-GauntletTracker/memory/gauntlet-rating-weights.md` and its `MEMORY.md` line

- [ ] **Step 1: Rewrite the Rapid Royale parts of `CLAUDE.md`.** "Current state" line (date, ranked/provisional counts from Task 8, test count). "The rating" section: replace the two Rapid Royale weight tables and the "Rates are blended…" block with a "Rapid Royale points (2026-11-09)" section: the two point tables, the rungs, the derivation, the ranked rule, the reference columns, what left the board, the standings shift (Grizzzvg to #1, DIA6711 #45 → #2, Antimere99 #6, Bourn3A #20) and the owner's reasoning in their words. Keep the Gauntlet table and the badge-set paragraph (note total wins left the badge set). Decisions table: add "Rapid Royale ranks on a points ledger, not rates", "Loss −5 after −3 and −6 were tried", "Zero or below is Provisional", "No damage points"; strike the blend and total-wins rows or mark them superseded with the date. `data:rerank` row: "all a point-value change needs". Known loose ends: drop the K-related ones; add that `/api/leaderboard` now serves `rating` as the points total on Rapid Royale rows (no known consumer).

- [ ] **Step 2: Update the memory file** `gauntlet-rating-weights.md` (points ledger, the owner's numbers and dates, the "show re-ranked standings before pushing" habit kept) and its `MEMORY.md` pointer line. Set the spec's status to "approved 2026-11-09, implemented".

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-11-09-rapid-royale-points-design.md docs/superpowers/plans/2026-11-09-rapid-royale-points.md
git commit -m "Document the Rapid Royale points ledger"
```

---

### Task 8: Re-rank the committed board

**Files:**
- Regenerated: `data/board.json`, `data/season5.json`, `data/season5-solo.json`, `data/meta.json`

- [ ] **Step 1: Rebase first**, per CLAUDE.md: `git checkout -- data/ roster.json` (if dirty) then `git pull --rebase origin main`.

- [ ] **Step 2: Re-rank**: `npm run data:rerank`. Expect the log to name Season5 and no error.

- [ ] **Step 3: Verify against the spec's table** with a one-off node script over `data/board.json`: Trio ranked 63 / Solo ranked 10 (give or take any signups or refreshes that landed since 2026-11-07); Trio #1 Grizzzvg ≈ 12,294; Bourn3A Trio ≈ #20, Solo ≈ #6; every ranked row has `rating > 0`; no ranked row has `standouts` other than `[]`; archived `Season3`/`Season4` rows byte-identical to before (`git diff --stat data/` touches only the Season 5 files, `board.json` and `meta.json`). Print the top 10 of each board and Bourn3A's row for the user.

- [ ] **Step 4: Commit the data** and run the full suite one last time:

```bash
git add data/
git commit -m "Re-rank Season 5 on the points ledger"
npm test && npx tsc --noEmit
```

- [ ] **Step 5: Show the user the standings and wait for their go before `git push origin main`.** After the push, confirm the Vercel deployment for the code commit builds and the data commit shows as Canceled, and that the live board reads points within a minute.
