/**
 * Which game modes the board ranks, season by season.
 *
 * Gauntlet ran through Season 4 and was removed in Season 5, when Rapid Royale
 * took its place as the mode this community plays. Rapid Royale shipped as two
 * modes, Trio and Solo, and each is ranked on a board of its own. Each mode has
 * its own GameMode bucket in the API and its own suffix on the per-mode
 * counters — and only the suffixed counters are safe to read (see
 * computeMetrics).
 *
 * Rapid Royale Trio's suffix is `rr_trio`. `rr_all` matched it field for field
 * when checked, which reads like a parent over trio and solo; and `granitebr`
 * is a battle-royale rollup that carries different values in a squad BR slice
 * than in a Rapid Royale one. Neither names one mode alone.
 */
export type ModeKey = 'gauntlet' | 'rapidRoyale' | 'rapidRoyaleSolo';

export type Mode = {
  key: ModeKey;
  label: string;
  /** Which of a season's boards this is, where the season has more than one. */
  variant?: string;
  /** The API's GameMode dimension value. */
  gameMode: string;
  /** The per-mode counter suffix: kills_gm_<suffix>. */
  suffix: string;
  /**
   * How many play together. 1 means nobody to assist or revive, which is
   * why the Solo board shows no Assists column and rates no revives.
   */
  squadSize: number;
  /**
   * Appended to the season to key this mode's board: Season5-solo. Absent for
   * a season's first mode, whose board keeps the bare season key — that is
   * what every board was keyed by before seasons had more than one, and the
   * archive is never rewritten.
   */
  boardSuffix?: string;
};

export const MODES: Record<ModeKey, Mode> = {
  gauntlet: { key: 'gauntlet', label: 'Gauntlet', gameMode: 'GraniteGauntlet0', suffix: 'gntgauntlet', squadSize: 4 },
  rapidRoyale: {
    key: 'rapidRoyale',
    label: 'Rapid Royale',
    variant: 'Trio',
    gameMode: 'GraniteRapidTrio0',
    suffix: 'rr_trio',
    squadSize: 3,
  },
  rapidRoyaleSolo: {
    key: 'rapidRoyaleSolo',
    label: 'Rapid Royale',
    variant: 'Solo',
    gameMode: 'GraniteRapidSolo0',
    suffix: 'rr_solo',
    boardSuffix: 'solo',
    squadSize: 1,
  },
};

/** The first season ranked on Rapid Royale rather than Gauntlet. */
export const FIRST_RAPID_ROYALE_SEASON = 5;

/**
 * Every mode a season is ranked on, its main board first. A key that carries
 * no season number is treated as current, since seasons are discovered from
 * the live feed and a renamed key is far more likely to be new than old.
 */
export function modesForSeason(season: string): Mode[] {
  const n = /(\d+)$/.exec(season);
  if (n && Number(n[1]) < FIRST_RAPID_ROYALE_SEASON) return [MODES.gauntlet];
  return [MODES.rapidRoyale, MODES.rapidRoyaleSolo];
}

/** The mode a season's main board ranks — the one its tab is named for. */
export function modeForSeason(season: string): Mode {
  return modesForSeason(season)[0];
}

/** The board key for one mode of a season: Season5, Season5-solo. */
export function boardKey(season: string, mode: Mode): string {
  return mode.boardSuffix ? `${season}-${mode.boardSuffix}` : season;
}

/** Split a board key back into its season and mode. */
export function parseBoardKey(key: string): { season: string; mode: Mode } {
  const dash = key.lastIndexOf('-');
  if (dash > 0) {
    const season = key.slice(0, dash);
    const mode = modesForSeason(season).find((m) => m.boardSuffix === key.slice(dash + 1));
    if (mode) return { season, mode };
  }
  return { season: key, mode: modeForSeason(key) };
}

/** The mode a board is ranked on. */
export const modeForBoard = (key: string): Mode => parseBoardKey(key).mode;

/**
 * Sort season keys the way a human expects: numerically by the trailing
 * number (Season2 before Season10), falling back to a plain string compare
 * for anything that doesn't end in digits.
 */
export function compareSeasons(a: string, b: string): number {
  const an = /^(.*?)(\d+)$/.exec(a);
  const bn = /^(.*?)(\d+)$/.exec(b);
  if (an && bn && an[1] === bn[1]) return Number(an[2]) - Number(bn[2]);
  return a.localeCompare(b);
}

/** Board keys by season, then each season's boards in mode order. */
export function compareBoardKeys(a: string, b: string): number {
  const pa = parseBoardKey(a);
  const pb = parseBoardKey(b);
  const order = (p: { season: string; mode: Mode }) =>
    modesForSeason(p.season).findIndex((m) => m.key === p.mode.key);
  return compareSeasons(pa.season, pb.season) || order(pa) - order(pb);
}
