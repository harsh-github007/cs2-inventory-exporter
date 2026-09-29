import { NextResponse } from 'next/server';
import { parseProfileInput, resolveVanity, fetchInventory, SteamError } from '../../../lib/steam.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Short cache so repeat lookups don't burn Steam's rate limit.
const CACHE_MS = 2 * 60 * 1000;
const cache = new Map();

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Send a JSON body like { "profile": "…" }.' }, { status: 400 });
  }

  const parsed = parseProfileInput(body?.profile ?? body?.profileUrl);
  if (!parsed) {
    return NextResponse.json(
      { message: 'Paste a Steam profile link (steamcommunity.com/id/… or /profiles/…), a SteamID64, or a custom URL name.' },
      { status: 400 },
    );
  }

  try {
    const steamId = parsed.steamId ?? (await resolveVanity(parsed.vanity, { apiKey: process.env.STEAM_API_KEY }));

    const hit = cache.get(steamId);
    if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.data);

    const data = await fetchInventory(steamId);
    cache.set(steamId, { at: Date.now(), data });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SteamError) {
      return NextResponse.json({ message: err.message, code: err.code }, { status: err.status });
    }
    console.error('get-inventory failed:', err);
    return NextResponse.json({ message: 'Could not reach Steam. Try again in a minute.' }, { status: 502 });
  }
}
