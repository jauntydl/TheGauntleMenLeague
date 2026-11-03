/**
 * The owner's manual refresh: a hidden button on the board that starts the
 * same refresh workflow the schedule runs, for when two hours (and GitHub's
 * habit of running the schedule late or not at all) is too long to wait.
 *
 * The button is hidden, but hiding is not what protects it: the password is,
 * checked here on the server against REFRESH_PASSWORD, and the cooldown below
 * caps what even someone who has the password can do to the free stats API.
 */

import type { WorkflowRun } from './github';

/** The workflow file a manual refresh starts. */
export const REFRESH_WORKFLOW = 'refresh.yml';

/**
 * No manual refresh within this long of the last run's start, of any trigger.
 *
 * A run takes about four minutes and Vercel about one more to redeploy, so
 * this mostly stops a second tap starting a duplicate while the first is still
 * going — and keeps a leaked password from hammering gametools.
 */
export const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Attempts per caller per hour, right or wrong. Slows guessing; a typo or two
 * costs nothing. (Here, not in the route: Next.js rejects extra route exports.)
 */
export const REFRESH_ATTEMPTS = 10;

/**
 * Compare a guess to the password in time independent of where they differ,
 * so response timing says nothing about how close a guess was.
 */
export function passwordMatches(given: unknown, expected: string | undefined): boolean {
  // An unset password disables the feature; it must never match an empty guess.
  if (!expected || typeof given !== 'string') return false;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ (given.charCodeAt(i % Math.max(given.length, 1)) || 0);
  }
  return diff === 0;
}

export type RefreshDecision =
  | { ok: true }
  | { ok: false; reason: 'running' | 'cooldown'; retryAfterSec: number };

/**
 * Whether a manual refresh may start now, given the workflow's newest run.
 *
 * A run still queued or in progress always blocks, however old: GitHub can
 * hold a scheduled run in the queue for hours, and a second one queued behind
 * it would only fetch the same stats twice.
 */
export function decideRefresh(
  last: WorkflowRun | null,
  now: number,
  cooldownMs: number = REFRESH_COOLDOWN_MS,
): RefreshDecision {
  if (!last) return { ok: true };
  const started = Date.parse(last.createdAt);
  const waitMs = Number.isNaN(started) ? 0 : started + cooldownMs - now;

  if (last.status !== 'completed') {
    return { ok: false, reason: 'running', retryAfterSec: Math.max(60, Math.ceil(waitMs / 1000)) };
  }
  if (waitMs > 0) return { ok: false, reason: 'cooldown', retryAfterSec: Math.ceil(waitMs / 1000) };
  return { ok: true };
}
