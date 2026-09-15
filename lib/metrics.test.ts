import { describe, it, expect } from 'vitest';
import { computeMetrics, JET_BADGE_THRESHOLD } from './metrics';
import type { StatSlice } from './types';

// Real Season 4 Gauntlet data for EA ID "pkidarkpki"
const darkSlice: StatSlice = {
  matches_gm_gntgauntlet: 50,
  wins_gm_gntgauntlet: 29,
  losses_gm_gntgauntlet: 21,
  deaths_gm_gntgauntlet: 406,
  tp_gm_gntgauntlet: 54973,
  kills_gm_gntgauntlet: 1162,
  dmg_gm_gntgauntlet: 385901,
  assists_gm_gntgauntlet: 278,
  revives_gm_gntgauntlet: 140,
  tp_veh_air_jets: 8132,
  hsw_gm_gntgauntlet: 217,
  kills_ar_total: 300, kills_crb_total: 100, kills_smg_total: 118, kills_mg_total: 0,
  kills_snp_total: 180, kills_dmr_total: 20, kills_sg_total: 40, kills_pst_total: 40,
  kills_Headshots_Total: 9999,
};

// Real Season 4 Gauntlet data for EA ID "CHASEXRYAN" (no jet time)
const chaseSlice: StatSlice = {
  matches_gm_gntgauntlet: 45,
  wins_gm_gntgauntlet: 35,
  losses_gm_gntgauntlet: 10,
  deaths_gm_gntgauntlet: 375,
  tp_gm_gntgauntlet: 64573,
  kills_gm_gntgauntlet: 839,
  dmg_gm_gntgauntlet: 155538,
  assists_gm_gntgauntlet: 449,
  revives_gm_gntgauntlet: 115,
};

// Real Season 4 Gauntlet data for EA ID "CHASEXRYAN", read 2026-09-15 — a
// later snapshot than chaseSlice. This is the slice the score field was
// verified against: Seasons 1-4 sum to exactly the lifetime figure.
const scoreSlice: StatSlice = {
  matches_gm_gntgauntlet: 53,
  wins_gm_gntgauntlet: 40,
  losses_gm_gntgauntlet: 13,
  deaths_gm_gntgauntlet: 375,
  tp_gm_gntgauntlet: 76182,
  kills_gm_gntgauntlet: 1026,
  scorein_gm_gntgauntlet: 979385,
  obj_time_gm_gntgauntlet: 4405,
  obj_destroyed_gm_gntgauntlet: 20,
  obj_disarmed_gm_gntgauntlet: 4,
  intel_pickup_gm_gntgauntlet: 119,
  // The rollup that sits beside obj_time in the same slice and disagrees with
  // it. Real: 2018 against a true 4405.
  Obj_Time_Total: 2018,
};

