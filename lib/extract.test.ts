import { describe, it, expect } from 'vitest';
import { extractSlices, readPlayerIds } from './extract';
import { rawSample } from './fixtures/raw-sample';

const field = (name: string, value: number, gameMode: string, season: string) => ({
  name,
  value,
  fields: [{ name: 'GameMode', value: gameMode }, { name: 'Season', value: season }],
});
const payload = (catFields: ReturnType<typeof field>[]) => ({
  playerStats: [{ player: { nucleusId: '1', personaId: '2', platformId: 1 }, categories: [{ catName: 'c', catFields }] }],
});

describe('extractSlices', () => {
  it('reads Rapid Royale from Season 5 on, and Gauntlet before it', () => {
    const slices = extractSlices(payload([
      field('kills_gm_rr_trio', 7, 'GraniteRapidTrio0', 'Season5'),
      field('kills_gm_gntgauntlet', 3, 'GraniteGauntlet0', 'Season4'),
    ]));
    expect(slices.get('Season5')).toEqual({ kills_gm_rr_trio: 7 });
    expect(slices.get('Season4')).toEqual({ kills_gm_gntgauntlet: 3 });
  });

  it('ignores each mode in the other mode\'s seasons', () => {
    // A Gauntlet row in Season 5 would be a second, conflicting slice for the
    // season; a Rapid Royale row in Season 4 cannot exist but must not leak.
    const slices = extractSlices(payload([
      field('kills_gm_gntgauntlet', 9, 'GraniteGauntlet0', 'Season5'),
      field('kills_gm_rr_trio', 9, 'GraniteRapidTrio0', 'Season4'),
    ]));
    expect(slices.size).toBe(0);
  });

  it('ignores the squad battle royale that shares Season 5', () => {
    const slices = extractSlices(payload([field('kills_gm_brsquad', 5, 'GraniteSquad0', 'Season5')]));
    expect(slices.size).toBe(0);
  });

  it('groups Gauntlet stats by season', () => {
    const slices = extractSlices(rawSample);
    expect([...slices.keys()].sort()).toEqual(['Season3', 'Season4']);
  });

  it('extracts the Season4 values', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    expect(s4.matches_gm_gntgauntlet).toBe(50);
    expect(s4.wins_gm_gntgauntlet).toBe(29);
    expect(s4.deaths_gm_gntgauntlet).toBe(406);
    expect(s4.Kills_Total).toBe(1162);
  });

  it('ignores other game modes', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    expect(s4.Kills_Total).not.toBe(9999);
  });

  it('ignores global/lifetime rows', () => {
    const slices = extractSlices(rawSample);
    expect(slices.has('global')).toBe(false);
    expect([...slices.keys()]).not.toContain(undefined as unknown as string);
  });

  it('does not double-count nested vehicle fields', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    // parent is read verbatim; the child is NOT added into it
    expect(s4.tp_veh_air_jets).toBe(8132);
    expect(s4.tp_veh_air_fa18f).toBe(6841);
  });

  it('skips fields with no value', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    expect(s4.broken_field).toBeUndefined();
  });

  it('drops the PLACEHOLDER sentinel, which is not a season', () => {
    const raw = {
      playerStats: [{
        player: { nucleusId: '1', personaId: '2', platformId: 1 },
        categories: [{ catName: 'glacier_mp', catFields: [
          { name: 'kills_gm_gntgauntlet', value: 16, fields: [
            { name: 'GameMode', value: 'GraniteGauntlet0' },
            { name: 'Season', value: 'PLACEHOLDER' }] },
          { name: 'kills_gm_gntgauntlet', value: 99, fields: [
            { name: 'GameMode', value: 'GraniteGauntlet0' },
            { name: 'Season', value: 'Season4' }] },
        ]}],
      }],
    };
    expect([...extractSlices(raw).keys()]).toEqual(['Season4']);
  });

  it('returns an empty map for an empty payload', () => {
    expect(extractSlices({ playerStats: [] }).size).toBe(0);
  });
});

describe('readPlayerIds', () => {
  it('reads persona and nucleus ids', () => {
    expect(readPlayerIds(rawSample)).toEqual({
      nucleusId: '2250375376',
      personaId: '849687045',
      platformId: 1,
    });
  });

  it('returns null when absent', () => {
    expect(readPlayerIds({ playerStats: [] })).toBeNull();
  });
});
