# CS2 Inventory Exporter

Export any public Counter-Strike 2 inventory to a CSV file, with item names, wear, rarity, collection and trade status.

**Live app:** https://cs2-inventory-exporter-auxo.vercel.app/

![Collector workspace with the sample inventory](docs/screenshot.png)

A warm gray collector workspace built with Next.js, React, Motion, and Phosphor icons. Open a public inventory or try the labeled sample collection first.

## Features

- **Accepts any profile format:** `steamcommunity.com/id/name` links, `/profiles/7656…` links, a bare SteamID64, or just the custom URL name.
- **Full item details:** market name, type, weapon, exterior, rarity, StatTrak™/Souvenir quality, collection, tradable and marketable flags, trade-hold date, asset IDs, a Steam Market link and an in-game inspect link.
- **Explore your collection:** switch between artwork cards and a compact list; search by name or collection; filter by rarity or tradability; sort by inventory order, rarity, or name; and group duplicates for a cleaner preview. Clear active filters in one click.
- **Inspect an item:** open its details, collection, quantity, trade status, and Steam Market link. The dialog supports keyboard navigation and Escape.
- **Try it first:** the sample collection uses real item artwork and illustrative inventory data. It needs no Steam profile and supports CSV export for testing.
- **Considered motion:** short entrance, rearrangement, and detail transitions respect your system’s reduced-motion preference. The layout adapts to mobile screens.
- **Spreadsheet-safe CSV:** UTF-8 with a byte-order mark so Excel shows ★ and ™ correctly. Cells that start with `=`, `+`, `-` or `@` are escaped so they can't run as formulas. You can download everything or only the filtered rows.
- **Clear errors:** private inventories come with instructions for making them public. Unknown profiles and Steam rate limits each get their own message.
- **No API key required.**

## How it works

`POST /api/get-inventory` with `{ "profile": "…" }`:

1. **Parse** the input into a SteamID64 or a custom URL name (`lib/steam.mjs → parseProfileInput`).
2. **Resolve** custom URLs through the public profile XML. If `STEAM_API_KEY` is set, it uses `ISteamUser/ResolveVanityURL` first.
3. **Fetch** `steamcommunity.com/inventory/{steamid}/730/2`, following `last_assetid` pagination 2,000 items at a time.
4. **Join** each asset to its description and flatten the result into one row per item.

Responses are cached in memory for two minutes to stay under Steam's rate limit. The CSV is built in the browser (`lib/csv.mjs`), with full and filtered export options. Duplicate grouping changes only the preview: CSV files retain one row per asset and its quantity.

> **Why not the Steam Web API?** Earlier versions called `IEconItems_730/GetPlayerItems`. Valve has retired that endpoint for CS2 and it now answers `410 Gone`. It also only ever returned numeric definition indexes, not item names.

## Running locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 8 tests, no network access needed
npm run lint
npm run build      # production build
npm run start      # serve the production build
```

`STEAM_API_KEY` is optional. Copy `.env.example` to `.env.local` if you want to use it.

## Deploying

The live app runs on Vercel. To deploy your own copy, import the repository on [Vercel](https://vercel.com/new); no configuration is needed. Pushes to `main` redeploy automatically.

Steam rate-limits inventory requests per IP address, and shared hosting IPs hit that limit sooner. If users regularly see the rate-limit message, deploy to a platform with a dedicated outbound IP or add a longer-lived cache such as Vercel KV.

## Project layout

```
app/page.js                     profile form, grid/list preview, filters, item dialog, export
app/globals.css                 responsive styling and motion preferences
app/api/get-inventory/route.js  API route: validation, caching, error mapping
lib/steam.mjs                   input parsing, vanity lookup, paginated fetch, item mapping
lib/csv.mjs                     CSV columns and escaping
lib/demo.json                   clearly labeled illustrative sample inventory
public/items/                   sample artwork and source attribution
tests/steam.test.mjs            node:test suite with mocked Steam responses
```

## Limitations

- Only public inventories can be read. That is a Steam restriction.
- The interface previews up to 120 rows. CSV exports include all assets matching the selected export scope.
- Prices are not included. Steam's price endpoint is heavily rate-limited and would make large inventories slow to export.
- Storage Unit contents are not visible through this endpoint.

Sample item artwork belongs to Valve; see [artwork sources](public/items/SOURCES.md). The MIT license applies to the project code.

Not affiliated with Valve Corporation or Steam.

## License

MIT © Harsh Raj
