# The GauntleMen League

A Battlefield 6 **Gauntlet** leaderboard for a ~300 person community, ranked by
season on skill-based rate stats.

```
GitHub Action (daily cron, 09:00 UTC)
  → scripts/build.ts: resolve ids → bulk calls → extract → compute → rank
  → commits data/*.json
  → push triggers Vercel redeploy
  → Next.js App Router + MUI renders from the committed JSON
```

No database. No runtime writes. **No upstream API call at request time** — the
data is committed, so a page load can never hit the free community API.

- Live: <https://the-gauntle-men-league.vercel.app>
- Repo: `github.com/jauntydl/TheGauntleMenLeague` (public)
- `origin` = `git@github.com-P:jauntydl/TheGauntleMenLeague.git` — the
  `github.com-P` host alias uses the **personal** SSH key (`~/.ssh/id_personal`).
  The default `github.com` host maps to a *work* key, so a plain
  `git@github.com:` URL pushes as the wrong identity.
- Design spec: `docs/superpowers/specs/2026-09-12-gauntlet-leaderboard-design.md`

Current state (2026-09-15): 115 roster members · Season 4 has 61 ranked, 16
provisional, 3 unresolved · 240 tests passing · `tsc --noEmit` clean · deployed.

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

## ⚠️ Changing a rated metric? Rebuild the data in the same change

`rateAll` runs in **the build, not the renderer** — `rating` and `standouts` are
computed once and committed. A weight change has no effect on the live board
until `npm run data` runs.

Worse, adding a *new* metric without rebuilding takes the page down.
`lib/data.ts` casts the committed JSON with `as unknown as BoardFile`, so
TypeScript cannot see the field is missing; at runtime the new column reads
`undefined`, and `fmtNum` (`components/LeaderboardTable.tsx:20`) only guards
`null`, so `undefined.toFixed()` throws. Ship code and regenerated data in the
same push.

## Be a polite API consumer

gametools.network is free, donation-funded, unofficial, and the only option —
EA publishes no public Battlefield stats API, and tracker.gg forbids scraping
with a legal warning. **Daily cadence only.** `npm run data` makes live calls
across the whole roster; don't run it casually, and don't add a second cron.
Consider [sponsoring them](https://github.com/sponsors/community-network).

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally |
| `npm test` | 240 tests |
| `npm run build` | Production build |
| `npm run data` | Refresh `data/` from the API — **makes live network calls** |
| `npm run data:dry` | Same, writes nothing |
| `npm run roster:parse -- intros.txt` | One-off roster seeding (done; refuses to overwrite) |

---

## The rating

Weights live in `RATING_WEIGHTS` (`lib/rating.ts`). The `/rating` page reads
them from there rather than repeating the numbers in prose, so the page cannot
quietly disagree with the code. Set 2026-09-15.

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

Scoring is **percentile against the season's ranked field**, not a points
formula — the units aren't comparable (a 3.0 K/D and 420 DPM), and any
coefficient making them comparable would be invented and need retuning as the
field changed. Consequence worth knowing: *a rating moves when other people
play.* A metric that is `null` for a player is dropped and the remaining
weights renormalise, so missing data never reads as a bad score.

**Kills per minute, not per match.** Every other rate in the rating is per unit
of time, and a Gauntlet match has no fixed length, so per-match quietly
rewarded whoever survived into long rounds — which win rate already measures.

**The badge set is deliberately not the rated set** (`STANDOUT_TRAITS` vs
`RATING_WEIGHTS`). `killsPerMatch` still earns a badge although it no longer
scores: both are columns on the board, and "most kills in a round" is what
people recognise in each other. Don't "fix" the divergence.

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
| Rank on a **weighted rating**, not raw Win % | Winning alone doesn't say whether you carried your squad or were carried by it. Win rate still dominates at 50% |
| **Percentile scoring**, not a points formula | Incomparable units; any coefficient making them comparable would be invented and need retuning as the field changed |
| **30-match floor**, Provisional shown not hidden | Stops a short fluke topping the board; hiding people hurts morale. `MIN_MATCHES` in `lib/ranking.ts`. (An earlier draft used 10 — stray comments may still say so; the value is 30) |
| Badges are **top 10%**, not an absolute floor | Absolute floors decay into noise — a 65%-automatic-kills floor sounded selective and covered nearly the whole board. A tenth of the field stays a tenth whatever the meta does |
| ✈ badge instead of excluding jet players | The two Gauntlet variants can't be separated; be honest rather than fabricate a split |
| **No filters at all** (2026-09-13) | Region / platform / main-mode chips were removed at the user's request — the board is Gauntlet-only, so slicing by community metadata added confusion rather than signal. `region`, `platform` and `mainMode` are still parsed into `roster.json` and carried on each row, so re-adding a filter later is cheap |
| `getRowId` = `eaId`, not a composite | `eaId` is the roster key; a duplicate should throw loudly, not be papered over |
| GitHub Actions, not Vercel Cron | Committing each run gives free **git snapshot history**, which makes a rolling-form board possible later with no redesign. Vercel Hobby caps cron at daily anyway |
| Retry only 5xx + transport errors | 422 is what this API returns for a malformed bulk body — masking it behind retries turns an instant diagnosable failure into a slow confusing one |
| No `Co-Authored-By` on the early commits | Those SHAs were a session's compaction-recovery map; rewriting 28 commits would have invalidated all of them. Never a rule against trailers on *new* commits |

---

## Architecture

- **`lib/` is framework-free** — no Next.js, no `node:fs` — so it unit-tests
  without a harness. `lib/data.ts` is the one deliberate exception: it statically
  imports the generated JSON, which is what bundles the data for deployment.
- **`buildBoard` is pure.** Network and filesystem live only in `scripts/build.ts`.
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
  **one** commit via `lib/github.ts`. Vercel redeploys on the push, so the player
  is live in about a minute. Git is the store; a bad signup is a revert.
- **The join route re-reads from GitHub, never from its own bundle.**
  `lib/data.ts` holds a build-time snapshot; two signups a minute apart would
  both write on top of it and the second would erase the first. It also means a
  signup can race the daily build — hence `RefMovedError`, three attempts, and
  `force: false` on the ref update. **Never force-push that ref.**
- **`vitest.setup.ts` polyfills are load-bearing.** MUI X DataGrid virtualises
  rows; jsdom reports every element as 0×0 and has no `ResizeObserver` or
  `matchMedia`. Remove them and every table test fails to find elements.
- **Narrow viewports use `columnVisibilityModel`, not CSS.** DataGrid sizes its
  virtual scroller from the columns array, so `display:none` leaves the column's
  track and horizontal scroll space behind. That was a real bug. jsdom lays out
  no scrollbars, so no test here can prove 400px is scroll-free — that needs a
  real phone.

---

## Known loose ends

- `fmtNum` guards `null` but not `undefined` — see the rebuild warning above. A
  one-character fix (`v == null`) would make the trap unreachable.
- Phone width at 400px has never been checked on a real device.
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
- `daily.yml` uses a bare `git push` with no retry; a concurrent push loses that
  day's refresh (rerun manually from the Actions tab).
