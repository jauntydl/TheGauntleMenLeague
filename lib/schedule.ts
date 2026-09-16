/**
 * When the board refreshes its stats.
 *
 * The daily workflow runs at 09:23 UTC (.github/workflows/daily.yml). This
 * module is the single place that knows it, so the page and the cron cannot
 * quietly disagree about when the next refresh lands.
 *
 * This is the time the job is *scheduled*, which is not the time it runs.
 * GitHub schedules are best-effort: observed starts have been hours late and
 * one day was skipped entirely. The page says "after" for that reason — see
 * nextRefreshAfter.
 */

/** Must match the cron in .github/workflows/daily.yml. */
export const REFRESH_HOUR_UTC = 9;
export const REFRESH_MINUTE_UTC = 23;

/**
 * The first scheduled refresh strictly after `after`.
 *
 * Derived from the last build rather than from the current time so the page
 * renders identically on the server and in the browser — a value computed
 * from `now` differs between the two and tears the markup on hydration.
 */
export function nextRefreshAfter(after: Date): Date {
  const next = new Date(after);
  next.setUTCHours(REFRESH_HOUR_UTC, REFRESH_MINUTE_UTC, 0, 0);
  if (next <= after) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/**
 * A timestamp as the community reads it: US Eastern, naming the zone so
 * "5:00" is never ambiguous, and switching EST/EDT on its own.
 *
 * The time zone is pinned rather than left to the viewer's locale for the
 * same hydration reason — and because a shared schedule people plan around
 * should read the same to everyone looking at it.
 */
export function formatEastern(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
    .format(d)
    .replace(',', '');
}
