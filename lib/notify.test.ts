// lib/notify.test.ts
import { describe, it, expect, vi } from 'vitest';
import { joinMessage, notifyJoin } from './notify';
import type { JoinResult } from './join';

type Joined = Extract<JoinResult, { ok: true }>;
const joined = (over: Partial<Joined>): Joined => ({
  ok: true,
  eaId: 'Bourn3A',
  displayName: 'Bourn3',
  season: 'Season5 Trio',
  rank: 18,
  rating: 3858.5,
  matches: 287,
  provisional: false,
  ledger: true,
  ...over,
});

const SITE = 'https://the-gauntle-men-league.vercel.app';

describe('joinMessage', () => {
  it('names the player, their EA ID, and where they landed on a points board', () => {
    expect(joinMessage(joined({}), SITE)).toBe(
      '🆕 **Bourn3** joined the board — EA ID Bourn3A · Season 5 Trio #18, 3,859 points over 287 matches · ' + SITE,
    );
  });

  it("says Provisional, with the matches and points, when there is no rank yet", () => {
    expect(joinMessage(joined({ rank: null, rating: -40, matches: 12, provisional: true }), SITE)).toBe(
      '🆕 **Bourn3** joined the board — EA ID Bourn3A · Season 5 Trio, Provisional (12 matches, −40 points) · ' + SITE,
    );
  });

  it('leaves the points out when the board has none to show', () => {
    // A Gauntlet provisional, or a ledger whose rungs failed the trust test.
    expect(joinMessage(joined({ rank: null, rating: null, matches: 4, provisional: true, ledger: false, season: 'Season4' }), SITE)).toBe(
      '🆕 **Bourn3** joined the board — EA ID Bourn3A · Season 4, Provisional (4 matches) · ' + SITE,
    );
  });

  it('does not repeat the EA ID when it is the name shown', () => {
    expect(joinMessage(joined({ displayName: 'Bourn3A' }), SITE)).toBe(
      '🆕 **Bourn3A** joined the board — Season 5 Trio #18, 3,859 points over 287 matches · ' + SITE,
    );
  });
});

describe('notifyJoin', () => {
  // Discord answers 204 with no body; a 204 Response may not carry one.
  const ok = () => vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

  it('posts the message as Discord content to the webhook', async () => {
    const fetchImpl = ok();
    expect(await notifyJoin('https://discord.com/api/webhooks/1/abc', 'hello', fetchImpl)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/1/abc');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ content: 'hello' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('does nothing when no webhook is configured', async () => {
    const fetchImpl = ok();
    expect(await notifyJoin(undefined, 'hello', fetchImpl)).toBe(false);
    expect(await notifyJoin('', 'hello', fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a refused post and never throws', async () => {
    const refused = vi.fn().mockResolvedValue(new Response('no', { status: 401 }));
    expect(await notifyJoin('https://discord.com/api/webhooks/1/abc', 'hello', refused)).toBe(false);
    const down = vi.fn().mockRejectedValue(new Error('socket hang up'));
    expect(await notifyJoin('https://discord.com/api/webhooks/1/abc', 'hello', down)).toBe(false);
  });
});
