import { revalidateTag } from 'next/cache';
import { BOARD_CACHE_TAG } from '@/lib/data';
import { clientKey, take, WINDOW_MS } from '@/lib/ratelimit';
import { passwordMatches, REFRESH_ATTEMPTS } from '@/lib/refresh';

/**
 * Purge the site's cached read of the board.
 *
 * The refresh workflow calls this right after it pushes a new board, so the
 * site re-reads it at once instead of at the next minute (see lib/data).
 * The secret is REVALIDATE_SECRET, set on Vercel and as a repo secret of the
 * same name for the workflow; with either missing the workflow skips the
 * call and the minute's cache does the job. Guesses are rate-limited per
 * caller like the manual refresh, and an unset secret refuses everyone.
 */

export const runtime = 'nodejs';

const fail = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ ok: false, message }, { status, headers });

export async function POST(req: Request): Promise<Response> {
  const limit = take(`revalidate:${clientKey(req)}`, Date.now(), REFRESH_ATTEMPTS, WINDOW_MS);
  if (!limit.allowed) {
    return fail(429, 'Too many tries. Wait a while.', { 'retry-after': String(limit.retryAfterSec) });
  }

  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) console.warn('revalidate: REVALIDATE_SECRET is not set, so every call is refused');
  if (!passwordMatches(given, expected)) return fail(401, 'Wrong secret.');

  revalidateTag(BOARD_CACHE_TAG);
  return Response.json({ ok: true, message: 'Board cache purged; the next page load re-reads it.' });
}
