# The GauntleMen League

A Battlefield 6 leaderboard for a ~300 person community, ranked by season.
**Seasons 3–4 were Gauntlet** (now archived, ranked on a percentile rating of
rate stats); Gauntlet was removed in Season 5, and **from Season 5 the board
ranks Rapid Royale on a points ledger** — a season total of placement medals
and kills, assists and deaths (2026-11-09; see "The rating").

```
GitHub Action (cron every 2 h at :23 UTC, or the owner's hidden refresh)
  → scripts/build.ts: resolve ids → bulk calls → extract → compute → rank
  → commits data/*.json, then POSTs /api/revalidate (needs REVALIDATE_SECRET; optional)
  → Vercel skips the build for a data-only commit (vercel.json ignoreCommand)
  → Next.js App Router + MUI reads data/board.json from GitHub at request time, cached 60 s
```

No database. No runtime writes. **No upstream API call at request time** — the
data is committed, so a page load can never hit the free community API. Since
2026-11-07 the site reads the committed `data/board.json` back from GitHub at
request time (our own file, through Next's data cache — see "The site reads
the board from GitHub" below), so a data commit no longer redeploys anything.

- Live: <https://the-gauntle-men-league.vercel.app>
- Repo: `github.com/jauntydl/TheGauntleMenLeague` (public)
- `origin` = `git@github.com-P:jauntydl/TheGauntleMenLeague.git` — the
  `github.com-P` host alias uses the **personal** SSH key (`~/.ssh/id_personal`).
  The default `github.com` host maps to a *work* key, so a plain
  `git@github.com:` URL pushes as the wrong identity.
- Design spec: `docs/superpowers/specs/2026-09-12-gauntlet-leaderboard-design.md`

Current state (2026-11-09): 147 roster members · Season 5 Trio has 63
ranked, 30 provisional; Solo has 10 ranked, 59 provisional (on the points
ledger — see below); 3 unresolved · Seasons 3–4 archived, Season 2 dropped ·
372 tests passing · `tsc --noEmit` clean.

---

## ⚠️ Past seasons are archived — the board is the only copy

The API stops serving a season's stats some time after it ends. So
`buildBoard` computes **only the current season** from the API and carries
every other season over **verbatim** from the previously committed
`data/board.json`. A season freezes the first build after a newer one goes
current; signups (`mergePlayer`) never touch it either. Past seasons the API
still reports are ignored — a season is only ever kept, never rediscovered.

Consequences:
- `data/board.json` in git **is the archive**. Don't regenerate it from an
  empty file, and don't hand-edit archived seasons. Git history is the backup.
- Dropping a season (Season 2 was, 2026-10-27) means deleting its keys from
  `board.json` and its `data/seasonN.json` once; nothing re-adds it.
- An outgoing season freezes as of the last build before rollover — up to a
  day or two stale given the cron's lateness.
- Archived rows predate later metrics (no `kda`/`top3Pct`), which is why
  `fmtNum`/`fmtPct` guard `== null`.

## Modes

`lib/modes.ts` maps season → modes: below `FIRST_RAPID_ROYALE_SEASON` (5) is
Gauntlet (`GraniteGauntlet0`, suffix `_gm_gntgauntlet`), from it on Rapid Royale
**Trio** (`GraniteRapidTrio0`, suffix `_gm_rr_trio`) and **Solo**
(`GraniteRapidSolo0`, suffix `_gm_rr_solo` — added 2026-10-27, written while the
API was down; confirm against a live response), each ranked on its own board.

**A season can hold several boards.** `board.seasons` / `board.provisional` are
keyed by *board key*: a season's first mode keeps the bare key (`Season5` =
Trio, so every archived key is unchanged) and later modes append a suffix
(`Season5-solo`). `meta.seasons` lists seasons only — one tab each — and the
board shows a Trio / Solo sub-tab for each board the file holds. Use
`boardKey` / `parseBoardKey` / `modeForBoard`, never string-slice keys. Metrics read `<stat>_gm_<suffix>`,
Gauntlet's weights are `RATING_WEIGHTS.gauntlet`, the Rapid Royale ledger is
`lib/ledger.ts` (`isLedgerMode(mode)` tells the two apart), and the board
draws each mode in its own accent (`app/accents.ts`): Gauntlet amber, Rapid
Royale magenta.

