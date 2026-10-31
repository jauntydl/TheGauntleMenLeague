#!/usr/bin/env tsx
/**
 * Re-rank the committed board without touching the API — for a change to the
 * rating alone (a weight, CONFIDENCE_GAMES_PER_WEEK). Reads data/board.json,
 * runs the current season's boards through rankPlayers again with the K its
 * own launch date and builtAt give, and writes data/ back. builtAt is kept,
 * since no stat was re-read, and archived seasons are untouched.
 *
 *   npm run data:rerank
 */
import { readFileSync } from 'node:fs';
import { rerankBoard } from '../lib/pipeline';
import { writeBoardFiles } from './write';
import type { BoardFile } from '../lib/types';

const previous: BoardFile = JSON.parse(readFileSync('data/board.json', 'utf8'));
const board = rerankBoard(previous);
console.log(
  `${board.meta.currentSeason}: re-ranked with K = ${board.meta.confidenceGames} (was ${previous.meta.confidenceGames ?? 'unset'})`,
);
writeBoardFiles(board);
