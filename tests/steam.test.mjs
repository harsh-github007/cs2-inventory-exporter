// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProfileInput, resolveVanity, fetchInventory, toItem, SteamError } from '../lib/steam.mjs';
import { toCSV } from '../lib/csv.mjs';

const ID = '76561198000000001';

// A small response in the shape steamcommunity.com/inventory returns.
const ak = {
  classid: '310776560', instanceid: '302028390', tradable: 1, marketable: 1,
  name: 'StatTrak™ AK-47 | Redline', market_hash_name: 'StatTrak™ AK-47 | Redline (Field-Tested)',
  type: 'StatTrak™ Classified Rifle', icon_url: 'abc123',
  actions: [{ name: 'Inspect in Game...', link: 'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S%owner_steamid%A%assetid%D123' }],
  tags: [
    { category: 'Type', localized_tag_name: 'Rifle' },
    { category: 'Weapon', localized_tag_name: 'AK-47' },
    { category: 'ItemSet', localized_tag_name: 'The Phoenix Collection' },
    { category: 'Quality', localized_tag_name: 'StatTrak™' },
    { category: 'Rarity', localized_tag_name: 'Classified', color: 'd32ce6' },
    { category: 'Exterior', localized_tag_name: 'Field-Tested' },
  ],
};
const caseItem = {
  classid: '1', instanceid: '0', tradable: 0, marketable: 1,
  market_hash_name: 'Kilowatt Case', type: 'Base Grade Container',
  owner_descriptions: [{ value: 'Tradable After Oct 06, 2026 (7:00:00) GMT' }],
  tags: [{ category: 'Type', localized_tag_name: 'Container' }, { category: 'Rarity', localized_tag_name: 'Base Grade', color: 'b0c3d9' }],
};

function res(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => body };
}
function mockFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [pattern, reply] of routes) if (url.includes(pattern)) return typeof reply === 'function' ? reply(url) : reply;
    throw new Error('unexpected fetch ' + url);
  };
  fn.calls = calls;
  return fn;
}

test('parses every common way of pasting a profile', () => {
  assert.deepEqual(parseProfileInput(`https://steamcommunity.com/profiles/${ID}/`), { steamId: ID });
  assert.deepEqual(parseProfileInput(`steamcommunity.com/profiles/${ID}/inventory/#730`), { steamId: ID });
  assert.deepEqual(parseProfileInput('https://steamcommunity.com/id/s1mple/?l=english'), { vanity: 's1mple' });
  assert.deepEqual(parseProfileInput('  s1mple  '), { vanity: 's1mple' });
  assert.deepEqual(parseProfileInput(ID), { steamId: ID });
  assert.equal(parseProfileInput(''), null);
  assert.equal(parseProfileInput('https://steamcommunity.com/profiles/123'), null);
  assert.equal(parseProfileInput('not a profile!'), null);
});

test('resolves a custom URL without an API key through the profile XML', async () => {
  const f = mockFetch([['/id/s1mple/?xml=1', res(200, `<profile><steamID64>${ID}</steamID64></profile>`)]]);
  assert.equal(await resolveVanity('s1mple', { fetchImpl: f }), ID);
});

test('reports an unknown custom URL clearly', async () => {
  const f = mockFetch([['?xml=1', res(200, '<response><error>The specified profile could not be found.</error></response>')]]);
  await assert.rejects(resolveVanity('nobody', { fetchImpl: f }), (e) => e instanceof SteamError && e.status === 404);
});

test('follows pagination and joins assets to descriptions', async () => {
  const page1 = { success: 1, total_inventory_count: 3, more_items: 1, last_assetid: '11',
    assets: [{ assetid: '10', classid: ak.classid, instanceid: ak.instanceid, amount: '1' }, { assetid: '11', classid: '1', instanceid: '0', amount: '1' }],
    descriptions: [ak, caseItem] };
  const page2 = { success: 1, total_inventory_count: 3,
    assets: [{ assetid: '12', classid: '1', instanceid: '0', amount: '1' }], descriptions: [caseItem] };
  const f = mockFetch([['start_assetid=11', res(200, page2)], [`/inventory/${ID}/730/2`, res(200, page1)]]);
  const out = await fetchInventory(ID, { fetchImpl: f });
  assert.equal(f.calls.length, 2);
  assert.equal(out.total, 3);
  assert.deepEqual(out.items.map((i) => i.name), ['StatTrak™ AK-47 | Redline (Field-Tested)', 'Kilowatt Case', 'Kilowatt Case']);
});

test('maps Steam errors to messages a user can act on', async () => {
  for (const [status, code] of [[403, 'private'], [429, 'rate_limited'], [500, 'upstream']]) {
    const f = mockFetch([['/inventory/', res(status, null)]]);
    await assert.rejects(fetchInventory(ID, { fetchImpl: f }), (e) => e.code === code);
  }
  const empty = mockFetch([['/inventory/', res(200, null)]]); // Steam sends 200 + null for some private inventories
  await assert.rejects(fetchInventory(ID, { fetchImpl: empty }), (e) => e.code === 'private');
});

test('an empty inventory is a result, not an error', async () => {
  const f = mockFetch([['/inventory/', res(200, { success: 1, total_inventory_count: 0 })]]);
  const out = await fetchInventory(ID, { fetchImpl: f });
  assert.equal(out.items.length, 0);
});

test('flattens an item with rarity, wear, collection, trade hold and inspect link', () => {
  const item = toItem({ assetid: '10', classid: ak.classid, instanceid: ak.instanceid, amount: '1' }, ak, ID);
  assert.equal(item.weapon, 'AK-47');
  assert.equal(item.exterior, 'Field-Tested');
  assert.equal(item.rarity, 'Classified');
  assert.equal(item.rarityColor, '#d32ce6');
  assert.equal(item.collection, 'The Phoenix Collection');
  assert.equal(item.tradable, true);
  assert.match(item.inspectLink, new RegExp(`S${ID}A10D123$`));
  assert.match(item.marketUrl, /listings\/730\/StatTrak/);
  const held = toItem({ assetid: '11', classid: '1', instanceid: '0' }, caseItem, ID);
  assert.equal(held.tradable, false);
  assert.match(held.tradeHold, /Tradable After Oct 06, 2026/);
});

test('CSV quotes commas, blocks formulas, and keeps a BOM for Excel', () => {
  const csv = toCSV([{ name: 'Sticker | Team, "Pro"', type: '=HYPERLINK("x")', tradable: true, amount: 1 }]);
  assert.ok(csv.startsWith('﻿Name,Type,'));
  const row = csv.split('\r\n')[1];
  assert.ok(row.startsWith('"Sticker | Team, ""Pro""","\'=HYPERLINK(""x"")"'));
  assert.ok(row.includes(',Yes,'));
});
