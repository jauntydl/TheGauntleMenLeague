/**
 * Which game mode the board ranks, season by season.
 *
 * Gauntlet ran through Season 4 and was removed in Season 5, when Rapid Royale
 * took its place as the mode this community plays. Each mode has its own
 * GameMode bucket in the API and its own suffix on the per-mode counters —
 * and only the suffixed counters are safe to read (see computeMetrics).
 *
 * Rapid Royale's suffix is `rr_trio`. `rr_all` matches it field for field
 * today, which reads like a parent over trio and any later variant; and
 * `granitebr` is a battle-royale rollup that carries different values in a
 * squad BR slice than in a Rapid Royale one. Neither names this mode alone.
 */
export type ModeKey = 'gauntlet' | 'rapidRoyale';

export type Mode = {
  key: ModeKey;
  label: string;
  /** The API's GameMode dimension value. */
  gameMode: string;
  /** The per-mode counter suffix: kills_gm_<suffix>. */
  suffix: string;
};

export const MODES: Record<ModeKey, Mode> = {
  gauntlet: { key: 'gauntlet', label: 'Gauntlet', gameMode: 'GraniteGauntlet0', suffix: 'gntgauntlet' },
  rapidRoyale: {
    key: 'rapidRoyale',
    label: 'Rapid Royale',
    gameMode: 'GraniteRapidTrio0',
    suffix: 'rr_trio',
  },
};

/** The first season ranked on Rapid Royale rather than Gauntlet. */
export const FIRST_RAPID_ROYALE_SEASON = 5;

/**
 * The mode a season is ranked on. A key that carries no season number is
 * treated as current, since seasons are discovered from the live feed and a
 * renamed key is far more likely to be new than old.
 */
export function modeForSeason(season: string): Mode {
  const n = /(\d+)$/.exec(season);
  if (n && Number(n[1]) < FIRST_RAPID_ROYALE_SEASON) return MODES.gauntlet;
  return MODES.rapidRoyale;
}
