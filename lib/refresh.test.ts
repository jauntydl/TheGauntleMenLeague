import { describe, it, expect } from 'vitest';
import { decideRefresh, passwordMatches, REFRESH_COOLDOWN_MS } from './refresh';

describe('passwordMatches', () => {
  it('accepts only the exact password', () => {
    expect(passwordMatches('open-sesame', 'open-sesame')).toBe(true);
    expect(passwordMatches('open-sesam', 'open-sesame')).toBe(false);
    expect(passwordMatches('open-sesamee', 'open-sesame')).toBe(false);
    expect(passwordMatches('Open-sesame', 'open-sesame')).toBe(false);
  });

  it('never matches when no password is configured, not even an empty guess', () => {
    // An unset REFRESH_PASSWORD must switch the feature off, not open it up.
    expect(passwordMatches('', undefined)).toBe(false);
    expect(passwordMatches('', '')).toBe(false);
    expect(passwordMatches('anything', undefined)).toBe(false);
  });

  it('rejects anything that is not a string', () => {
    expect(passwordMatches(undefined, 'pw')).toBe(false);
    expect(passwordMatches(1234, '1234')).toBe(false);
    expect(passwordMatches('', 'pw')).toBe(false);
  });
});

describe('decideRefresh', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('allows a refresh when the workflow has never run', () => {
    expect(decideRefresh(null, now)).toEqual({ ok: true });
  });

  it('allows a refresh once the cooldown has passed', () => {
    expect(decideRefresh({ createdAt: ago(REFRESH_COOLDOWN_MS + 1000), status: 'completed' }, now)).toEqual({
      ok: true,
    });
  });

  it('refuses inside the cooldown and says how long to wait', () => {
    const d = decideRefresh({ createdAt: ago(5 * 60 * 1000), status: 'completed' }, now);
    expect(d).toEqual({ ok: false, reason: 'cooldown', retryAfterSec: 10 * 60 });
  });

  it('refuses while a run is queued or going, however old it is', () => {
    // GitHub can sit on a scheduled run for hours; a second behind it would
    // only fetch the same stats twice.
    for (const status of ['queued', 'in_progress', 'waiting']) {
      const d = decideRefresh({ createdAt: ago(3 * 60 * 60 * 1000), status }, now);
      expect(d).toMatchObject({ ok: false, reason: 'running' });
    }
  });
});
