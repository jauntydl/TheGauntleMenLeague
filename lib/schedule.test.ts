import { describe, it, expect } from 'vitest';
import { formatEastern, nextRefreshAfter, REFRESH_HOUR_UTC, REFRESH_MINUTE_UTC } from './schedule';
import { readFileSync } from 'node:fs';

describe('nextRefreshAfter', () => {
  it('gives today’s run when the build finished before it', () => {
    expect(nextRefreshAfter(new Date('2026-09-15T08:21:35Z')).toISOString()).toBe(
      '2026-09-15T09:23:00.000Z',
    );
  });

  it('gives tomorrow’s when the build finished after it', () => {
    expect(nextRefreshAfter(new Date('2026-09-15T09:30:00Z')).toISOString()).toBe(
      '2026-09-16T09:23:00.000Z',
    );
  });

  it('treats a build exactly on the scheduled minute as that run, not the next', () => {
    expect(nextRefreshAfter(new Date('2026-09-15T09:23:00Z')).toISOString()).toBe(
      '2026-09-16T09:23:00.000Z',
    );
  });

  it('rolls over a month and a year', () => {
    expect(nextRefreshAfter(new Date('2026-09-30T10:00:00Z')).toISOString()).toBe(
      '2026-10-01T09:23:00.000Z',
    );
    expect(nextRefreshAfter(new Date('2026-12-31T23:00:00Z')).toISOString()).toBe(
      '2027-01-01T09:23:00.000Z',
    );
  });

  it('matches the cron the workflow actually runs on', () => {
    // The page promises a time; this is the only thing keeping that promise
    // honest if someone retimes the job.
    const yaml = readFileSync('.github/workflows/daily.yml', 'utf8');
    const cron = /cron:\s*'(\d+)\s+(\d+)/.exec(yaml);
    expect(cron).not.toBeNull();
    expect(Number(cron![1])).toBe(REFRESH_MINUTE_UTC);
    expect(Number(cron![2])).toBe(REFRESH_HOUR_UTC);
  });
});

describe('formatEastern', () => {
  it('reads as Eastern, and names the zone', () => {
    // 09:23 UTC is 05:23 in New York while daylight saving is in effect.
    expect(formatEastern(new Date('2026-09-15T09:23:00Z'))).toBe('Sep 15 2026, 5:23 AM EDT');
  });

  it('follows the clocks back without being told', () => {
    // The same cron lands an hour earlier locally once EST returns, which is
    // exactly what a reader planning around it needs to see.
    expect(formatEastern(new Date('2026-12-15T09:23:00Z'))).toBe('Dec 15 2026, 4:23 AM EST');
  });
});
