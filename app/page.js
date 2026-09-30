'use client';

import { useMemo, useState } from 'react';
import { toCSV } from '../lib/csv.mjs';

const RARITY_ORDER = [
  'Contraband', 'Extraordinary', 'Covert', 'Classified', 'Restricted', 'Mil-Spec Grade', 'Mil-Spec',
  'Exotic', 'Remarkable', 'Superior', 'Distinguished', 'Master', 'Exceptional', 'Industrial Grade',
  'High Grade', 'Consumer Grade', 'Base Grade',
];
const rarityRank = (r) => { const i = RARITY_ORDER.indexOf(r); return i === -1 ? RARITY_ORDER.length : i; };
const fmt = (n) => n.toLocaleString('en-US');
const SHOW_MAX = 300;

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function HomePage() {
  const [profile, setProfile] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState('');
  const [tradableOnly, setTradableOnly] = useState(false);
  const [sort, setSort] = useState('inventory');
  const [grouped, setGrouped] = useState(true);

  async function load(e) {
    e.preventDefault();
    if (!profile.trim()) { setError({ message: 'Paste a Steam profile link first.' }); setStatus('error'); return; }
    setStatus('loading'); setError(null);
    try {
      const res = await fetch('/api/get-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.message || 'Something went wrong.'), { code: body.code });
      setData(body); setQuery(''); setRarity(''); setTradableOnly(false); setSort('inventory');
      setStatus('done');
    } catch (err) {
      setError({ message: err.message, code: err.code });
      setStatus('error');
    }
  }

  const stats = useMemo(() => {
    if (!data) return null;
    const items = data.items;
    return {
      total: items.reduce((s, i) => s + i.amount, 0),
      unique: new Set(items.map((i) => i.name)).size,
      tradable: items.filter((i) => i.tradable).length,
      marketable: items.filter((i) => i.marketable).length,
      rarities: [...new Set(items.map((i) => i.rarity).filter(Boolean))].sort((a, b) => rarityRank(a) - rarityRank(b)),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let rows = data.items.filter((i) =>
      (!q || i.name.toLowerCase().includes(q) || i.collection.toLowerCase().includes(q)) &&
      (!rarity || i.rarity === rarity) &&
      (!tradableOnly || i.tradable));
    if (sort === 'rarity') rows = [...rows].sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || a.name.localeCompare(b.name));
    if (sort === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [data, query, rarity, tradableOnly, sort]);

  // Collapse identical items (same name and trade state) into one row with a count.
  const shown = useMemo(() => {
    if (!grouped) return filtered;
    const byKey = new Map();
    for (const i of filtered) {
      const key = `${i.name}|${i.tradable}|${i.tradeHold}`;
      const hit = byKey.get(key);
      if (hit) hit.amount += i.amount;
      else byKey.set(key, { ...i });
    }
    return [...byKey.values()];
  }, [filtered, grouped]);

  const isFiltered = data && filtered.length !== data.items.length;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid place-items-center w-7 h-7 rounded-md bg-accent text-ink-inverse font-mono text-xs">CS</span>
            Inventory Exporter
          </div>
          <a href="https://github.com/harsh-github007/cs2-inventory-exporter" className="btn-ghost">Source →</a>
        </div>
      </header>

      <main className="flex-1">
        <div className="hero-grid border-b border-line">
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12">
          <p className="eyebrow">[ Counter-Strike 2 · Steam inventory ]</p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tighter text-balance max-w-3xl leading-[1.02] sm:text-6xl">
            Every skin, case and sticker, <span className="text-gradient">in one spreadsheet</span>
          </h1>
          <p className="mt-4 text-muted font-light text-lg max-w-2xl">
            Paste a public Steam profile. You get names, wear, rarity, collection and trade status for each item, then a CSV that opens cleanly in Excel or Google Sheets.
          </p>

          <form onSubmit={load} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-3xl">
            <label htmlFor="profile" className="sr-only">Steam profile</label>
            <input
              id="profile"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="steamcommunity.com/id/your-name"
              autoComplete="off"
              spellCheck="false"
              className="flex-1 min-w-0 h-12 px-5 rounded-full bg-surface border border-line font-mono text-sm placeholder:text-faint focus:outline-none focus:border-accent"
              disabled={status === 'loading'}
            />
            <button type="submit" className="btn-accent h-12 px-6" disabled={status === 'loading'}>
              {status === 'loading' ? 'Loading inventory…' : 'Load inventory'}
            </button>
          </form>
          <p className="mt-3 text-sm text-faint">
            Works with <code className="font-mono text-muted">/id/name</code> links, <code className="font-mono text-muted">/profiles/7656…</code> links, a SteamID64, or just the custom URL name.
          </p>

          {status === 'error' && error && <ErrorCard error={error} />}
        </section>
        </div>

        {status === 'loading' && (
          <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16" aria-busy="true">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-md overflow-hidden">
              {[0, 1, 2, 3].map((i) => <div key={i} className="bg-surface h-24 animate-pulse" />)}
            </div>
          </section>
        )}

        {status === 'done' && data && (
          <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16" aria-label="Inventory">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
              <div>
                <p className="eyebrow">Loaded</p>
                <p className="mt-2 font-mono text-sm text-muted">SteamID64 {data.steamId}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isFiltered && (
                  <button className="btn-ghost h-11" onClick={() => download(`cs2_inventory_${data.steamId}_filtered.csv`, toCSV(filtered))}>
                    Download filtered ({fmt(filtered.length)})
                  </button>
                )}
                <button
                  className="btn-accent h-11 px-5"
                  disabled={!data.items.length}
                  onClick={() => download(`cs2_inventory_${data.steamId}.csv`, toCSV(data.items))}
                >
                  Download CSV ({fmt(data.items.length)} rows)
                </button>
              </div>
            </div>

            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-md overflow-hidden">
              <Stat label="Items" value={stats.total} />
              <Stat label="Unique items" value={stats.unique} />
              <Stat label="Tradable now" value={stats.tradable} />
              <Stat label="Marketable" value={stats.marketable} />
            </dl>

            {data.items.length === 0 ? (
              <p className="mt-6 text-muted">This inventory is public but has no CS2 items.</p>
            ) : (
              <>
                <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center">
                  <label htmlFor="q" className="sr-only">Search items</label>
                  <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or collection"
                    className="h-11 md:w-72 px-3 rounded bg-surface border border-line text-sm focus:outline-none focus:border-accent" />
                  <label htmlFor="rarity" className="sr-only">Rarity</label>
                  <select id="rarity" value={rarity} onChange={(e) => setRarity(e.target.value)}
                    className="h-11 px-3 rounded bg-surface border border-line text-sm focus:outline-none focus:border-accent">
                    <option value="">All rarities</option>
                    {stats.rarities.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <label htmlFor="sort" className="sr-only">Sort</label>
                  <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}
                    className="h-11 px-3 rounded bg-surface border border-line text-sm focus:outline-none focus:border-accent">
                    <option value="inventory">Inventory order</option>
                    <option value="rarity">Rarity, highest first</option>
                    <option value="name">Name, A to Z</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm text-muted h-11 cursor-pointer md:ml-auto">
                    <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="w-5 h-5 accent-[#FF4D1A]" />
                    Group duplicates
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted h-11 cursor-pointer">
                    <input type="checkbox" checked={tradableOnly} onChange={(e) => setTradableOnly(e.target.checked)} className="w-5 h-5 accent-[#FF4D1A]" />
                    Tradable only
                  </label>
                </div>

                <ItemList rows={shown.slice(0, SHOW_MAX)} />
                <p className="mt-3 text-sm text-faint">
                  {shown.length > SHOW_MAX
                    ? `Showing the first ${SHOW_MAX} of ${fmt(shown.length)} rows. The CSV includes every item.`
                    : `${fmt(filtered.length)} of ${fmt(data.items.length)} items shown${grouped && shown.length < filtered.length ? ` in ${fmt(shown.length)} rows` : ''}. The CSV has one row per item.`}
                </p>
              </>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-faint">
          <span>Reads public inventories only. Nothing is stored.</span>
          <span>Not affiliated with Valve or Steam.</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="font-mono text-[11px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className="mt-1 text-2xl sm:text-3xl font-medium tracking-tight tabular-nums">{fmt(value)}</dd>
    </div>
  );
}

function ErrorCard({ error }) {
  return (
    <div role="alert" className="mt-6 max-w-3xl rounded-md border border-[#FF4D1A]/40 bg-[#FF4D1A]/10 p-4">
      <p className="font-medium">{error.message}</p>
      {error.code === 'private' && (
        <p className="mt-2 text-sm text-muted">
          On Steam, open your profile, choose <b className="text-ink">Edit Profile → Privacy Settings</b>, and set both <b className="text-ink">My profile</b> and <b className="text-ink">Inventory</b> to Public. Steam can take a few minutes to apply the change.
        </p>
      )}
      {error.code === 'rate_limited' && (
        <p className="mt-2 text-sm text-muted">Steam limits how often an inventory can be read from one server. Results are cached for two minutes after a successful load.</p>
      )}
    </div>
  );
}

function StatusChip({ item }) {
  if (item.tradable) return <span className="chip text-[#22C55E] border-[#22C55E]/40">Tradable</span>;
  if (item.tradeHold) return <span className="chip text-[#F59E0B] border-[#F59E0B]/40" title={item.tradeHold}>Trade hold</span>;
  return <span className="chip text-faint border-line">Not tradable</span>;
}

function ItemList({ rows }) {
  return (
    <div className="mt-4 border border-line rounded-md overflow-hidden">
      {/* table on wider screens */}
      <table className="hidden md:table w-full text-sm">
        <thead className="bg-surface text-left">
          <tr className="font-mono text-[11px] uppercase tracking-wider text-faint">
            <th className="px-4 py-3 font-medium">Item</th>
            <th className="px-4 py-3 font-medium">Rarity</th>
            <th className="px-4 py-3 font-medium">Exterior</th>
            <th className="px-4 py-3 font-medium">Collection</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium"><span className="sr-only">Links</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.assetId} className="border-t border-line hover:bg-surface/60">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon item={i} />
                  <span className="truncate max-w-[22rem]" title={i.name}>{i.name}</span>
                  {i.amount > 1 && <span className="font-mono text-xs text-faint">×{i.amount}</span>}
                </div>
              </td>
              <td className="px-4 py-2.5"><Rarity item={i} /></td>
              <td className="px-4 py-2.5 text-muted">{i.exterior || '—'}</td>
              <td className="px-4 py-2.5 text-muted truncate max-w-[14rem]" title={i.collection}>{i.collection || '—'}</td>
              <td className="px-4 py-2.5"><StatusChip item={i} /></td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {i.marketUrl && <a href={i.marketUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-accent underline-offset-4 hover:underline">Market</a>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* cards on phones */}
      <ul className="md:hidden divide-y divide-line">
        {rows.map((i) => (
          <li key={i.assetId} className="flex gap-3 p-3">
            <Icon item={i} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug break-words">{i.name}{i.amount > 1 && <span className="font-mono text-xs text-faint"> ×{i.amount}</span>}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                <Rarity item={i} />
                {i.exterior && <span className="text-muted">{i.exterior}</span>}
                <StatusChip item={i} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Icon({ item }) {
  return (
    <div className="w-12 h-9 shrink-0 rounded bg-surface border-b-2 grid place-items-center overflow-hidden"
      style={{ borderColor: item.rarityColor || 'transparent' }}>
      {/* Steam's CDN already serves 96px thumbnails, so next/image adds nothing here */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.iconUrl && <img src={item.iconUrl} alt="" loading="lazy" className="max-w-full max-h-full object-contain" />}
    </div>
  );
}

function Rarity({ item }) {
  if (!item.rarity) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="w-2 h-2" style={{ background: item.rarityColor || 'currentColor' }} />
      <span style={{ color: item.rarityColor || undefined }}>{item.rarity}</span>
    </span>
  );
}
