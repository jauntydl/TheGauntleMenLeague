#!/usr/bin/env tsx
/**
 * Re-rank the committed board without touching the API — for a change to the
 * rating alone (a point value in the ledger, a Gauntlet weight). Reads
 * data/board.json, runs the current season's boards through rankPlayers
 * again, and writes data/ back. builtAt is kept, since no stat was re-read,
 * and archived seasons are untouched.
 *
 *   npm run data:rerank
 */
import { readFileSync } from 'node:fs';
import { rerankBoard } from '../lib/pipeline';
import { writeBoardFiles } from './write';
import type { BoardFile } from '../lib/types';

const previous: BoardFile = JSON.parse(readFileSync('data/board.json', 'utf8'));
const board = rerankBoard(previous);
const season = board.meta.currentSeason;
const counts = Object.keys(board.seasons)
  .filter((k) => k === season || k.startsWith(`${season}-`))
  .map((k) => `${k}: ${board.seasons[k].length} ranked, ${board.provisional[k]?.length ?? 0} provisional`);
console.log(`${season} re-ranked on the points ledger — ${counts.join('; ')}`);
writeBoardFiles(board);
