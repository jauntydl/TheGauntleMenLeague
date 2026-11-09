# Rapid Royale points — design

**Date:** 2026-11-09 · **Status:** approved by the owner 2026-11-09 ("let's give it a shot, build"), implemented the same day ·
**Scope:** the Rapid Royale Trio and Solo boards (Season 5 on). Gauntlet
(Seasons 3–4, archived) is not touched.

## Intent

Rapid Royale is a hectic mode. Ranking it on rate stats — win %, K/D, kills
per minute, score per minute — turns every match into a threat to a number,
and the owner's view is that this "only discourages people and gives people
too much stress". The board should instead reward showing up and playing:
every match is a chance to bank points, a good fight banks more, and the
only way to lose points is to go out early or die a lot.

So the rating becomes a **points ledger**: a season total of points earned
by where you finished and how you fought. No percentiles, no weights, no
blending toward the field. Rate stats stay on the board as reference only.

## The scoring (the owner's numbers)

Every match earns exactly one placement result, and every kill, assist and
death moves the total. **The same rules apply to Trio and Solo**; only
where the medal rungs fall differs, because a Solo lobby is far bigger.

| Result | Trio finish | Solo finish | Points |
|---|---|---|---|
| Gold | 1st (the win) | 1st | **+15** |
| Silver | 2nd–3rd | 2nd–5th | **+10** |
| Bronze | 4th–5th | 6th–10th | **+5** |
| Loss | 6th or worse | 11th or worse | **−5** |

| Event | Points |
|---|---|
| Kill | **+1** |
| Assist | **+0.5** |
| Death | **−1** |

**Rating = season total** of all of the above. It is a plain sum, can be
negative, and is never divided by matches, minutes or anything else. A
player's number moves only when they play (or when a refresh picks up games
they played); nobody's points move because somebody else played, which the
percentile rating could not say.

The owner settled the numbers across several passes (10/6/3/−3, then −6,
then the table above), checking each against the live Season 5 board. The
−5 loss figure is the brake on volume: a player who dies more than they
kill and finishes outside the medals most matches goes negative however
much they play.

### How the figures are derived from the API

The API reports season-cumulative counters only: `matches`, `wins`,
`topthree`, `topfive`, `topten`, `kills`, `assists`, `deaths` (each read
from the mode-suffixed field, as every counter here is — see CLAUDE.md,
"Hard-won API facts"). There is no per-match history. The medal counts are
therefore differences of nested counters:

```
Trio:  gold = wins          silver = topthree − wins   bronze = topfive − topthree   losses = matches − topfive
Solo:  gold = wins          silver = topfive  − wins   bronze = topten  − topfive    losses = matches − topten
placementPts = 15·gold + 10·silver + 5·bronze − 5·losses
fightPts     = kills + 0.5·assists − deaths
rating       = placementPts + fightPts
```

A 2nd and a 3rd in Trio are indistinguishable (both silver); that is the
design, not a limitation to work around.

