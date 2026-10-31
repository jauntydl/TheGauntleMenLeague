import { writeFileSync, mkdirSync } from 'node:fs';
import type { BoardFile } from '../lib/types';

/** Write a board to data/ — shared by the build and the re-rank so the file set cannot drift. */
export function writeBoardFiles(board: BoardFile): void {
  mkdirSync('data', { recursive: true });

  // Single app-facing artifact: API routes import this statically, so no
  // filesystem access is needed at request time on Vercel.
  writeFileSync('data/board.json', JSON.stringify(board, null, 2) + '\n');

  // Per-season files as well, so day-to-day diffs stay readable in git history.
  for (const [season, rows] of Object.entries(board.seasons)) {
    writeFileSync(
      `data/${season.toLowerCase()}.json`,
      JSON.stringify({ season, rows, provisional: board.provisional[season] ?? [] }, null, 2) + '\n',
    );
  }
  writeFileSync('data/unresolved.json', JSON.stringify(board.unresolved, null, 2) + '\n');
  writeFileSync('data/meta.json', JSON.stringify(board.meta, null, 2) + '\n');

  console.log('Wrote data/board.json and per-season files');
}
