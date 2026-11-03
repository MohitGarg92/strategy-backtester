// data.js — turns the text of a CSV file into a clean list of { date, close } rows.
//
// It understands the common layouts:
//   1. Yahoo Finance download:  Date,Open,High,Low,Close,Adj Close,Volume
//   2. Python yfinance output:  extra header rows ("Price", "Ticker", "Date") above the data
//   3. niftyindices.com style:  dates like "01 Jan 2026" or "01-01-2026"
// It looks for a column named exactly "Close" and ignores everything else.

function toIsoDate(text) {
  const t = text.trim();

  // Already YYYY-MM-DD (also accepts "2026-10-30 00:00:00")
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD-MM-YYYY or DD/MM/YYYY (the usual Indian order)
  const dmy = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

  // "01 Jan 2026", "Oct 30, 2026" and similar
  const parsed = new Date(t);
  if (!isNaN(parsed.getTime()) && /[A-Za-z]{3}/.test(t)) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null; // not a date, so this row is a header or junk
}

// Splits one CSV line into cells, keeping commas that sit inside quotes
// (some sites write numbers like "22,964.50").
function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim() !== '');
  let closeCol = -1;
  let dateCol = 0; // most files keep the date first
  const byDate = new Map(); // a Map also removes duplicate dates for us

  for (const line of lines) {
    const cells = splitCsvLine(line);

    // Find the header row that contains the "Close" column.
    if (closeCol === -1) {
      const idx = cells.findIndex(c => c.toLowerCase() === 'close');
      if (idx !== -1) {
        closeCol = idx;
        // If the header names a date column (some files put "Index Name" first), use it.
        const d = cells.findIndex(c => ['date', 'timestamp'].includes(c.toLowerCase()));
        if (d !== -1) dateCol = d;
      }
      continue; // header rows never contain data
    }

    const date = toIsoDate(cells[dateCol] || '');
    const close = parseFloat((cells[closeCol] || '').replace(/,/g, ''));
    if (date && Number.isFinite(close) && close > 0) {
      byDate.set(date, close);
    }
  }

  if (closeCol === -1) {
    throw new Error('Could not find a column named "Close" in this file.');
  }

  const rows = [...byDate.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => (a.date < b.date ? -1 : 1)); // oldest first

  if (rows.length < 2) {
    throw new Error('Found fewer than 2 valid price rows. Check the file format.');
  }
  return rows;
}

if (typeof module !== 'undefined') module.exports = { parseCsv, toIsoDate };
