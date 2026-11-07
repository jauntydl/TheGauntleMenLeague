import { getSeason } from '@/lib/data';

export async function GET(req: Request): Promise<Response> {
  const season = new URL(req.url).searchParams.get('season') ?? undefined;
  const result = await getSeason(season);

  if (!result) {
    return Response.json({ error: 'Unknown season' }, { status: 404 });
  }
  return Response.json(result);
}
