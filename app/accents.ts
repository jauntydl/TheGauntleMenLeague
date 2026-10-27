import type { ModeKey } from '@/lib/modes';

/**
 * The data accent each mode's seasons are drawn in: Gauntlet's amber, and for
 * Rapid Royale the magenta a cockpit display draws in alongside it.
 *
 * Its own module, without 'use client', so a server component (the rating
 * page) can read the values. Importing them from app/theme.ts would hand a
 * server component a client reference instead of a string.
 */
export const MODE_ACCENT: Record<ModeKey, string> = {
  gauntlet: '#FFB020',
  rapidRoyale: '#FF5FD2',
};
