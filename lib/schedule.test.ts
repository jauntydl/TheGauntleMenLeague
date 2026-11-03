import { describe, it, expect } from 'vitest';
import { formatEastern, nextRefreshAfter, REFRESH_EVERY_HOURS, REFRESH_MINUTE_UTC } from './schedule';
import { readFileSync } from 'node:fs';

describe('nextRefreshAfter', () => {
  it('gives the coming slot when the build finished just before it', () => {
    expect(nextRefreshAfter(new Date('2026-09-15T08:21:35Z')).toISOString()).toBe(
      '2026-09-15T08:23:00.000Z',
    );
  });

  it('gives the slot after when the build finished past one', () => {
    expect(nextRefreshAfter(new Date('2026-09-15T09:30:00Z')).toISOString()).toBe(
      '2026-09-15T10:23:00.000Z',
    );
  });

  it('treats a build exactly on the scheduled minute as that run, not the next', () => {
    expect(nextRefreshAfter(new Date('2026-09-15T08:23:00Z')).toISOString()).toBe(
      '2026-09-15T10:23:00.000Z',
    );
  });

  it('rolls over a day, a month and a year', () => {
    expect(nextRefreshAfter(new Date('2026-09-15T22:30:00Z')).toISOString()).toBe(
      '2026-09-16T00:23:00.000Z',
    );
    expect(nextRefreshAfter(new Date('2026-09-30T22:30:00Z')).toISOString()).toBe(
      '2026-10-01T00:23:00.000Z',
    );
    expect(nextRefreshAfter(new Date('2026-12-31T23:00:00Z')).toISOString()).toBe(
      '2027-01-01T00:23:00.000Z',
    );
  });

  it('matches the cron the workflow actually runs on', () => {
    // The page promises a time; this is the only thing keeping that promise
    // honest if someone retimes the job.
    const yaml = readFileSync('.github/workflows/refresh.yml', 'utf8');
    const cron = /cron:\s*'(\d+)\s+\*\/(\d+)\s+\*\s+\*\s+\*'/.exec(yaml);
    expect(cron).not.toBeNull();
    expect(Number(cron![1])).toBe(REFRESH_MINUTE_UTC);
    expect(Number(cron![2])).toBe(REFRESH_EVERY_HOURS);
  });
});

describe('formatEastern', () => {
  it('reads as Eastern, and names the zone', () => {
    // 12:23 UTC is 08:23 in New York while daylight saving is in effect.
    expect(formatEastern(new Date('2026-09-15T12:23:00Z'))).toBe('Sep 15 2026, 8:23 AM EDT');
  });

  it('follows the clocks back without being told', () => {
    // The same cron lands an hour earlier locally once EST returns, which is
    // exactly what a reader planning around it needs to see.
    expect(formatEastern(new Date('2026-12-15T12:23:00Z'))).toBe('Dec 15 2026, 7:23 AM EST');
  });
});