Rapid Royale suffix notes (verified 2026-10-27): `rr_all` matches `rr_trio`
field for field (likely a parent rollup); `granitebr` is a battle-royale rollup
that differs between the squad BR and Rapid Royale slices — never read it. The
mode has **no objective counters** (only `intel_pickup`), and has placement
counters (`topthree`, `topfive`, `topten`). In Trio `topten` sat near 100%
for everyone; Solo lobbies are bigger (top ten ran 52–76% for the players
checked on 2026-11-03). That is why the ledger's medal rungs differ by mode
(`MEDAL_RUNGS`): Trio silver = top three, bronze = top five; Solo silver =
top five, bronze = top ten. All three rates and their trusted counts
(`top3`/`top5`/`top10`) are computed on every Rapid Royale row.

`NAME_OVERRIDES` in `lib/naming.ts` hand-sets a displayed name (Antimere99 →
OO, HoRR1DDD → D3VouRR), applied at render — not in `roster.json`, whose `inGameName` the build
treats as a refreshable cache.

---

## ⚠️ `main` moves under you — fetch before you commit

**Never push a locally rebuilt `data/` + `roster.json` without rebasing first.**

`main` receives commits from three sources: you, the 09:00 UTC bot refresh, and
every self-serve `/join` signup. Signups land several times a day — on
2026-09-15 seven commits (six signups plus the bot) landed inside one working
session.

`data/board.json` and `roster.json` are whole-file regenerated artifacts, so a
stale local copy does **not** produce a merge conflict. It silently deletes
everyone who signed up while you worked. Use this order:

```bash
git add <source files only>          # lib/, components/, app/ …
git commit
git checkout -- data/ roster.json    # throw away local regenerated artifacts
git pull --rebase origin main        # pick up signups + bot refresh
npm run data                         # rebuild against the full roster
git add data/ roster.json && git commit
git push origin main
```

Discarding your local `roster.json` costs nothing: the build only writes back
`personaId` / `nucleusId` / `inGameName` as a cache, and whatever it resolved
locally is re-resolved next run (or is already on the remote).

## ⚠️ Changing the rating? Rebuild the data in the same change

Scoring runs in **the build, not the renderer** — `rating`, the ledger fields
and `standouts` are computed once and committed. A point value or weight
change has no effect on the live board until `npm run data` runs — or
`npm run data:rerank`, which re-ranks the committed rows without an API call
and is all a point-value or weight change needs.

Worse, adding a *new* metric without rebuilding takes the page down.
`lib/data.ts` casts the committed JSON with `as unknown as BoardFile`, so
TypeScript cannot see the field is missing; at runtime the new column reads
`undefined`. `fmtNum`/`fmtPct`/`fmtInt`/`fmtPoints` guard `== null`, so the
page shows dashes instead of crashing. Ship code and regenerated data in the
same push. (Archived seasons are never regenerated, so they never gain it.)
The ledger is the one exception that tolerates old rows: a row without the
`top3`/`top5`/`top10` counts derives them from its stored rates
(`medalCounts`), so the join route stays correct between a deploy and the
next build.

## The refresh runs every two hours, best-effort, and is rarely on time

The cron (`.github/workflows/refresh.yml`) says :23 past every second hour
UTC. GitHub runs scheduled workflows on shared capacity and delays or drops
them under load, so that is a request, not a promise. Observed while it was
daily at 09:23: starts at 14:16 and 15:49 UTC, five and nearly seven hours
late, and 2026-09-16 skipped entirely. The schedule sits off the top of the
hour (:00 is the most contended minute), and the board says "next refresh
**after** <time>" because promising a time the job has never hit made
ordinary lateness look like the site was broken. `lib/schedule.ts` is the one
place that knows the cadence; a test checks it against the cron.

It went four-hourly on 2026-10-31 and two-hourly on 2026-11-02 (both the
user's call — even four-hourly, GitHub ran only 06:23 and 18:30 UTC on
11-02, a 12-hour gap). The daily job died five
runs in a row, 2026-10-26 to 30: a dropped socket mid-stream, then a 503 on a
different URL each day (the bulk call once, a persona-name lookup three
times), all around 16:00 UTC, every one answering 200 the next morning. One
failed request aborted the whole build, so the board sat on Oct 25's data for
a week. Two things changed:

