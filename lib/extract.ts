import type { RawResponse, RawPlayerIds, StatSlice } from './types';
import { boardKey, modesForSeason } from './modes';

/**
 * Flatten a raw payload into one StatSlice per board — per season and mode the
 * season is ranked on: Gauntlet through Season 4, Rapid Royale Trio and Solo
 * after. Keyed by board key (Season5, Season5-solo); see boardKey.
 *
 * The API returns a fact table: each entry carries its dimensions in `fields`,
 * either {GameMode, Season} or {global: 'global'} for lifetime totals. We keep
 * only rows dimensioned by a Season and by that season's GameMode.
 *
 * Values are copied verbatim. Vehicle fields nest (tp_veh_air_jets already
 * contains tp_veh_air_fa18f and friends), so summing anything here would
 * double-count.
 */
export function extractSlices(raw: RawResponse): Map<string, StatSlice> {
  const out = new Map<string, StatSlice>();
  const stats = raw.playerStats?.[0];
  if (!stats) return out;

  for (const category of stats.categories ?? []) {
    for (const field of category.catFields ?? []) {
      if (typeof field.value !== 'number') continue;

      let gameMode: string | undefined;
      let season: string | undefined;
      for (const d of field.fields ?? []) {
        if (d.name === 'GameMode') gameMode = d.value;
        else if (d.name === 'Season') season = d.value;
      }

      // PLACEHOLDER is an API sentinel, not a season anyone played — it
      // would otherwise surface as a season tab on the board.
      if (!season || season === 'PLACEHOLDER') continue;
      const mode = modesForSeason(season).find((m) => m.gameMode === gameMode);
      if (!mode) continue;

      const key = boardKey(season, mode);
      let slice = out.get(key);
      if (!slice) {
        slice = {};
        out.set(key, slice);
      }
      slice[field.name] = field.value;
    }
  }

  return out;
}

export function readPlayerIds(raw: RawResponse): RawPlayerIds | null {
  return raw.playerStats?.[0]?.player ?? null;
}

/**
 * True when the raw payload carries any stat data at all — at least one
 * category with a non-empty `catFields` array, for ANY GameMode, not just
 * Gauntlet. A member who has gone private returns a `player` block (so
 * `readPlayerIds` still succeeds) but a `categories` array whose entries
 * have no `catFields` key at all. That's the only shape this returns false
 * for; a member who plays only e.g. Conquest has real catFields and must
 * still count as "responded" here — they simply have no Gauntlet slice,
 * which is a separate, already-handled case (buildBoard just omits them).
 */
export function hasStatData(raw: RawResponse): boolean {
  const categories = raw.playerStats?.[0]?.categories ?? [];
  return categories.some((c) => (c.catFields?.length ?? 0) > 0);
}