describe('computeMetrics', () => {
  it('computes rate stats for a jet-heavy player', () => {
    const m = computeMetrics(darkSlice);
    expect(m.matches).toBe(50);
    expect(m.wins).toBe(29);
    expect(m.losses).toBe(21);
    expect(m.winPct).toBeCloseTo(58.0, 4);
    expect(m.kd).toBeCloseTo(2.8620689655, 6);
    expect(m.kpm).toBeCloseTo(1.2682589635, 6);
    expect(m.dpm).toBeCloseTo(421.1896749313, 4);
    expect(m.jetPct).toBeCloseTo(14.7927164244, 6);
  });

  it('computes rate stats for an infantry player', () => {
    const m = computeMetrics(chaseSlice);
    expect(m.winPct).toBeCloseTo(77.7777777778, 6);
    expect(m.kd).toBeCloseTo(2.2373333333, 6);
    expect(m.kpm).toBeCloseTo(0.7795827978, 6);
    expect(m.dpm).toBeCloseTo(144.5229430257, 4);
    expect(m.jetPct).toBe(0);
    expect(m.revives).toBe(115);
    expect(m.assists).toBe(449);
  });

  it('treats missing fields as zero', () => {
    const m = computeMetrics({});
    expect(m.matches).toBe(0);
    expect(m.kills).toBe(0);
    expect(m.jetPct).toBe(0);
  });

  it('returns null winPct when there are no matches', () => {
    expect(computeMetrics({ kills_gm_gntgauntlet: 5 }).winPct).toBeNull();
  });

  it('uses kills as K/D when deaths is zero', () => {
    const m = computeMetrics({ kills_gm_gntgauntlet: 7, deaths_gm_gntgauntlet: 0, matches_gm_gntgauntlet: 3 });
    expect(m.kd).toBe(7);
  });

  it('returns null K/D when there are no kills and no deaths', () => {
    expect(computeMetrics({ matches_gm_gntgauntlet: 3 }).kd).toBeNull();
  });

  it('returns null K/D for a slice with kills but no match data at all', () => {
    // Real shape of a pre-per-mode-counter season slice (see buildBoard):
    // DICE added the _gm_gntgauntlet counters after Season 1, so an old
    // season carries a lifetime-scoped Kills_Total with no matches, deaths,
    // or time at all. Treating that kill count as a K/D would render an
    // absurd rate (e.g. "8299.00") instead of recognizing there's no
    // measurable play to attribute it to.
    expect(computeMetrics({ kills_gm_gntgauntlet: 8299 }).kd).toBeNull();
  });

  it('returns null rate stats when time played is zero', () => {
    const m = computeMetrics({ kills_gm_gntgauntlet: 10, dmg_gm_gntgauntlet: 100, tp_gm_gntgauntlet: 0 });
    expect(m.kpm).toBeNull();
    expect(m.dpm).toBeNull();
  });

  it('never produces NaN or Infinity', () => {
    for (const v of Object.values(computeMetrics({}))) {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('reads only the parent jet field, never summing children', () => {
    const m = computeMetrics({
      tp_gm_gntgauntlet: 10000,
      tp_veh_air_jets: 1000,
      tp_veh_air_fa18f: 900,
    });
    expect(m.jetPct).toBeCloseTo(10, 6);
  });

  // Real Season 2 data for EA ID "Excited_Pianist": the slice carries BOTH
  // the mode counter and a far larger unsuffixed rollup. Reading the rollup
  // produced a K/D of 202.88 from 4 matches on the live board.
  it('ignores the unsuffixed rollup when a mode counter is present', () => {
    const m = computeMetrics({
      matches_gm_gntgauntlet: 4,
      wins_gm_gntgauntlet: 4,
      deaths_gm_gntgauntlet: 52,
      tp_gm_gntgauntlet: 6158,
      kills_gm_gntgauntlet: 71,
      dmg_gm_gntgauntlet: 19921,
      Kills_Total: 10550,
      Dmg_Dealt_Total: 2648747,
    });
    expect(m.kills).toBe(71);
    expect(m.damage).toBe(19921);
    expect(m.kd).toBeCloseTo(71 / 52, 6);
    expect(m.kd).toBeLessThan(2);
  });

  it('rates revives per hour, not per match or in total', () => {
    // Real Season 4 data: 140 revives over 54973s (15.27h).
    const m = computeMetrics(darkSlice);
    expect(m.revives).toBe(140);
    expect(m.revivesPerHour).toBeCloseTo(140 / (54973 / 3600), 6);
  });

  it('returns null revives per hour when no time was played', () => {
    expect(computeMetrics({ revives_gm_gntgauntlet: 9 }).revivesPerHour).toBeNull();
  });

  it('reads headshots from the mode counter, not the rollup', () => {
    // A Season 2 slice carries hsw_gm_gntgauntlet = 9 beside
    // kills_Headshots_Total = 1512. Only the suffixed field names the mode.
    const m = computeMetrics(darkSlice);
    expect(m.headshots).toBe(217);
    expect(m.headshots).not.toBe(9999);
  });

  it('rates kills per match as well as per minute', () => {
    // Real Season 4 data: 1162 kills over 50 matches and 54973s.
    const m = computeMetrics(darkSlice);
    expect(m.killsPerMatch).toBeCloseTo(1162 / 50, 6);
    expect(m.kpm).toBeCloseTo(1162 / (54973 / 60), 6);
    // The two must not be confused for one another.
    expect(m.killsPerMatch).not.toBeCloseTo(m.kpm!, 3);
  });

  it('returns null kills per match when there are no matches', () => {
    expect(computeMetrics({ kills_gm_gntgauntlet: 9 }).killsPerMatch).toBeNull();
  });

  it('rates score per minute from the mode counter', () => {
    // 979,385 score over 76,182s (1269.7 min).
    const m = computeMetrics(scoreSlice);
    expect(m.score).toBe(979385);
    expect(m.spm).toBeCloseTo(979385 / (76182 / 60), 6);
  });

  it('reads score from the mode counter, not the rollups beside it', () => {
    // Constructed. In a real Gauntlet slice these four agree, which is exactly
    // what makes the unsuffixed names look safe. They do not agree everywhere:
    // a GraniteSquad Season 4 slice carries scorein_gm_all = 913,285 against a
    // true score_total of 135,440. Only the suffixed field names the mode.
    const m = computeMetrics({
      ...scoreSlice,
      score_total: 5_000_000,
      scorein_gm_all: 6_000_000,
      scorein_gm_granite: 7_000_000,
      scorein_gm_official: 8_000_000,
    });
    expect(m.score).toBe(979385);
    expect(m.spm).toBeCloseTo(979385 / (76182 / 60), 6);
  });

  it('reports no score per minute when the counter is absent', () => {
    // Per-mode score starts at Season 3, like every other mode counter. A
    // fabricated zero would sit that player at the bottom of the SPM
    // percentile; a null is dropped and the other weights renormalise.
    const m = computeMetrics(chaseSlice);
    expect(m.score).toBe(0);
    expect(m.spm).toBeNull();
  });

  it('weights objective points and rates them per hour', () => {
    // 0.1*4405 + 10*20 + 5*4 + 3*119 = 440.5 + 200 + 20 + 357 = 1017.5
    const m = computeMetrics(scoreSlice);
    expect(m.objPts).toBeCloseTo(1017.5, 6);
    // Per hour, not per match: Gauntlet match length varies with how deep the
    // squad went, so a per-match average would flatter winning teams.
    expect(m.objPtsPerHour).toBeCloseTo(1017.5 / (76182 / 3600), 6);
  });

  it('reads objective time from the mode counter, not Obj_Time_Total', () => {
    // scoreSlice carries Obj_Time_Total = 2018 against obj_time = 4405. Reading
    // the rollup would knock 238.7 points off the total.
    const m = computeMetrics(scoreSlice);
    expect(m.objPts).not.toBeCloseTo(0.1 * 2018 + 200 + 20 + 357, 3);
  });

  it('reports no objective rate when the counters are absent', () => {
    // Objective counters are mode counters, so they start at Season 3 too.
    const m = computeMetrics(chaseSlice);
    expect(m.objPts).toBe(0);
    expect(m.objPtsPerHour).toBeNull();
  });

  it('reports the weapon mix as a share of weapon kills', () => {
    const m = computeMetrics(darkSlice);
    // 300+100+118+0 auto, 180+20 precision, 40+40 other = 798 weapon kills.
    expect(m.autoPct).toBeCloseTo((518 / 798) * 100, 4);
    expect(m.sniperPct).toBeCloseTo((200 / 798) * 100, 4);
  });

  it('reports weapon kills per match as well as their share', () => {
    const m = computeMetrics(darkSlice);
    // 518 auto and 200 precision kills over 50 matches.
    expect(m.autoKills).toBe(518);
    expect(m.sniperKills).toBe(200);
    expect(m.autoPerMatch).toBeCloseTo(518 / 50, 6);
    expect(m.sniperPerMatch).toBeCloseTo(200 / 50, 6);
  });

  it('refuses weapon kills per match when there are no matches', () => {
    // The count survives without matches; the rate cannot be formed from it.
    const m = computeMetrics({ kills_gm_gntgauntlet: 100, kills_ar_total: 60, kills_snp_total: 20 });
    expect(m.autoKills).toBe(60);
    expect(m.autoPerMatch).toBeNull();
    expect(m.sniperPerMatch).toBeNull();
  });

  it('refuses the weapon mix when the fields are a wider rollup', () => {
    // Real Season 2 shape: 8721 weapon kills against a mode count of 71.
    const m = computeMetrics({
      matches_gm_gntgauntlet: 4,
      kills_gm_gntgauntlet: 71,
      kills_ar_total: 1702,
      kills_snp_total: 681,
      kills_mg_total: 2150,
    });
    expect(m.sniperPct).toBeNull();
    expect(m.autoPct).toBeNull();
    expect(m.sniperKills).toBeNull();
    expect(m.autoKills).toBeNull();
    expect(m.sniperPerMatch).toBeNull();
    expect(m.autoPerMatch).toBeNull();
  });

  it('exposes the badge threshold', () => {
    expect(JET_BADGE_THRESHOLD).toBe(10);
  });
});