- **One member can no longer sink the run.** Every per-member call gets at
  least two tries: the request-level retries, and for a member in a bulk
  batch that still fails, a second one-player call of their own after a
  `BULK_FALLBACK_PAUSE_MS` pause (`fetchBulkSkippingFailures`). A member the
  API still won't answer for is skipped for that run and listed on
  `/not-listed` as `fetch_failed` ("skipped on the last refresh"), distinct
  from privacy, and tried again next run. A failed persona-name lookup only
  leaves the EA ID showing. `MAX_SKIPPED_SHARE` in `scripts/build.ts` still
  fails the build if more than half the roster is skipped: that is an outage,
  and a half-empty board is worse than a stale one.
- **A skipped member drops off the current season for that run** (there is
  nothing to compute from) and reappears on the next successful one, so
  ratings can shift for a few hours when someone is skipped. The user chose
  this over carrying their previous row forward.

If a run is missed, the next is at most two hours away. For when it can't
wait, the owner has a **hidden manual refresh**: five quick taps on the
"Stats read …" chip (`components/SecretRefresh.tsx`) open a password box →
`POST /api/refresh` → `lib/refresh.ts`. The server checks the password
against the `REFRESH_PASSWORD` Vercel env var (never in the repo — it is
public), then dispatches `refresh.yml` through the GitHub API with the same
`GITHUB_TOKEN` signups use, which therefore also needs **Actions: Read and
write**. It refuses while a run is queued or going and within
`REFRESH_COOLDOWN_MS` (15 min) of the last run's start, read from GitHub's run
history so it holds across serverless instances; guesses are rate-limited
per IP. Hiding is courtesy; the password and cooldown are the protection.
The workflow's `concurrency` group queues a manual run behind a scheduled
one instead of racing it to push.

Running `npm run data` locally and pushing also works. `gh workflow run`
needs admin on the repo, and the `gh` CLI here is authenticated as a
different account than `origin` (which uses the personal SSH key), so
dispatching from the CLI fails with 403.

Signups keep committing board data between refreshes, so the board is never
truly stale — but `meta.builtAt` only moves on a real refresh, which is what
the page reports.

## The site reads the board from GitHub, not from its bundle (2026-11-07)

"Refresh takes way too long since it's essentially a rebuild" — the user.
A refresh was two builds in a row: the Action (checkout, install, the polite
roster-wide fetch; 3 m 13 s to 4 m 33 s across the twelve runs before the
change) and then, because `lib/data.ts` statically imported the JSON, a full
Vercel build to ship one changed file. The second build is gone:

- **`getBoard()` is async** and reads `data/board.json` from the repo through
  `readFile` in `lib/github.ts`, with the fetch carrying
  `next: { revalidate: BOARD_REVALIDATE_SEC (60), tags: [BOARD_CACHE_TAG] }`
  so Next's data cache answers page loads — one GitHub read a minute at most,
  however many people are looking. The pages' `export const revalidate = 60`
  repeats the number as a literal because Next.js requires one. The static
  import stays as the **fallback**: no `GITHUB_TOKEN` (local dev, tests) or a
  read GitHub refuses serves the build-time snapshot with a `console.warn`,
  stale rather than a 500. The fallback goes staler with every data-only
  commit, since those no longer build; that is what it is for.
- **`POST /api/revalidate`** purges the cache by tag. Bearer secret in
  `REVALIDATE_SECRET` (a Vercel env var and a GitHub repo secret of the same
  name — neither is set by the code; the owner sets both), checked with the
  same constant-time compare and per-IP guess limit as the manual refresh,
  and an unset secret refuses everyone. The workflow calls it after a push
  and **skips, never fails**, when the secret is missing or the site does
  not answer: the data is already pushed and the minute's cache does the job.
