import { getBoard } from '@/lib/data';
import { BoardView } from '@/components/BoardView';

// A literal, as Next.js requires; it is BOARD_REVALIDATE_SEC in lib/data.
export const revalidate = 60;

export default async function Page() {
  return <BoardView board={await getBoard()} />;
}
