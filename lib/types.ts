export type RawDimension = { name: string; value?: string };
export type RawField = { name: string; value?: number; fields?: RawDimension[] };
export type RawCategory = { catName: string; catFields: RawField[] };
export type RawPlayerIds = { nucleusId: string; personaId: string; platformId: number };
export type RawPlayerStats = { player: RawPlayerIds; categories: RawCategory[] };
export type RawResponse = { playerStats: RawPlayerStats[] };

/** A flat map of stat name -> value for one GameMode x Season slice. */
export type StatSlice = Record<string, number>;

export type MainMode = 'gauntlet' | 'redsec' | 'both' | 'unknown';

export type RosterEntry = {
  eaId: string;
  displayName: string;
  platform: string;
  region: string;
  mainMode: MainMode;
  /**
   * Where this member came from. 'community' means they posted in
   * #introductions and can be reached; 'selfserve' means they added
   * themselves through /join, so they are reachable by definition;
   * 'imported' means they were pulled from an external leaderboard and have
   * no idea this board exists. Only reachable members appear on the "Why am I
   * not listed?" page — telling a stranger to change their privacy settings is
   * advice they will never read, and it buries the members who can act on it.
   * Absent means community.
   */
  source?: 'community' | 'selfserve' | 'imported';
  /**
   * The name on the scoreboard in game, and the platform it belongs to.
   *
   * An EA account carries one persona per platform and the EA ID is often a
   * suffixed variant of the platform name (TTVLezWin on EA is LezWin on
   * Steam), so the EA ID alone cannot be matched to the person you just
   * played against. Resolved once by the build and cached here — see
   * lib/naming.ts for how a persona is chosen. Absent means the EA ID stands.
   */
  inGameName?: string;
  inGamePlatform?: string;
  /** Cached by the build. The only fields the build may write back. */
  personaId?: string;
  nucleusId?: string;
};

export type Metrics = {
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  /** Headshot kills. From hsw_gm_gntgauntlet — kills_Headshots_Total is a
   *  rollup that reads 1512 against 9 in a Season 2 slice. */
  headshots: number;
  deaths: number;
  damage: number;
  assists: number;
  revives: number;
  /** Season score in Gauntlet. From scorein_gm_gntgauntlet — see computeMetrics
   *  for why score_total and scorein_gm_all cannot be used. */
  score: number;
  timeSec: number;
  /** null when the denominator is zero; the UI renders these as an em dash. */
  winPct: number | null;
  kd: number | null;
  /** Kills per match. Distinct from kpm, which is per minute. */
  killsPerMatch: number | null;
  kpm: number | null;
  dpm: number | null;
  /** Score per minute. Null when the per-mode score counter is absent, which
   *  is every season before Season 3. */
  spm: number | null;
  /** Per hour, not per minute: revives are rare enough that a per-minute rate
   *  reads as 0.0x for everyone. */
  /** Objective plays per match: armed + defended + destroyed + disarmed.
   *  Superseded by objPtsPerHour and read by nothing — kept only because it is
   *  already in the committed JSON. Do not add it to the rating. */
  objPerMatch: number | null;
  /** Weighted objective points: 0.1/sec on the objective + 10 per destroyed +
   *  5 per disarmed + 3 per intel pickup. */
  objPts: number;
  /** Objective points per hour played. Per hour, not per match, because
   *  Gauntlet match length varies — winning squads play more rounds, so a
   *  per-match average flatters them for their team's depth rather than their
   *  own rate of objective work. */
  objPtsPerHour: number | null;
  revivesPerHour: number | null;
  /** Overall rating, 0-100, percentile-weighted against the ranked field. */
  rating: number | null;
  /** The trait this player is most exceptional at, if any names them. */
  standouts: import('./rating').StandoutTrait[];
  /**
   * Share of weapon kills taken with snipers and DMRs. null when the weapon
   * fields cannot be trusted for that season — see computeMetrics.
   */
  sniperPct: number | null;
  /** Share of weapon kills taken with automatics. null under the same guard. */
  autoPct: number | null;
  /** Kills with snipers and DMRs. null under the same guard as the share. */
  sniperKills: number | null;
  /** Kills with automatics. null under the same guard as the share. */
  autoKills: number | null;
  /** Sniper and DMR kills per match. null when either input is unusable. */
  sniperPerMatch: number | null;
  /** Automatic kills per match. null when either input is unusable. */
  autoPerMatch: number | null;
  jetPct: number;
};

export type BoardRow = Metrics & {
  eaId: string;
  displayName: string;
  /** See RosterEntry.inGameName. Absent falls back to eaId. */
  inGameName?: string;
  inGamePlatform?: string;
  platform: string;
  region: string;
  mainMode: MainMode;
  rank: number | null;
};

export type UnresolvedEntry = {
  eaId: string;
  displayName: string;
  /**
   * 'not_found' — never resolved (no cached ids; privacy off, or a bad EA ID).
   * 'no_data' — was resolved before, but no response came back this run for
   * that persona (most often privacy was turned back off after resolving).
   */
  reason: 'not_found' | 'no_data';
};

export type BoardFile = {
  meta: { currentSeason: string; seasons: string[]; builtAt: string };
  seasons: Record<string, BoardRow[]>;
  provisional: Record<string, BoardRow[]>;
  unresolved: UnresolvedEntry[];
};