**Trust.** `computeMetrics` already refuses a placement counter that does
not sit between the wins and the matches, or that is smaller than the rung
inside it (Gauntlet's counters failed exactly that). The ledger uses the
same test: if either rung a mode needs is untrusted, the player's points
are **null** — not a partial total from fight points alone, which would be
on a different scale from everyone else's. A null-points player is shown
under Provisional with dashes in the Points and medal cells. On the
2026-11-07 board every one of the 68 Trio and 11 Solo ranked players
passes the test, so this is a safety net, not an expected state.

### Who is ranked (the owner's rule, 2026-11-09)

A player holds a rank only with **30 or more matches and a positive total**.
A total of zero or below sends them to Provisional however many matches
they have — "all 0 and negative players can go back to provisional", in
the owner's words. Provisional therefore holds three kinds of player, all
sorted by points: newcomers under 30 matches, players whose season is at
or below break-even, and anyone whose placement counters failed the trust
test. All of them show their points (or a dash); none has a rank. Climbing
back above zero puts a player straight back on the ranked board.

### What it does to the current board (2026-11-07 data)

| | Trio | Solo |
|---|---|---|
| #1 | Grizzzvg 12,294 pts, 683 matches (was #10) | Antimere99 1,927 (was #1) |
| #2 | DIA6711 9,851, 879 matches (was #45) | xsqueezex 1,262 (was #4) |
| #3 | EnriqueTheKid 8,638 (was #3) | daaacannon 1,146 (was #2) |
| Antimere99 | #6 (was #1) | #1 |
| Bourn3A | #20 (was #31) | #6 (was #8) |
| Ranked (30+ matches, positive total) | 63 (was 68) | 10 (was 11) |
| Moved to Provisional on a zero or negative total | 5 | 1 |
| Provisional players at zero or below | 9 of 30 | 19 of 59 |
| Median points per match, ranked | 13.5 | 8.6 |
| Correlation of total with matches | ~0.7 | ~0.5 |

The owner has seen these tables and accepts them. The board becomes
volume-sensitive by design: a median player banks about 13 points a Trio
match, so playing more almost always ranks higher, and only the players
below break-even fall as they play. Solo newcomers often show a negative
total in their first ten matches (big lobbies, fewer kills); the owner was
shown this, kept the −5 loss, and chose to show the number as it is but
keep anyone at or below zero off the ranked board (see "Who is ranked").

## Goals

- Rank both Rapid Royale boards on the ledger above, identically in logic.
- Show the ledger on the board: the points, the four result counts, and the
  three fight counts, each labelled with what it is worth.
- Keep KPM, DPM and revives per hour on the board **as reference**, visibly
  not part of the points.
- Remove kills per match from the Rapid Royale boards (the owner's first
  instruction), and every other stat the ledger and the reference set do not
  name.
- Explain the system on `/rating` from the same constants the code scores
  with, so the page cannot drift from the code — as the weight tables do
  today.
- Ship the code and the re-ranked Season 5 data in one push, as CLAUDE.md
  requires for any rating change.

## Non-goals

- **No change to Gauntlet.** Seasons 3–4 are a frozen archive. Their rows,
  their 0–100 percentile rating, their weights, columns, badges and the
  Gauntlet sections of `/rating` all stay. Kills per match stays on the
  Gauntlet boards too (its column and its 💀 badge); it leaves only Rapid
  Royale.
- **No points for damage, score, time, revives or headshots.** The owner's
  first note listed "KPM, DPM, KDA" as the individual metrics and then
  replaced that with the per-kill / per-assist / per-death figures; damage
  did not come back. Damage per minute is reference only.
- **No per-match figure in the rating.** Points per match is a rate, and a
  rate is what is being removed. (It may be computed for a tooltip if the
  builder wants, but it ranks nothing.)
- No change to the refresh cadence, the join flow, or the data source. The
  30-match floor stays and gains the positive-total rule beside it.
- No per-match history: the API does not have it.

## Anti-goals (would make this a failure even if it worked)

- A player's number falling because somebody else played.
- Hiding, flooring or softening negative totals. The owner asked whether
  many people land at zero or below, saw the counts above, and kept the
  numbers; a minus sign is honest information.
- Any badge, tint or sort on a rate stat sneaking back onto a Rapid Royale
  board. Reference columns are plain.
- A games-played bonus. Volume already flows through the ledger; adding
  more would double it.
- Re-rating or rewriting an archived season.

## The board (Rapid Royale tabs)

**Styled like an Olympic medal table** (the owner's direction, 2026-11-09,
after the design was approved): rank, name, then the medal counts under
🥇 🥈 🥉 headers with each column tinted its metal, and the total in bold
closing the group. Here the group also holds the losses and the three
fight counts, since they feed the total too. Columns, left to right. The
ledger columns are lit as the rated columns are today; the reference
columns are plain and sit after the total.

| Column | Shows | Header tooltip |
|---|---|---|
| # | rank | |
| Player | as today | as today |
| **🥇** | gold count, tinted gold | "Gold · 1st place · +15 each" |
| **🥈** | silver count, tinted silver | "Silver · 2nd–3rd place · +10 each" (Solo: 2nd–5th) |
| **🥉** | bronze count, tinted bronze | "Bronze · 4th–5th place · +5 each" (Solo: 6th–10th) |
| **Losses** | count, muted | "6th or worse · −5 each" (Solo: 11th or worse) |
| **Kills** | count | "+1 each" |
| **Assists** | count, Trio only | "+0.5 each" |
| **Deaths** | count | "−1 each" |
| **Points** | the season total, bold in the mode accent, an integer with thousands separators and a true minus sign — the medal table's "Total" | what the points are, and "hover for the split" |
| KDA (Trio) / K/D (Solo) | reference | "Reference only — not part of the points" |
| KPM | reference | same |
| DPM | reference | same |
| Rev/h | reference, Trio only | same |
| Matches | count | games this season; the 30 for a rank |

Hovering a **Points** cell shows the split, e.g.
"Placement +3,355 (187 gold · 56 silver · 22 bronze · 24 losses) ·
Fights +3,727 (3,471 kills · 1,390 assists · 439 deaths)".

Gone from the Rapid Royale boards: Rating (0–100), Badges, Win %, Top 3 /
Top 5 / Top 10 %, W–L, SPM, HS, K/match, Time, and plain K/D on Trio
(Trio keeps KDA as its one survival figure; Solo, where KDA is null, shows
K/D). The Gauntlet boards keep all of theirs.

Two places outside the table quote the rating and follow it: the **join
success message** (`components/JoinForm.tsx`) says "Points N across M
matches" on a Rapid Royale board and, for a Provisional player, shows their
points and says what earns a rank (30 matches and a total above zero); and
the public **`/api/leaderboard`** route serves the rows as they are, so on
Rapid Royale rows its `rating` field is the points total, not 0–100. No
consumer of that route is known; CLAUDE.md records the change in meaning
rather than adding a second field (the builder's call, 2026-11-09).

Solo hides the Assists column exactly as it does today (`squadSize` 1),
but the +0.5 per assist is still applied — same logic in both modes, and a
Solo assist count of 0 or 1 makes it inert anyway.

The **Provisional** view shows each player's points too. A percentile was
meaningless for a player outside the field, which is why Provisional rows
carried no rating; a ledger total is as true at 5 matches as at 500, so
there is nothing to hide. It holds everyone under 30 matches and everyone
at or below zero points (see "Who is ranked"); none of them has a rank.

The default sort is Points descending. Ties break on gold, then fight
points, then EA ID (so the build stays idempotent).

## `/rating`

The page is rewritten for Rapid Royale and keeps its Gauntlet sections,
marked as the archive's. The Rapid Royale part says, in this order:

1. Why points: the hectic-mode / stress reasoning above, in the owner's
   terms; every match can bank points; the only way down is finishing out
   of the medals or dying more than you kill; your number moves only when
   you play.
2. The two tables above, **rendered from the constants in code** (one for
   placement with both modes' rungs, one for fights).
3. What is reference only and why (KDA/K-D, KPM, DPM, revives: there to
   read, not to be ranked on).
4. Who is ranked: 30 matches and a positive total; zero or below is
   Provisional until you climb back.
5. The trust check on placement counters, in one paragraph (kept from the
   current page).

The sections on percentile scoring, "your rating can move when other
people play", blending with K games, and badges apply to Gauntlet only and
are moved under the Gauntlet heading or cut if they describe nothing the
archive shows (the blend never applied to an archived board — see below).

## Code shape (decided here; names are the builder's)

- **`lib/rating.ts`** gains the ledger as exported constants — placement
  points, fight points, and each Rapid Royale mode's rungs (which `topN`
  counter is silver and which is bronze) — and a pure function that turns
  one row into `{ gold, silver, bronze, unplaced, placementPts, fightPts,
  rating }` or nulls. The Rapid Royale entries in `RATING_WEIGHTS` go;
  `RATING_WEIGHTS` keeps Gauntlet. The table, the explainer and the tests
  read the ledger constants, never literals.
- **Row fields.** Rows gain the medal counts and the two sub-totals, so the
  tooltip and the board read stored values and a re-rank needs no API. The
  user-facing word is **Losses**; the field must not be `losses`, which
  already exists on every row as the API's `matches − wins` and stays as it
  is (unused on Rapid Royale boards). `unplaced` is the suggested name.
  `rating` holds the total; it is no longer 0–100 on these boards. `kda`
  stays as it is (Trio only). `standouts` is `[]` on every Rapid Royale row.
- **Rows built before this change** (the committed Season 5 rows, and any
  row the join route meets before the next build) carry `top3Pct`,
  `top5Pct`, `top10Pct` and `matches` but no counts. The ledger derives a
  count as `round(pct × matches / 100)`, which is exact for any realistic
  match count (the rates are stored to two decimals). This keeps
  `npm run data:rerank` sufficient to ship the change with no API call, and
  keeps a signup that lands between deploy and first build correct.
- **`rankPlayers` / `rateAll`** dispatch on mode: Rapid Royale rows go
  through the ledger; Gauntlet rows go through the percentile path as
  today. On a Rapid Royale board the ranked set is rows with
  `matches >= MIN_MATCHES` **and** a total above zero; everyone else is
  Provisional and keeps their points (null where the rungs are untrusted).
  Gauntlet's split stays on matches alone — its rows are never re-ranked
  anyway.
- **The blend (K) machinery is removed**: `CONFIDENCE_GAMES_PER_WEEK`,
  `confidenceGames`, `shrinkRate`, `ownRateShare`, `weekOfSeason`, the K
  parameter on `rankPlayers`/`rateAll`/`buildBoard`/`rerankBoard`/the join
  route, the K log line in `scripts/build.ts`, the rating tooltip's
  own-share label, and `meta.confidenceGames` as something the build
  writes. It was introduced 2026-10-31, after Season 4 froze, so no
  archived rating was computed with it; after this change nothing live
  uses it. The type keeps `meta.confidenceGames` optional so an old file
  still parses; readers ignore it. `meta.seasonStart` stays (harmless and
  informative).
- **`components/LeaderboardTable.tsx`** derives the Rapid Royale column set
  from the ledger constants (the lit set is "columns that carry a point
  value"), and the Gauntlet column set from `RATING_WEIGHTS` as today. The
  Points cell formats an integer; the Gauntlet Rating cell keeps one
  decimal. Header tooltips carry the point values from the constants.
- **`CLAUDE.md`**: the Rapid Royale rating section, the decisions table and
  the modes notes are rewritten to describe the ledger; the blend
  paragraphs go; the Gauntlet section stays. The rating-weights memory
  file is updated to match.
- **Shipping**: code commit, then `npm run data:rerank` (no API call) and a
  data commit, in the fetch-rebase-rebuild order CLAUDE.md gives. The next
  scheduled build then writes the stored counts for every row.

## Left to the builder

- Exact field, constant and function names; whether `rateAll` is split into
  two functions or branches inside.
- How the Points tooltip and the header tooltips are worded, within the
  examples above.
- Whether KDA / K/D is one column definition with a mode-dependent field, or
  two.
- Test layout. Expected coverage: ledger arithmetic for both modes
  including a negative total and the half-point; the untrusted-rung null;
  the pct-derived counts matching stored counts; Provisional rows carrying
  points; a 30+-match player at zero or below landing in Provisional and a
  positive one on the board; the Rapid Royale column set and order; the explainer rendering
  the constants; the join route re-ranking through the ledger; build
  idempotence. Current state: 355 tests passing, `tsc --noEmit` clean.