- **`vercel.json` `ignoreCommand`** skips the build when the diff between the
  last *successful* deployment (`VERCEL_GIT_PREVIOUS_SHA`) and the new commit
  touches only `data/` and `roster.json`. Against the previous deployment,
  not `HEAD^`: the "code commit, then data commit, one push" order above
  would otherwise diff two data commits and never build the code. Any doubt
  (no previous SHA, SHA not in the clone) exits 1 and builds. A skipped
  build shows in Vercel as **Canceled**, which is the expected state for
  every bot and signup commit now.
- Consequences: the join route's player is live within a minute of the
  commit with no deploy; the GitHub contents API's base64 path tops out at
  1 MB and `board.json` is ~390 KB (switch `readFile` to the raw media type
  before then); Next's data cache holds entries up to 2 MB.

## Be a polite API consumer

gametools.network is free, donation-funded, unofficial, and the only option —
EA publishes no public Battlefield stats API, and tracker.gg forbids scraping
with a legal warning. **Twelve scheduled runs a day, plus the owner's manual
refreshes** — the cron went from daily to four-hourly on 2026-10-31 and to
two-hourly on 2026-11-02, each at the user's direction. `npm run data` makes
live calls across the whole roster; don't run it casually, and don't add
another cron.
Consider [sponsoring them](https://github.com/sponsors/community-network).

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally |
| `npm test` | 355 tests |
| `npm run build` | Production build |
| `npm run data` | Refresh `data/` from the API — **makes live network calls** |
| `npm run data:dry` | Same, writes nothing |
| `npm run data:rerank` | Re-rank the committed board with **no API call** — all a rating-only change (a ledger point value, a Gauntlet weight) needs |
| `npm run roster:parse -- intros.txt` | One-off roster seeding (done; refuses to overwrite) |

---

## The rating

Two systems. **Rapid Royale (Season 5 on) is a points ledger**
(`lib/ledger.ts`); **Gauntlet (Seasons 3–4, archived) is a percentile
rating** of weighted rate stats (`RATING_WEIGHTS.gauntlet`, `lib/rating.ts`).
The `/rating` page and the table's header tooltips read both from the
constants rather than repeating the numbers in prose, so neither can quietly
disagree with the code. Design: `docs/superpowers/specs/2026-11-09-rapid-royale-points-design.md`.

### Rapid Royale points (2026-11-09)

The user's call, replacing the weighted rating that ran 2026-10-27 to
2026-11-09: "tracking traditional stats in a hectic mode as in Rapid Royale
only discourages people and give people too much stress." The rating is a
**plain season total** of points — nothing divided by matches or minutes,
nothing compared to the field, nobody's number moves because someone else
played. It can go negative. Same logic in Trio and Solo; only the medal
rungs differ, because a Solo lobby is far bigger.

| Result | Trio finish | Solo finish | Points |
|---|---|---|---|
| Gold | 1st | 1st | **+15** |
| Silver | 2nd–3rd | 2nd–5th | **+10** |
| Bronze | 4th–5th | 6th–10th | **+5** |
| Loss | 6th or worse | 11th or worse | **−5** |

| Event | Points |
|---|---|
| Kill | **+1** |
| Assist | **+0.5** (applied in Solo too, where it reads 0 or 1 and is inert) |
| Death | **−1** |

The numbers are the user's, settled against the live board in passes:
10/6/3/−3, then −6 for a loss ("does it leave many people to 0 or negative
points" — 7 of 68 Trio ranked did), then 15/10/5/−5. Constants:
`PLACEMENT_POINTS`, `FIGHT_POINTS`, `MEDAL_RUNGS`. Medals are differences of
the nested API counters (gold = wins, silver = silver-rung count − wins,
bronze = bronze-rung − silver-rung, losses = matches − bronze-rung), so a
2nd and a 3rd in Trio are indistinguishable by design. A rung that fails
`computeMetrics`' trust test makes the whole ledger **null** (never a
partial total from fight points alone); such a player sits in Provisional
with dashes.

**Who is ranked:** 30+ matches **and a total above zero**. "All 0 and
negative players can go back to provisional" — the user. Provisional holds
newcomers, players at or below break-even, and null-ledger players, all
with their points showing and sorted by points. Ties break on gold, then
fight points, then EA ID (the build's idempotence needs a total order).

**No blending.** The K-games blend toward the field mean (2026-10-31 to
2026-11-09) left with the rates it blended — "no more mixing 30 games with
average logic right?? the system is now purely accumulation base". No
archived board was ever rated with it. `meta.confidenceGames` is a legacy
field `rerankBoard` strips.

**The board** (Rapid Royale tabs) is styled as an **Olympic medal table**
at the user's request: rank, player, then 🥇 🥈 🥉 columns tinted their
metal (`MEDAL_TINT`), Losses muted, Kills / Assists / Deaths, and **Points**
bold in the accent closing the group like the medal table's Total. After
it, plain and unlit, the **reference columns**: KDA (Trio) or K/D (Solo),
KPM, DPM, Rev/h (Trio) and Matches — "just reference metrics that don't
directly affect rating". Gone from Rapid Royale: Win %, Top-N %, W–L, SPM,
HS, K/match (the user's first instruction), Time, plain K/D on Trio, and
**all badges** (`standouts` is `[]` on every Rapid Royale row). Hovering
Points shows the split: placement points with the medal counts, fight
points with the kill / assist / death counts. Column order is
`ledgerFields(mode)` in `components/LeaderboardTable.tsx`; the lit set is
`LEDGER_FIELDS` plus `rating`, and tests pin both.

Where the standings moved on 2026-11-07 data: Grizzzvg #10 → #1 (12,294
pts on 683 matches), DIA6711 #45 → #2 (879 matches), Antimere99 #1 → #6,
Bourn3A #31 → #20 in Trio and #8 → #6 in Solo. Totals correlate ~0.7 with
matches in Trio by design: a median player banks about 13 points a match,
so playing more almost always ranks higher and only players below
break-even fall as they play. The user saw these tables and accepted them.

Consequences: `rating` on a Rapid Royale row is the points total, not
0–100 — including on the public `/api/leaderboard` route (no known
consumer); the join form says "N points across M matches" there and shows
a Provisional player their points; `lib/ledger.ts` is framework-free like
the rest of `lib/`.

**Not in the ledger, by the user's direction or mine:** damage (the user's
per-event list — kill, assist, death — did not include it; DPM is
reference), score, time, revives, headshots. **No points per match
anywhere** in the rating — a rate is what was removed. **No games-played
bonus** — volume already flows through the total.

### Gauntlet (Seasons 3–4, archived), set 2026-09-15

Frozen with the seasons; changing these weights changes nothing on the board.

| Weight | Metric | Why |
|---|---|---|
| 35% | Win rate | Last squad standing is the whole point of the mode |
| 15% | Objective points per hour | Gauntlet eliminates squads on objectives; unlike a win it is attributable to one player |
| 12% | K/D | Staying alive matters when dying ends your squad's round |
| 12% | Kills per **minute** | Per-minute, not per-match — see below |
| 12% | Score per minute | Picks up the spotting and support work no other field sees |
| 10% | Revives per hour | Picking people up keeps a squad in the bracket |
| 4% | Damage per minute | Already counted once inside the kills it sets up |

The board mirrors the weights: the rated columns sit together straight after
the player, ordered heaviest first, with their headers lit in amber and a
legend above the table saying so. `RATED_FIELDS` in `components/LeaderboardTable.tsx`
derives that set from `RATING_WEIGHTS`, and tests assert both the set and the
order — so retuning a weight moves the columns and the marking with it, and a
hand-kept list cannot drift.

**Objective points are Kricked's formula**, from the community spreadsheet,
used as written: `0.1 × seconds on objective + 10 × destroyed + 5 × disarmed +
3 × intel pickups`, divided by hours played. Credit the source if the
coefficients are ever retuned. Per hour rather than per match because Gauntlet
is an elimination format — winning squads play more rounds, so a per-match
average measures how deep the team went rather than the player's own rate.
Kricked's sheet runs this over lifetime totals; the board runs it per season
like every other stat, so the figures will not match the sheet one-for-one.

Gauntlet scoring is **percentile against the season's ranked field**, not a
points formula — the units aren't comparable (a 3.0 K/D and 420 DPM), and any
coefficient making them comparable would be invented and need retuning as the
field changed. Consequence: *a Gauntlet rating moved when other people
played* (moot now the seasons are frozen). A metric that is `null` for a
player is dropped and the remaining weights renormalise, so missing data
never reads as a bad score. The raw figures are scored: the games-blended
variant only ever ran on Rapid Royale (see above) and is gone.

**Kills per minute, not per match.** Every other rate in the rating is per unit
of time, and a Gauntlet match has no fixed length, so per-match quietly
rewarded whoever survived into long rounds — which win rate already measures.

**The badge set is deliberately not the rated set** (`STANDOUT_TRAITS` vs
`RATING_WEIGHTS`). `killsPerMatch` still earns a badge although it no longer
scores: both are columns on the board, and "most kills in a round" is what
people recognise in each other. Don't "fix" the divergence. Badges are
Gauntlet-only now; the 🏅 total-wins badge (2026-11-06) left with the Rapid
Royale rating on 2026-11-09.

When the user writes weights out (e.g. "kd 12%, kpm 12%"), they are naming
**board column headers**, not field names. `kpm` is the KPM column (kills per
*minute*); `killsPerMatch` is the K/match column. The two are different fields
sitting side by side in `Metrics` — confirm before swapping one for the other.

---

## Hard-won API facts

- **Only the mode-suffixed counters are safe.** Both `kills_gm_gntgauntlet` and
  `Kills_Total` appear inside a Gauntlet slice and agree in recent seasons,
  which makes the unsuffixed names look safe. They are not: a Season 2 slice
  carries `kills_gm_gntgauntlet` = 71 alongside `Kills_Total` = 10550. Using
  the unsuffixed field put a K/D of 319 on the board for a player with 3 matches.
- **Score follows the same rule** (verified 2026-09-15). Use
  `scorein_gm_gntgauntlet`; never `score_total`, `scorein_gm_all` or
  `scorein_gm_granite`. The suffixed field appears only in Gauntlet slices, and
  one player's Seasons 1–4 sum to exactly the lifetime figure of 11,371,030.
  The rollups fail that check — a GraniteSquad Season 4 slice carries
  `scorein_gm_all` = 913,285 against a true `score_total` of 135,440.
- **Per-mode counters didn't exist before Season 3.** Seasons 1–2 carry kills
  but no matches/deaths/time/score, so no rate stat is computable. Those slices
  are omitted — without the rule the board showed "8,299 kills in 0 matches".
  This is why `spm` is `null` rather than `0` when the counter is absent: a
  fabricated zero would sit that player at the bottom of the SPM percentile,
  where a null is simply dropped.
- **EA exposes Steam and Xbox personas, never PlayStation.**
  `/bf6/player/?nucleus_id=` lists one persona per linked platform, and not one
  `ps*` entry comes back — including from members who say PlayStation in their
  intros. A platform tag therefore labelled every PlayStation player "EA", so it
  was removed. The data is still cached as `inGamePlatform` on each roster entry.
- **Gauntlet is `GraniteGauntlet0`.** Season 4's "Gauntlet: Fighter Sweep"
  (jets-only, ended 2026-09-15) shares the same bucket and cannot be separated
  at match granularity — hence the ✈ badge rather than silent filtering.
- **Bulk responses come back out of request order.** Match players by
  `personaId`, never by index. A test fails under index-matching.
- **Vehicle fields nest** — `tp_veh_air_jets` already contains its per-airframe
  children. Summing double-counts (would turn 14.8% jet share into 27.2%).
- **A member who goes private still returns a valid `player` block with no
  `catFields`.** "A response came back" is not proof of readable data.
- **The `platform` field is inert** — every value returns identical data.
- **Resolution is flaky**, not permanent. Members who 404 one day resolve the
  next once DICE indexes them. Cached ids mean a member resolves only once.
- **The persona-name endpoint answers 200 with `{"results": []}` when
  throttled.** Empty means "ask again later", never "no personas" — never
  overwrite a name you already have with an empty answer. A typical run leaves
  ~60 lookups unanswered; that is normal, not a failure.

---

## Decisions worth not re-litigating

| Decision | Why |
|---|---|
| **Rapid Royale ranks on a points ledger, not rates** (2026-11-09) | "Tracking traditional stats in a hectic mode … only discourages people and gives people too much stress." Every match can bank points; the only way down is finishing out of the medals or dying more than you kill |
| **Loss −5**, after −3 and −6 were tried (2026-11-09) | The user asked how many land at or below zero and settled here: 5 of 68 Trio ranked negative, 1 of 11 Solo |
| **Zero or below is Provisional**, whatever the match count (2026-11-09) | "All 0 and negative players can go back to provisional." The number still shows; the rank does not |
| **No damage points**; KPM, DPM, revives reference only (2026-11-09) | The user's per-event list was kill, assist, death. "KPM/DPM/revives are just reference metrics that don't directly affect rating" |
| **Medal-table styling** on Rapid Royale (2026-11-09) | "Imitate Olympic country leaderboard style" — medals first, total bold, everything else quiet |
| Gauntlet: rank on a **weighted rating**, not raw Win % | Winning alone doesn't say whether you carried your squad or were carried by it (archived) |
| Gauntlet: **percentile scoring**, not a points formula | Incomparable units; any coefficient making them comparable would be invented and need retuning as the field changed (archived) |
| ~~Blend rates toward the field mean by games played~~ (2026-10-31 → 2026-11-09) | Superseded: a ledger has no rates to blend. "No more mixing 30 games with average logic" |
| **30-match floor**, Provisional shown not hidden | Stops a short fluke topping the board; hiding people hurts morale. `MIN_MATCHES` in `lib/ranking.ts`. On Rapid Royale a rank also needs a positive total |
| Badges are **top 10%**, not an absolute floor | Absolute floors decay into noise — a 65%-automatic-kills floor sounded selective and covered nearly the whole board. A tenth of the field stays a tenth whatever the meta does |
| ✈ badge instead of excluding jet players | The two Gauntlet variants can't be separated; be honest rather than fabricate a split |
| **No filters at all** (2026-09-13) | Region / platform / main-mode chips were removed at the user's request — the board is Gauntlet-only, so slicing by community metadata added confusion rather than signal. `region`, `platform` and `mainMode` are still parsed into `roster.json` and carried on each row, so re-adding a filter later is cheap |
| **Solo's medal rungs are wider than Trio's** (top 5 / top 10 vs top 3 / top 5) | Carried over from the 2026-11-03 ladder: a Solo lobby is big enough that top ten ran 52–76%, where Trio's sat near 100% |
| ~~Total wins at 5%~~, ~~Solo win figures 30 vs kill 40~~ (2026-11-06/07 → 2026-11-09) | Superseded by the ledger, which keeps their intent: a win is the biggest single credit (+15) and playing can bank points every match |
| `getRowId` = `eaId`, not a composite | `eaId` is the roster key; a duplicate should throw loudly, not be papered over |
| GitHub Actions, not Vercel Cron | Committing each run gives free **git snapshot history**, which makes a rolling-form board possible later with no redesign. Vercel Hobby caps cron at daily anyway |
| Retry only 5xx + transport errors | 422 is what this API returns for a malformed bulk body — masking it behind retries turns an instant diagnosable failure into a slow confusing one |
| No `Co-Authored-By` on the early commits | Those SHAs were a session's compaction-recovery map; rewriting 28 commits would have invalidated all of them. Never a rule against trailers on *new* commits |

---

## Architecture

- **`lib/` is framework-free** — no Next.js, no `node:fs` — so it unit-tests
  without a harness. `lib/data.ts` is the one deliberate exception: it reads
  the committed board from GitHub with Next's `fetch` cache options on the
  request, and statically imports the generated JSON as the fallback snapshot.
- **`buildBoard` is pure.** Network and filesystem live only in `scripts/build.ts`.
- **`rankPlayers` dispatches on mode** (`lib/ranking.ts`): Rapid Royale rows
  go through `scoreLedger` and the positive-total rule; Gauntlet rows through
  `rateAll` percentiles. The join route and the build share it.
- **Seasons are discovered, never hardcoded.** `fetchCurrentSeason` reads the
  active `Season\d+` from the live `/bf6/gameevents/` feed, and `lib/pipeline.ts`
  unions it into the season list. When EA flips to Season 5 the next daily build
  adds a Season 5 tab labelled "(current)" with no code change — empty until
  someone plays.
- **The build is idempotent.** It compares everything except `meta.builtAt` and
  leaves `data/` untouched when nothing changed, so a quiet day produces no commit
  and no redeploy. Season keys sort naturally (`Season2` before `Season10`)
  because `JSON.stringify` comparison is key-order sensitive.
- **Self-serve signup writes by committing.** `/join` → `POST /api/join` →
  `lib/join.ts`. The route resolves the EA ID, fetches that one player's stats,
  merges the row into `data/board.json`, re-ranks every season through the same
  `rankPlayers` the build uses, and commits roster + board + season files as
  **one** commit via `lib/github.ts`. The site re-reads the board within a
  minute of the push (no deploy — the build is skipped for data commits), so
  the player is live in about a minute. Git is the store; a bad signup is a revert.
- **The join route re-reads from GitHub, never from its own bundle.**
  `lib/data.ts` holds a build-time snapshot; two signups a minute apart would
  both write on top of it and the second would erase the first. It also means a
  signup can race the daily build — hence `RefMovedError`, three attempts, and
  `force: false` on the ref update. **Never force-push that ref.**
- **`vitest.setup.ts` polyfills are load-bearing.** MUI X DataGrid virtualises
  rows; jsdom reports every element as 0×0 and has no `ResizeObserver` or
  `matchMedia`. Remove them and every table test fails to find elements.
- **Phones render every column and scroll the grid sideways, with rank and
  Player frozen at the left** (`PINNED_LEFT` in `components/LeaderboardTable.tsx`,
  2026-10-31, at the user's request). The earlier tiers dropped columns with
  `columnVisibilityModel` instead — never with CSS `display:none`, which
  leaves the column's track and scroll space behind in DataGrid's virtual
  scroller — but a phone was then left with only rating and win rate. The
  pinned cells are `position: sticky` with an opaque fill, and
  `disableVirtualization` keeps them mounted once the reader has scrolled past
  where DataGrid would drop them (a page is at most 100 rows). jsdom lays out
  nothing, so the tests check the pinned classes, not geometry.

---

## Known loose ends

- Phone width at 400px was checked in headless Chrome (Playwright, 2026-10-31:
  no page-level horizontal overflow, rank and Player held still while the grid
  scrolled 500px) but never on a physical phone.
- `IHerkyI` has 303 Gauntlet matches (ranked #59, rating 13.02), which sits oddly
  against their "low xp but decent at BR" self-description. The EA ID resolves to
  an account whose name matches exactly, so it's probably just modesty.
- Three members don't resolve: `Vanzz_GG` and `Heelix` (`not_found` — privacy off
  or a bad EA ID), `kathemkh9` (`no_data` — resolved before, nothing came back).
  Resolution is flaky rather than permanent, so these may clear on their own.
- No unit test for `validateRoster` in `scripts/build.ts` (small, pure, verified
  by inspection).
- `lib/data.ts` uses `as unknown as BoardFile`, bypassing structural checks on
  the generated JSON.
- Per-season `data/season*.json` files are written for git-diff readability but
  read by nothing.
- `refresh.yml` uses a bare `git push` with no retry; a concurrent signup push
  loses that run, and the next is two hours away.
- `REVALIDATE_SECRET` is not set anywhere yet (2026-11-07), so the workflow's
  revalidate step skips and the board shows a refresh up to a minute after
  the push. Setting it on Vercel and as a repo Actions secret makes it immediate.
- Whether Vercel's clone holds `VERCEL_GIT_PREVIOUS_SHA` for the ignore
  command is unverified: if it does not, every data commit still builds
  (safe, but the point of the change is lost). Check that the first bot
  commit after this lands shows as Canceled in the Vercel deployments list.
- A member skipped (`fetch_failed`) in the last build before a season rolls
  over is missing from that season's archive, since the archive is that
  build's output and is never recomputed.
- `/api/leaderboard` serves `rating` as the points total on Rapid Royale rows
  since 2026-11-09 (0–100 on Gauntlet rows). No consumer of the route is
  known; if one appears, give it a `points` field rather than changing
  `rating` back.
- Medal tints were checked in headless Chrome at 1680px on 2026-11-09, not
  on a phone.
