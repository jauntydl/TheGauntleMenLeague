import type { RawResponse } from '../types';

const dim = (gameMode: string, season: string) => [
  { name: 'GameMode', value: gameMode },
  { name: 'Season', value: season },
];

/** Mirrors api.gametools.network /bf6/multiple/?raw=true, trimmed. */
export const rawSample: RawResponse = {
  playerStats: [
    {
      player: { nucleusId: '2250375376', personaId: '849687045', platformId: 1 },
      categories: [
        {
          catName: 'glacier_mp',
          catFields: [
            // --- Gauntlet, Season4 ---
            { name: 'matches_gm_gntgauntlet', value: 50, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'wins_gm_gntgauntlet', value: 29, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'losses_gm_gntgauntlet', value: 21, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'deaths_gm_gntgauntlet', value: 406, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'tp_gm_gntgauntlet', value: 54973, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'scorein_gm_gntgauntlet', value: 700000, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'obj_time_gm_gntgauntlet', value: 4405, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'obj_destroyed_gm_gntgauntlet', value: 20, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'obj_disarmed_gm_gntgauntlet', value: 4, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'intel_pickup_gm_gntgauntlet', value: 119, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'Kills_Total', value: 1162, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'Dmg_Dealt_Total', value: 385901, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'Assist_Total', value: 278, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'Revives_Teammates_Total', value: 140, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'tp_veh_air_jets', value: 8132, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'tp_veh_air_fa18f', value: 6841, fields: dim('GraniteGauntlet0', 'Season4') },
            // --- Gauntlet, Season3 ---
            { name: 'matches_gm_gntgauntlet', value: 34, fields: dim('GraniteGauntlet0', 'Season3') },
            { name: 'Kills_Total', value: 824, fields: dim('GraniteGauntlet0', 'Season3') },
            // --- a different mode, must be ignored ---
            { name: 'Kills_Total', value: 9999, fields: dim('Conquest0', 'Season4') },
            // --- lifetime/global row, must be ignored ---
            { name: 'Kills_Total', value: 12345, fields: [{ name: 'global', value: 'global' }] },
            // --- a field with no value, must be ignored ---
            { name: 'broken_field', fields: dim('GraniteGauntlet0', 'Season4') },
          ],
        },
      ],
    },
  ],
};
