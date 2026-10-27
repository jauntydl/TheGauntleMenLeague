import type { Metrics, StatSlice } from './types';
import type { Mode } from './modes';

/** Jet share at or above this percent earns the ✈ badge. */
export const JET_BADGE_THRESHOLD = 10;

const num = (slice: StatSlice, key: string): number => {
  const v = slice[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/**
 * Turn one season slice into display metrics, reading the counters of the
 * mode that season is ranked on.
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
export function computeMetrics(slice: StatSlice, mode: Mode): Metrics {
  // The mode's own counter: kills_gm_gntgauntlet, kills_gm_rr_trio.
  const own = (stat: string): number => num(slice, `${stat}_gm_${mode.suffix}`);
  const rapidRoyale = mode.key === 'rapidRoyale';

  const matches = own('matches');
  const wins = own('wins');
  const losses = own('losses');
  const kills = own('kills');
  const headshots = own('hsw');
  const deaths = own('deaths');
  const damage = own('dmg');
  const assists = own('assists');
  const revives = own('revives');
  const timeSec = own('tp');

  // Score carries the same rollup hazard as Kills_Total, and the same fix:
  // only the mode-suffixed field is safe. Verified against the lifetime
  // total — this player's Seasons 1-4 sum to exactly the global
  // scorein_gm_gntgauntlet of 11,371,030. The alternatives do not survive
  // the same check: one GraniteSquad slice reads scorein_gm_all = 913,285
  // against a true score_total of 135,440 for that mode.
  const score = own('scorein');

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
  //
  // Gauntlet only. Rapid Royale has no objective counters at all — only intel
  // pickups — so the formula would quietly become "3 x intel" under a name
  // that says otherwise. Rapid Royale reads objective score instead (objSpm).
  const objPts = rapidRoyale
    ? 0
    : 0.1 * own('obj_time') + 10 * own('obj_destroyed') + 5 * own('obj_disarmed') + 3 * own('intel_pickup');

  // Superseded by the weighted objective points below, and read by nothing.
  // Kept only because it is already in the committed JSON.
  const objActions = own('obj_armed') + own('obj_defended') + own('obj_destroyed') + own('obj_disarmed');

  // Rapid Royale's objective figure: the part of a player's score the game
  // awards for objective play. There is no suffixed counter for it, so this
  // is the one unsuffixed field the board reads — the same hazard as
  // Kills_Total. In a Rapid Royale slice the unsuffixed totals agree with the
  // mode's own (score_total === scorein_gm_rr_trio), but a share of score can
  // never exceed the score, so anything larger is a rollup and reads as null.
  const objScore = num(slice, 'score_objective_total');
  const objScoreTrusted = rapidRoyale && objScore > 0 && score > 0 && objScore <= score;

  // Finishing in the top three, Rapid Royale only. Placement is the best input
  // a battle royale has, but Gauntlet's placement counters did not add up —
  // one player showed more top-ten finishes than matches. So the figure must
  // sit between the wins and the matches, which it has to if it is real.
  const top3 = own('topthree');
  const top3Trusted = rapidRoyale && matches > 0 && top3 >= wins && top3 <= matches;

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
    objSpm: objScoreTrusted && minutes > 0 ? objScore / minutes : null,
    top3Pct: top3Trusted ? (top3 / matches) * 100 : null,
    // Rapid Royale only: assists are a rated stat there and nowhere else, and
    // leaving Gauntlet's null keeps the archived seasons' rows as they were.
    apm: rapidRoyale && minutes > 0 ? assists / minutes : null,
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
