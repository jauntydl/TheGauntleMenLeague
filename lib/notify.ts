import type { JoinResult } from './join';
import { fmtPoints } from './format';

/**
 * Tell the owner when somebody joins.
 *
 * A signup is the one thing on this board that happens without the owner
 * doing anything, so it is the one thing worth a ping: one line to a
 * Discord channel of their choosing, through an incoming webhook whose URL
 * lives in the JOIN_WEBHOOK_URL env var on Vercel (2026-11-09, the owner's
 * pick over a phone push and a GitHub issue per signup). The post is
 * best-effort — a webhook that is down or misconfigured is logged and
 * otherwise ignored, because the player is already on the board by the time
 * it is sent and nothing about their signup should depend on Discord.
 */

/** How long a webhook post may hold a signup response open. Discord answers in well under a second. */
export const NOTIFY_TIMEOUT_MS = 3000;

/** "Season5 Trio" → "Season 5 Trio", as the board's tabs read. */
const seasonLabel = (key: string): string => key.replace(/^(\D+?)(\d+)/, '$1 $2');

/**
 * The line posted for one signup: who, their EA ID where it differs from
 * the name shown, where they landed, and the board.
 */
export function joinMessage(result: Extract<JoinResult, { ok: true }>, siteUrl: string): string {
  const who = `**${result.displayName}**`;
  const id = result.displayName === result.eaId ? null : `EA ID ${result.eaId}`;
  const season = seasonLabel(result.season);
  const matches = `${result.matches} matches`;
  const points = result.rating === null ? null : `${fmtPoints(result.rating)} points`;
  const where = result.provisional
    ? `${season}, Provisional (${[matches, points].filter(Boolean).join(', ')})`
    : `${season} #${result.rank}, ${points} over ${matches}`;
  return `🆕 ${who} joined the board — ${[id, where].filter(Boolean).join(' · ')} · ${siteUrl}`;
}

/**
 * Post `content` to a Discord incoming webhook. Resolves true when Discord
 * accepted it, false when there is no webhook, it refused, or it did not
 * answer in NOTIFY_TIMEOUT_MS. Never throws.
 */
export async function notifyJoin(
  webhookUrl: string | undefined,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`join notification refused: ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('join notification failed', e instanceof Error ? e.message : e);
    return false;
  }
}
