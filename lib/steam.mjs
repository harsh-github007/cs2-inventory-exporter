// Steam helpers used by the API route. Kept free of Next.js imports so they
// can be unit tested with `node --test`.

const COMMUNITY = 'https://steamcommunity.com';
const CDN = 'https://community.fastly.steamstatic.com/economy/image/';
const PAGE_SIZE = 2000; // largest page the inventory endpoint accepts
const MAX_PAGES = 15;   // 30,000 items is far above any real CS2 inventory

export class SteamError extends Error {
  constructor(message, status = 500, code = 'steam_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Pulls a SteamID64 or vanity name out of whatever the user pasted:
 * full profile URLs (with or without https://, trailing slashes, query strings),
 * a bare 17-digit SteamID64, or a bare custom URL name.
 * Returns { steamId } or { vanity }, or null if nothing usable was found.
 */
export function parseProfileInput(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return null;

  if (/^7656119\d{10}$/.test(input)) return { steamId: input };

  const match = input.match(/steamcommunity\.com\/(profiles|id)\/([^/?#\s]+)/i);
  if (match) {
    const [, kind, value] = match;
    if (kind.toLowerCase() === 'profiles') {
      return /^7656119\d{10}$/.test(value) ? { steamId: value } : null;
    }
    return { vanity: decodeURIComponent(value) };
  }

  // A bare custom URL name: letters, digits, _ and - only.
  if (/^[A-Za-z0-9_-]{2,32}$/.test(input)) return { vanity: input };
  return null;
}

const UA = { 'User-Agent': 'cs2-inventory-exporter (+https://github.com/harsh-github007/cs2-inventory-exporter)' };

/** Turns a custom URL name into a SteamID64. Uses the Web API if a key is set, otherwise the public profile XML. */
export async function resolveVanity(vanity, { apiKey, fetchImpl = fetch } = {}) {
  if (apiKey) {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(apiKey)}&vanityurl=${encodeURIComponent(vanity)}`;
    const res = await fetchImpl(url, { headers: UA });
    if (res.ok) {
      const data = await res.json();
      if (data?.response?.success === 1) return data.response.steamid;
      throw new SteamError(`No Steam profile uses the custom URL “${vanity}”.`, 404, 'not_found');
    }
    // fall through to the XML route if the key is rejected
  }
  const res = await fetchImpl(`${COMMUNITY}/id/${encodeURIComponent(vanity)}/?xml=1`, { headers: UA });
  if (res.status === 429) throw rateLimited();
  if (!res.ok) throw new SteamError('Steam did not respond while looking up that profile. Try again in a minute.', 502, 'upstream');
  const xml = await res.text();
  const id = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
  if (!id) throw new SteamError(`No Steam profile uses the custom URL “${vanity}”.`, 404, 'not_found');
  return id[1];
}

function rateLimited() {
  return new SteamError('Steam is rate-limiting requests right now. Wait a minute and try again.', 429, 'rate_limited');
}

/** Fetches every page of a CS2 inventory (app 730, context 2). */
export async function fetchInventory(steamId, { fetchImpl = fetch } = {}) {
  const assets = [];
  const descriptions = new Map();
  let start;
  let total = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${COMMUNITY}/inventory/${steamId}/730/2?l=english&count=${PAGE_SIZE}${start ? `&start_assetid=${start}` : ''}`;
    const res = await fetchImpl(url, { headers: UA });

    if (res.status === 403 || res.status === 401) {
      throw new SteamError('This inventory is private. The owner needs to set Inventory to Public in Steam privacy settings.', 403, 'private');
    }
    if (res.status === 429) throw rateLimited();
    if (res.status === 400 || res.status === 404) {
      throw new SteamError('Steam could not find a CS2 inventory for this profile.', 404, 'not_found');
    }
    if (!res.ok) throw new SteamError(`Steam returned an error (${res.status}). Try again in a minute.`, 502, 'upstream');

    const data = await res.json().catch(() => null);
    if (!data) throw new SteamError('This inventory is private. The owner needs to set Inventory to Public in Steam privacy settings.', 403, 'private');
    if (data.success !== 1 && data.success !== true) {
      throw new SteamError(data.error || 'Steam could not load this inventory.', 502, 'upstream');
    }

    total = data.total_inventory_count ?? total;
    for (const a of data.assets ?? []) assets.push(a);
    for (const d of data.descriptions ?? []) descriptions.set(`${d.classid}_${d.instanceid}`, d);

    if (!data.more_items || !data.last_assetid) break;
    start = data.last_assetid;
  }

  return { steamId, total, items: assets.map((a) => toItem(a, descriptions.get(`${a.classid}_${a.instanceid}`), steamId)) };
}

function tag(desc, category) {
  const t = desc?.tags?.find((x) => x.category === category);
  if (!t) return { name: '', color: '' };
  return { name: t.localized_tag_name ?? t.name ?? '', color: t.color ? `#${t.color}` : '' };
}

/** Flattens one asset + its description into a plain row. */
export function toItem(asset, desc, steamId) {
  const rarity = tag(desc, 'Rarity');
  const hold = (desc?.owner_descriptions ?? [])
    .map((d) => d.value || '')
    .find((v) => /Tradable After|Trade Protected|Tradable\/Marketable After/i.test(v)) || '';
  const inspectRaw = desc?.actions?.find((a) => /inspect/i.test(a.name || ''))?.link || '';
  const inspect = inspectRaw.replace('%owner_steamid%', steamId).replace('%assetid%', asset.assetid);
  const name = desc?.market_hash_name || desc?.market_name || desc?.name || `Unknown item (class ${asset.classid})`;

  return {
    name,
    type: desc?.type || '',
    category: tag(desc, 'Type').name,
    weapon: tag(desc, 'Weapon').name,
    exterior: tag(desc, 'Exterior').name,
    rarity: rarity.name,
    rarityColor: rarity.color,
    quality: tag(desc, 'Quality').name,
    collection: tag(desc, 'ItemSet').name,
    tradable: desc?.tradable === 1,
    marketable: desc?.marketable === 1,
    tradeHold: hold.replace(/<[^>]+>/g, '').trim(),
    amount: Number(asset.amount || 1),
    assetId: asset.assetid,
    classId: asset.classid,
    instanceId: asset.instanceid,
    iconUrl: desc?.icon_url ? `${CDN}${desc.icon_url}/96fx96f` : '',
    marketUrl: desc?.marketable === 1 ? `${COMMUNITY}/market/listings/730/${encodeURIComponent(name)}` : '',
    // newer inspect links carry other %placeholders% we cannot fill; leave those out
    inspectLink: inspect && !/%[a-z_]+[a-z0-9_:]*%/i.test(inspect) ? inspect : '',
  };
}
