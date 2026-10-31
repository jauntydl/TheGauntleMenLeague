import { RatingExplainer } from '@/components/RatingExplainer';
import { getMeta } from '@/lib/data';
import { weekOfSeason } from '@/lib/rating';

export const revalidate = 3600;

export default function Page() {
  // As of the last build, like everything else on the board.
  const meta = getMeta();
  const week = meta.seasonStart ? weekOfSeason(new Date(meta.seasonStart), new Date(meta.builtAt)) : null;
  return <RatingExplainer confidenceGames={meta.confidenceGames} weekOfSeason={week} />;
}
