import { processJoin, type JoinFailure } from '@/lib/join';
import { joinMessage, notifyJoin } from '@/lib/notify';
import { commitFiles, readConfig, readFile, RefMovedError } from '@/lib/github';
import { fetchBulk, fetchCurrentSeason, fetchPersonas, resolvePlayer } from '@/lib/gametools';
import { clientKey, take } from '@/lib/ratelimit';

/**
 * Self-serve signup. Everything it decides lives in lib/join; this handler is
 * the adapter that supplies the network, the commit and the HTTP status.
 */

/** Node, not edge: the commit path uses Buffer to decode GitHub's base64. */
export const runtime = 'nodejs';

const STATUS: Record<JoinFailure, number> = {
  invalid: 400,
  duplicate: 409,
  not_found: 404,
  no_data: 422,
  unconfigured: 503,
  busy: 503,
  error: 500,
};

export async function POST(req: Request): Promise<Response> {
  const cfg = readConfig();
  if (!cfg) {
    // Name which variable is missing. The names are public — they are in
    // .env.example — and without them "not configured" gives whoever set the
    // deployment up nothing to act on but a list of three things to re-check.
    const missing = (['GITHUB_REPO', 'GITHUB_TOKEN'] as const).filter((n) => !process.env[n]);
    return Response.json(
      {
        ok: false,
        reason: 'unconfigured',
        message: `Signups are not configured on this deployment (missing: ${missing.join(', ') || 'nothing — check the values are not empty'}).`,
      },
      { status: 503 },
    );
  }

  const limit = take(clientKey(req));
  if (!limit.allowed) {
    return Response.json(
      {
        ok: false,
        reason: 'error',
        message: 'That is a lot of signups from one place. Try again later.',
      },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: 'invalid', message: 'Expected a JSON body.' }, { status: 400 });
  }

  const eaId = (body as { eaId?: unknown } | null)?.eaId;

  try {
    const result = await processJoin(
      eaId,
      {
        readFile: (path) => readFile(cfg, path),
        commitFiles: (files, message) => commitFiles(cfg, files, message),
        resolvePlayer: async (id) => {
          const ids = await resolvePlayer(id);
          return ids ? { personaId: ids.personaId, nucleusId: ids.nucleusId } : null;
        },
        fetchBulk: (players) => fetchBulk(players),
        fetchPersonas: (nucleusId) => fetchPersonas(nucleusId),
        currentSeason: () => fetchCurrentSeason(),
      },
      (e) => e instanceof RefMovedError,
    );

    // Tell the owner. Awaited, because a serverless function may be frozen
    // the moment the response goes out; bounded, so Discord can never hold
    // a signup open; best-effort, so it can never fail one.
    if (result.ok) {
      await notifyJoin(process.env.JOIN_WEBHOOK_URL, joinMessage(result, new URL(req.url).origin));
    }

    return Response.json(result, { status: result.ok ? 200 : STATUS[result.reason] });
  } catch (e) {
    // The upstream API and GitHub both fail from time to time, and neither
    // failure is the visitor's fault. Say so without leaking the internals.
    console.error('join failed', e);
    return Response.json(
      { ok: false, reason: 'error', message: 'Something went wrong adding you. Try again shortly.' },
      { status: 500 },
    );
  }
}
