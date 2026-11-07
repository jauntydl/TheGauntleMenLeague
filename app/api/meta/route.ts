import { getMeta } from '@/lib/data';

export async function GET(): Promise<Response> {
  return Response.json(await getMeta());
}
