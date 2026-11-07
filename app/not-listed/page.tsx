import { getUnresolved } from '@/lib/data';
import { NotListed } from '@/components/NotListed';

// A literal, as Next.js requires; it is BOARD_REVALIDATE_SEC in lib/data.
export const revalidate = 60;

export default async function Page() {
  return <NotListed entries={await getUnresolved()} />;
}
