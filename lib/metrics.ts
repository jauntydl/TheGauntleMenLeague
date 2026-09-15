import type { Metrics, StatSlice } from './types';

/** Jet share at or above this percent earns the ✈ badge. */
export const JET_BADGE_THRESHOLD = 10;

const num = (slice: StatSlice, key: string): number => {
  const v = slice[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/**
 * Turn one Gauntlet season slice into display metrics.
 *
 * Every rate stat returns null rather than NaN/Infinity when its denominator
 * is zero, so the UI can render an em dash instead of nonsense.
 */
/** Kills by weapon class. These are NOT mode-suffixed — see sniperPct. */
const AUTO_CLASSES = ['ar', 'crb', 'smg', 'mg'] as const;
const PRECISION_CLASSES = ['snp', 'dmr'] as const;
const OTHER_CLASSES = ['sg', 'pst'] as const;

/**
 * Read the mode-suffixed counters, never the unsuffixed `*_Total` ones.
 *
 * Both appear inside a Gauntlet slice and they agree in recent seasons, which
 * makes the unsuffixed names look safe. They are not: in Season 2 the same
 * slice carries kills_gm_gntgauntlet = 71 alongside Kills_Total = 10550, and
 * dmg_gm_gntgauntlet = 19921 alongside Dmg_Dealt_Total = 2648747. Using the
 * unsuffixed fields put a K/D of 319 on the board for a player with 3 matches.
 * Only the suffixed field names the mode, so only the suffixed field is safe.
 */
export function computeMetrics(slice: StatSlice): Metrics {
  const matches = num(slice, 'matches_gm_gntgauntlet');
  const wins = num(slice, 'wins_gm_gntgauntlet');
  const losses = num(slice, 'losses_gm_gntgauntlet');
  const kills = num(slice, 'kills_gm_gntgauntlet');
  const headshots = num(slice, 'hsw_gm_gntgauntlet');
  const deaths = num(slice, 'deaths_gm_gntgauntlet');
  const damage = num(slice, 'dmg_gm_gntgauntlet');
  const assists = num(slice, 'assists_gm_gntgauntlet');
  const revives = num(slice, 'revives_gm_gntgauntlet');
  const timeSec = num(slice, 'tp_gm_gntgauntlet');

  // Score carries the same rollup hazard as Kills_Total, and the same fix:
  // only the mode-suffixed field is safe. Verified against the lifetime
  // total — this player's Seasons 1-4 sum to exactly the global
  // scorein_gm_gntgauntlet of 11,371,030. The alternatives do not survive
  // the same check: one GraniteSquad slice reads scorein_gm_all = 913,285
  // against a true score_total of 135,440 for that mode.
  const score = num(slice, 'scorein_gm_gntgauntlet');

  // Parent category only — it already contains fa18f / f14tomcat / su57.
  const jetSec = num(slice, 'tp_veh_air_jets');

  const minutes = timeSec / 60;
  const hours = timeSec / 3600;

  // Weighted objective points. Gauntlet eliminates squads on objective points,
  // so this is the closest thing to measuring the work that actually decides a
  // round.
  //
  // The formula and its coefficients are **Kricked's**, from the community
  // spreadsheet, and are used as written: a tenth of a point per second held,
  // ten per objective destroyed, five per disarm, three per intel pickup. They
  // are an editorial judgement, not anything the API reports — if they are ever
  // retuned, credit the source of the change too.
  //
  // Kricked's sheet computes this over lifetime Gauntlet totals. The board is
  // per-season like every other stat here, so the same formula runs against a
  // season slice and the figures will not match the sheet one-for-one.
  //
  // Every input is read from its mode-suffixed field, and this matters as much
  // here as anywhere: Obj_Time_Total reads 2018 against a true
  // obj_time_gm_gntgauntlet of 4405 in the same Season 4 slice.
  const objPts =
    0.1 * num(slice, 'obj_time_gm_gntgauntlet') +
    10 * num(slice, 'obj_destroyed_gm_gntgauntlet') +
    5 * num(slice, 'obj_disarmed_gm_gntgauntlet') +
    3 * num(slice, 'intel_pickup_gm_gntgauntlet');

  // Superseded by the weighted objective points below, and read by nothing.
  // Kept only because it is already in the committed JSON.
  const objActions =
    num(slice, 'obj_armed_gm_gntgauntlet') +
    num(slice, 'obj_defended_gm_gntgauntlet') +
    num(slice, 'obj_destroyed_gm_gntgauntlet') +
    num(slice, 'obj_disarmed_gm_gntgauntlet');

  // Playstyle, as a share of weapon kills rather than of all kills: melee,
  // grenades, gadgets and vehicles account for the rest, so weapon classes
  // reliably total only 85-93% of a player's kills.
  //
  // These fields are NOT mode-suffixed, so they carry the same rollup hazard
  // as Kills_Total: a Season 2 slice sums 8721 weapon kills against a mode
  // count of 71. When the sum exceeds the mode count the fields are a rollup
  // for some wider scope and the mix is meaningless, so report null.
  const classKills = (cls: readonly string[]): number =>
    cls.reduce((t, c) => t + num(slice, `kills_${c}_total`), 0);
  const autoKills = classKills(AUTO_CLASSES);
  const precisionKills = classKills(PRECISION_CLASSES);
  const weaponKills = autoKills + precisionKills + classKills(OTHER_CLASSES);
  const weaponMixTrusted = weaponKills > 0 && kills > 0 && weaponKills <= kills * 1.1;

  // Kills-as-K/D covers "played matches, died zero times" — a real, if rare,
  // outcome. It is not a substitute for missing match data: some season
  // slices (see buildBoard) carry a lifetime/legacy Kills_Total with no
  // matches/deaths/time at all, and treating that as a K/D would render an
  // absurd rate stat (thousands of "kills per death"). Require matches > 0.
  let kd: number | null;
  if (matches === 0) kd = null;
  else if (deaths > 0) kd = kills / deaths;
  else if (kills > 0) kd = kills;
  else kd = null;

  return {
    matches,
    wins,
    losses,
    kills,
    headshots,
    deaths,
    damage,
    assists,
    revives,
    score,
    timeSec,
    winPct: matches > 0 ? (wins / matches) * 100 : null,
    kd,
    killsPerMatch: matches > 0 ? kills / matches : null,
    kpm: minutes > 0 ? kills / minutes : null,
    dpm: minutes > 0 ? damage / minutes : null,
    // Null rather than 0 when the counter is absent. Per-mode score starts at
    // Season 3 like every other mode counter, and a fabricated zero would sit
    // that player at the bottom of the SPM percentile; a null is dropped and
    // the remaining rating weights renormalise instead.
    spm: minutes > 0 && score > 0 ? score / minutes : null,
    objPerMatch: matches > 0 ? objActions / matches : null,
    objPts,
    // Null rather than 0 when the counters are absent, for the same reason spm
    // is: the objective fields are mode counters and start at Season 3, and a
    // fabricated zero would sit that player at the bottom of a 25% percentile.
    objPtsPerHour: hours > 0 && objPts > 0 ? objPts / hours : null,
    revivesPerHour: hours > 0 ? revives / hours : null,
    // Both filled in by rateAll once the whole field is known.
    rating: null,
    standouts: [],
    sniperPct: weaponMixTrusted ? (precisionKills / weaponKills) * 100 : null,
    autoPct: weaponMixTrusted ? (autoKills / weaponKills) * 100 : null,
    // Counts as well as shares, and behind the same guard: an untrusted
    // rollup is no more usable as a total than it is as a proportion.
    sniperKills: weaponMixTrusted ? precisionKills : null,
    autoKills: weaponMixTrusted ? autoKills : null,
    // Per match rather than raw totals, for the same reason every other rate
    // on the board is: a season total mostly measures who played the most.
    sniperPerMatch: weaponMixTrusted && matches > 0 ? precisionKills / matches : null,
    autoPerMatch: weaponMixTrusted && matches > 0 ? autoKills / matches : null,
    jetPct: timeSec > 0 ? (jetSec / timeSec) * 100 : 0,
  };
}
