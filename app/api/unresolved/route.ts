import { getUnresolved } from '@/lib/data';

export async function GET(): Promise<Response> {
  return Response.json(await getUnresolved());
}
