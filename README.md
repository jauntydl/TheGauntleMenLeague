# The GauntleMen League

A Battlefield 6 **Gauntlet** leaderboard for our community, ranked by season on
skill-based rate stats.

## How it works

A GitHub Action runs daily, fetches Gauntlet stats for everyone in
`roster.json` from [gametools.network](https://api.gametools.network), and
commits the result to `data/`. That push triggers a Vercel redeploy, and the
Next.js app serves the committed JSON. There is no database and no API call at
page-load time.

## Ranking

Ranked on an overall **rating** out of 100: win rate 35%, objective points per
hour 15%, K/D 12%, kills per minute 12%, score per minute 12%, revives per hour
10%, damage per minute 4%. The objective formula is Kricked's, from the
community spreadsheet.
Each part scores you by where you sit among everyone else ranked that season,
so the rating needs no invented coefficients — and it moves when other people
play. You need at least **30 matches** in a season to be ranked; below that you
appear under *Provisional*. Full explanation at `/rating`.

A ✈ badge means 10%+ of that player's Gauntlet time was flown in jets. Season 4's
"Gauntlet: Fighter Sweep" event shares a stats bucket with normal Gauntlet, so
the badge flags it rather than hiding it.

## Not showing up?

Set your in-game stats privacy to **Everyone**. See `/not-listed`.

## Adding a member

Edit `roster.json` and commit:

```json
{
  "eaId": "theirEaId",
  "displayName": "Their name",
  "platform": "pc",
  "region": "NA West",
  "mainMode": "gauntlet"
}
```

The next daily run resolves their ids and caches them back into the file. To
seed from a Discord dump instead: `npm run roster:parse -- intros.txt`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally |
| `npm test` | Run the test suite |
| `npm run build` | Production build |
| `npm run data` | Refresh `data/` from the API |
| `npm run data:dry` | Same, but write nothing |

## A note on the data source

gametools.network is a free, community-run, reverse-engineered API. It is not
affiliated with EA, and EA publishes no public Battlefield stats API. Be a
polite consumer: keep the refresh to once a day. Consider
[sponsoring them](https://github.com/sponsors/community-network).
