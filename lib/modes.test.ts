import { describe, it, expect } from 'vitest';
import { MODES, boardKey, compareBoardKeys, modesForSeason, parseBoardKey } from './modes';

describe('board keys', () => {
  it('keeps the bare season key for a season\'s main board', () => {
    // Every archived board is keyed this way; renaming it would orphan them.
    expect(boardKey('Season4', MODES.gauntlet)).toBe('Season4');
    expect(boardKey('Season5', MODES.rapidRoyale)).toBe('Season5');
    expect(boardKey('Season5', MODES.rapidRoyaleSolo)).toBe('Season5-solo');
  });

  it('round-trips through parseBoardKey', () => {
    for (const season of ['Season3', 'Season5', 'Season12']) {
      for (const mode of modesForSeason(season)) {
        expect(parseBoardKey(boardKey(season, mode))).toEqual({ season, mode });
      }
    }
  });

  it('gives Gauntlet seasons one board and Rapid Royale seasons Trio and Solo', () => {
    expect(modesForSeason('Season4').map((m) => m.key)).toEqual(['gauntlet']);
    expect(modesForSeason('Season5').map((m) => m.key)).toEqual(['rapidRoyale', 'rapidRoyaleSolo']);
  });

  it('sorts by season, then each season\'s boards in mode order', () => {
    const keys = ['Season10-solo', 'Season5-solo', 'Season10', 'Season3', 'Season5'];
    expect([...keys].sort(compareBoardKeys)).toEqual(['Season3', 'Season5', 'Season5-solo', 'Season10', 'Season10-solo']);
  });
});
