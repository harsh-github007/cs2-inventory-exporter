// Builds the CSV in the browser from the rows the API returns.

export const COLUMNS = [
  ['Name', 'name'],
  ['Type', 'type'],
  ['Category', 'category'],
  ['Weapon', 'weapon'],
  ['Exterior', 'exterior'],
  ['Rarity', 'rarity'],
  ['Quality', 'quality'],
  ['Collection', 'collection'],
  ['Tradable', 'tradable'],
  ['Marketable', 'marketable'],
  ['Trade hold', 'tradeHold'],
  ['Amount', 'amount'],
  ['Asset ID', 'assetId'],
  ['Class ID', 'classId'],
  ['Instance ID', 'instanceId'],
  ['Market URL', 'marketUrl'],
  ['Inspect link', 'inspectLink'],
];

function cell(value) {
  let s = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '');
  // Stop spreadsheet apps from treating text as a formula (CSV injection).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Returns CSV text. The leading BOM makes Excel read ★ and ™ correctly. */
export function toCSV(items, { bom = true } = {}) {
  const lines = [COLUMNS.map(([h]) => h).join(',')];
  for (const item of items) lines.push(COLUMNS.map(([, k]) => cell(item[k])).join(','));
  return (bom ? '﻿' : '') + lines.join('\r\n') + '\r\n';
}
