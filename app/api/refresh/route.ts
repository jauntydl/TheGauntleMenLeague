import { dispatchWorkflow, latestWorkflowRun, readConfig } from '@/lib/github';
import { clientKey, take, WINDOW_MS } from '@/lib/ratelimit';
import { decideRefresh, passwordMatches, REFRESH_ATTEMPTS, REFRESH_WORKFLOW } from '@/lib/refresh';

/**
 * The owner's manual refresh. Checks the password, then starts the refresh
 * workflow unless one ran in the last REFRESH_COOLDOWN_MS. See lib/refresh.
 */

export const runtime = 'nodejs';

const fail = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ ok: false, message }, { status, headers });

export async function POST(req: Request): Promise<Response> {
  // Counted before the password is read, so a wrong guess costs an attempt.
  const limit = take(`refresh:${clientKey(req)}`, Date.now(), REFRESH_ATTEMPTS, WINDOW_MS);
  if (!limit.allowed) {
    return fail(429, 'Too many tries. Wait a while.', { 'retry-after': String(limit.retryAfterSec) });
  }

  let password: unknown;
  try {
    password = ((await req.json()) as { password?: unknown } | null)?.password;
  } catch {
    return fail(400, 'Expected a JSON body.');
  }

  const expected = process.env.REFRESH_PASSWORD;
  if (!expected) console.warn('refresh: REFRESH_PASSWORD is not set, so every attempt is refused');
  // Unset answers exactly like a wrong guess: nothing to tell an outsider.
  if (!passwordMatches(password, expected)) return fail(401, 'Wrong password.');

  // From here on the caller is the owner, so errors can name what to fix.
  const cfg = readConfig();
  if (!cfg) return fail(503, 'GITHUB_TOKEN / GITHUB_REPO are not set on this deployment.');

  try {
    const decision = decideRefresh(await latestWorkflowRun(cfg, REFRESH_WORKFLOW), Date.now());
    if (!decision.ok) {
      const mins = Math.ceil(decision.retryAfterSec / 60);
      const message =
        decision.reason === 'running'
          ? 'A refresh is already running. The board updates when it finishes.'
          : `A refresh started less than 15 minutes ago. Try again in ${mins} min.`;
      return fail(429, message, { 'retry-after': String(decision.retryAfterSec) });
    }

    await dispatchWorkflow(cfg, REFRESH_WORKFLOW);
    return Response.json({ ok: true, message: 'Refresh started. The board updates in about 5 minutes.' });
  } catch (e) {
    console.error('refresh failed', e);
    const forbidden = e instanceof Error && / 403 /.test(e.message);
    return fail(
      502,
      forbidden
        ? 'GitHub refused: the token needs Actions: Read and write on this repo.'
        : 'Could not reach GitHub. Try again shortly.',
    );
  }
}
