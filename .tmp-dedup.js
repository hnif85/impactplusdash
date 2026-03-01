const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const src = path.join(process.cwd(), 'docs/base_lineBRI.csv');
const dst = path.join(process.cwd(), 'docs/base_lineBRI_dedup.csv');
if (!fs.existsSync(src)) {
  console.error('Source CSV not found:', src);
  process.exit(1);
}
function normEmail(v){ return (v||'').trim().toLowerCase(); }
function tsToDate(v){ const d = new Date(v); return isNaN(d)? null : d; }
const wb = xlsx.readFile(src, { type:'file' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
const keep = new Map();
for (const row of rows) {
  const email = normEmail(row['Email Address']);
  if (!email) { // keep first occurrence without email
    const key = `__noemail__${keep.size}`;
    keep.set(key, row);
    continue;
  }
  const ts = tsToDate(row['Timestamp']) || new Date(0);
  const prev = keep.get(email);
  if (!prev) {
    keep.set(email, row);
  } else {
    const prevTs = tsToDate(prev['Timestamp']) || new Date(0);
    if (ts >= prevTs) keep.set(email, row); // keep latest
  }
}
const dedupRows = Array.from(keep.values());
const newWb = xlsx.utils.book_new();
const newSheet = xlsx.utils.json_to_sheet(dedupRows);
xlsx.utils.book_append_sheet(newWb, newSheet, 'Sheet1');
xlsx.writeFile(newWb, dst, { bookType:'csv' });
console.log('Done. Original rows:', rows.length, 'Dedup rows:', dedupRows.length, 'Output:', dst);
