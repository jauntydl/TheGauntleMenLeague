import { RatingExplainer } from '@/components/RatingExplainer';
import { getMeta } from '@/lib/data';
import { weekOfSeason } from '@/lib/rating';

// A literal, as Next.js requires; it is BOARD_REVALIDATE_SEC in lib/data.
export const revalidate = 60;

export default async function Page() {
  // As of the last build, like everything else on the board.
  const meta = await getMeta();
  const week = meta.seasonStart ? weekOfSeason(new Date(meta.seasonStart), new Date(meta.builtAt)) : null;
  return <RatingExplainer confidenceGames={meta.confidenceGames} weekOfSeason={week} />;
}
