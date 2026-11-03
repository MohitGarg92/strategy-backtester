// app.js — connects the page to the parser (data.js), engine (engine.js)
// and strategies (strategies.js). No trading logic lives here.

const els = {
  file: document.getElementById('csv-file'),
  demo: document.getElementById('demo-btn'),
  status: document.getElementById('data-status'),
  select: document.getElementById('strategy-select'),
  params: document.getElementById('param-inputs'),
  cost: document.getElementById('cost'),
  cashRate: document.getElementById('cash-rate'),
  period: document.getElementById('period'),
  start: document.getElementById('start-date'),
  end: document.getElementById('end-date'),
  note: document.getElementById('range-note'),
  error: document.getElementById('error'),
  run: document.getElementById('run-btn'),
  results: document.getElementById('results'),
  summary: document.getElementById('summary'),
  cashTh: document.getElementById('cash-th'),
  metricsBody: document.getElementById('metrics-body'),
  tradesBody: document.getElementById('trades-body')
};

let allRows = null;        // every day loaded from the CSV: [{date, close}]
let hasRun = false;        // after the first run, changing a setting re-runs automatically
let charts = {};           // Chart.js objects, kept so they can be destroyed before redrawing

// ---------- small helpers ----------

const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const price = n => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const pct = n => (n > 0 ? '+' : '') + n.toFixed(1) + '%';
const cls = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function showError(message) { els.error.textContent = message || ''; }

// ---------- loading data ----------

function setData(rows, label) {
  allRows = rows;
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;

  // The date boxes can only pick days inside the loaded file.
  for (const input of [els.start, els.end]) { input.min = first; input.max = last; }
  els.period.value = 'all';
  applyQuickPick('all');

  els.status.textContent =
    `${label}: ${rows.length.toLocaleString('en-IN')} days, ${first} to ${last}`;
  els.status.classList.add('ok');
  els.run.disabled = false;
  showError('');
  if (hasRun) runAndRender();
}

els.file.addEventListener('change', () => {
  const file = els.file.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      setData(parseCsv(String(reader.result)), file.name);
    } catch (err) {
      allRows = null;
      els.run.disabled = true;
      els.status.classList.remove('ok');
      els.status.textContent = 'Could not read that file.';
      showError(err.message);
    }
  };
  reader.readAsText(file);
  // Clear the picker so choosing the same file again (for example after the demo data) still works.
  els.file.value = '';
});

// Random-walk prices with slow drifting trends, only so the page can be tried without a file.
function makeDemoData() {
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const normal = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

  const rows = [];
  const day = new Date(Date.UTC(2016, 10, 1));
  let p = 8500;
  let drift = 0.0004;
  while (rows.length < 2600) {
    day.setUTCDate(day.getUTCDate() + 1);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;               // skip weekends
    if (rows.length % 120 === 0) drift = (rand() - 0.4) * 0.0012; // trend changes every ~6 months
    p *= 1 + drift + normal() * 0.009;
    rows.push({ date: day.toISOString().slice(0, 10), close: Math.round(p * 100) / 100 });
  }
  return rows;
}

els.demo.addEventListener('click', () => setData(makeDemoData(), 'Demo data (not real)'));

// ---------- strategy controls ----------

function currentStrategy() { return STRATEGIES[els.select.value]; }

function buildParamInputs() {
  els.params.innerHTML = '';
  for (const p of currentStrategy().params) {
    const label = document.createElement('label');
    label.textContent = p.label;
    const input = document.createElement('input');
    input.type = 'number';
    input.id = 'param-' + p.key;
    input.value = p.default;
    input.min = p.min;
    input.max = p.max;
    input.step = 1;
    input.addEventListener('change', () => { if (hasRun) runAndRender(); });
    label.appendChild(input);
    els.params.appendChild(label);
  }
}

for (const [key, s] of Object.entries(STRATEGIES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = s.label;
  els.select.appendChild(opt);
}
els.select.addEventListener('change', () => { buildParamInputs(); if (hasRun) runAndRender(); });
els.cost.addEventListener('change', () => { if (hasRun) runAndRender(); });
els.cashRate.addEventListener('change', () => { if (hasRun) runAndRender(); });
buildParamInputs();

function readParams() {
  const values = {};
  for (const p of currentStrategy().params) {
    const v = Number(document.getElementById('param-' + p.key).value);
    if (!Number.isInteger(v) || v < p.min || v > p.max) {
      throw new Error(`${p.label} must be a whole number from ${p.min} to ${p.max}.`);
    }
    values[p.key] = v;
  }
  const problem = currentStrategy().check(values);
  if (problem) throw new Error(problem);
  return values;
}

// ---------- period: quick pick and custom dates ----------

// Fills the two date boxes for the quick-pick choices.
function applyQuickPick(kind) {
  if (!allRows) return;
  const n = allRows.length;
  const split = Math.floor(n * 0.7);
  let from = 0, to = n - 1;
  if (kind === 'train') to = split - 1;
  if (kind === 'test') from = split;
  els.start.value = allRows[from].date;
  els.end.value = allRows[to].date;
}

els.period.addEventListener('change', () => {
  if (els.period.value !== 'custom') applyQuickPick(els.period.value);
  if (hasRun) runAndRender();
});

// Typing or picking a date switches the quick pick to "Custom dates".
function onDateEdited() {
  els.period.value = 'custom';
  if (hasRun) runAndRender();
}
els.start.addEventListener('change', onDateEdited);
els.end.addEventListener('change', onDateEdited);

// Turns the two dates into row positions. A date with no data moves to the nearest
// day that has data: the start moves forward, the end moves backward.
function dateRangeIndices() {
  const n = allRows.length;
  const startText = els.start.value || allRows[0].date;
  const endText = els.end.value || allRows[n - 1].date;
  if (startText > endText) throw new Error('The start date must be before the end date.');

  const from = allRows.findIndex(r => r.date >= startText);
  let to = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (allRows[i].date <= endText) { to = i; break; }
  }
  if (from === -1 || to === -1 || from > to) {
    throw new Error(`There is no data between those dates. The file covers ${allRows[0].date} to ${allRows[n - 1].date}.`);
  }
  return [from, to + 1]; // second number is exclusive, like slice()
}

// ---------- running ----------

function runAndRender() {
  if (!allRows) return;
  try {
    showError('');
    const params = readParams();
    const costPct = Number(els.cost.value);
    if (!(costPct >= 0 && costPct <= 5)) throw new Error('Cost per trade must be between 0 and 5 percent.');
    const cashRatePct = Number(els.cashRate.value);
    if (!(cashRatePct >= 0 && cashRatePct <= 30)) throw new Error('Interest on cash must be between 0 and 30 percent a year.');

    // Signals are worked out on ALL the data so the averages are already "warmed up"
    // when the chosen period starts. The dates only decide which days are scored.
    const closes = allRows.map(r => r.close);
    const signals = currentStrategy().run(closes, params);

    const [from, to] = dateRangeIndices();
    const rows = allRows.slice(from, to);
    if (rows.length < 30) throw new Error('This period has fewer than 30 days of data. Pick a longer period.');

    const options = { costPct, cashRatePct };
    const strat = runBacktest(rows, signals.slice(from, to), options);
    const hold = runBuyAndHold(rows, options);
    const cash = cashRatePct > 0 ? runCashOnly(rows, options) : null;

    renderNote(rows);
    renderSummary(strat, hold, cash, rows, cashRatePct);
    renderMetrics(strat, hold, cash);
    renderTrades(strat.trades);
    renderCharts(rows, strat, hold, cash);
    els.results.hidden = false;
    hasRun = true;
  } catch (err) {
    showError(err.message);
  }
}
els.run.addEventListener('click', runAndRender);

// ---------- showing results ----------

function renderNote(rows) {
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;
  const moved = (els.start.value && els.start.value !== first) || (els.end.value && els.end.value !== last);
  els.note.textContent =
    `Testing ${first} to ${last} (${rows.length.toLocaleString('en-IN')} days with data).` +
    (moved ? ' Your dates were moved to the nearest days that have data.' : '');
}

function renderSummary(strat, hold, cash, rows, cashRatePct) {
  const s = strat.metrics, h = hold.metrics;
  const sEnd = strat.equity[strat.equity.length - 1];
  const hEnd = hold.equity[hold.equity.length - 1];
  const ahead = sEnd >= hEnd;
  els.summary.innerHTML =
    `From ${rows[0].date} to ${rows[rows.length - 1].date} (${s.years.toFixed(1)} years), ₹1,00,000 would have become ` +
    `<b>${inr(sEnd)}</b> with this strategy and <b>${inr(hEnd)}</b> with buy and hold. ` +
    `The strategy finished <b class="${ahead ? 'good' : 'bad'}">${ahead ? 'ahead of' : 'behind'}</b> buy and hold. ` +
    `Its worst fall was ${s.maxDrawdownPct.toFixed(1)}% against ${h.maxDrawdownPct.toFixed(1)}% for buy and hold.` +
    (cash
      ? ` Leaving everything in cash at ${cashRatePct}% a year would have given <b>${inr(cash.equity[cash.equity.length - 1])}</b>.`
      : '');
}

function renderMetrics(strat, hold, cash) {
  const lines = [
    ['Total return', r => [pct(r.metrics.totalReturnPct), cls(r.metrics.totalReturnPct)]],
    ['Yearly growth (CAGR)', r => [pct(r.metrics.cagrPct), cls(r.metrics.cagrPct)]],
    ['Max drawdown', r => [r.metrics.maxDrawdownPct.toFixed(1) + '%', r.metrics.maxDrawdownPct < 0 ? 'neg' : '']],
    ['Final value of ₹1,00,000', r => [inr(r.equity[r.equity.length - 1]), '']],
    ['Number of trades', r => [String(r.metrics.numTrades), '']],
    ['Win rate', r => [r.metrics.winRatePct === null ? 'n/a' : r.metrics.winRatePct.toFixed(0) + '%', '']],
    ['Time invested', r => [r.metrics.timeInvestedPct.toFixed(0) + '%', '']]
  ];
  const columns = cash ? [strat, hold, cash] : [strat, hold];
  els.cashTh.hidden = !cash;
  els.metricsBody.innerHTML = lines.map(([label, cell]) =>
    `<tr><td>${label}</td>` +
    columns.map(r => { const [text, c] = cell(r); return `<td class="${c}">${text}</td>`; }).join('') +
    '</tr>'
  ).join('');
}

function renderTrades(trades) {
  if (!trades.length) {
    els.tradesBody.innerHTML = '<tr><td colspan="5">This strategy made no trades in this period.</td></tr>';
    return;
  }
  els.tradesBody.innerHTML = trades.map(t =>
    `<tr><td>${t.entryDate}</td><td>${t.exitDate}</td>` +
    `<td>${price(t.entryPrice)}</td><td>${price(t.exitPrice)}</td>` +
    `<td class="${cls(t.returnPct)}">${pct(t.returnPct)}</td></tr>`
  ).join('');
}

function baseOptions(yFormat) {
  const text = cssVar('--muted'), grid = cssVar('--line');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: text, usePointStyle: true, boxWidth: 8 } } },
    scales: {
      x: { ticks: { color: text, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
      y: { ticks: { color: text, callback: yFormat }, grid: { color: grid } }
    }
  };
}

function drawChart(key, canvasId, config) {
  if (charts[key]) charts[key].destroy();
  charts[key] = new Chart(document.getElementById(canvasId), config);
}

function renderCharts(rows, strat, hold, cash) {
  const labels = rows.map(r => r.date);
  const accent = cssVar('--accent'), base = cssVar('--base'), muted = cssVar('--muted');
  const good = cssVar('--good'), bad = cssVar('--bad');
  const line = (label, data, color, extra = {}) => ({
    label, data, borderColor: color, backgroundColor: color,
    borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 3, tension: 0, ...extra
  });

  // 1. growth of money (plus a dashed "cash only" line when interest is switched on)
  const equitySets = [
    line('Strategy', strat.equity, accent),
    line('Buy and hold', hold.equity, base)
  ];
  if (cash) equitySets.push(line('Cash only', cash.equity, muted, { borderDash: [6, 4], borderWidth: 1.3 }));
  drawChart('equity', 'equity-chart', {
    type: 'line',
    data: { labels, datasets: equitySets },
    options: baseOptions(v => '₹' + Math.round(v).toLocaleString('en-IN'))
  });

  // 2. price with buy and sell points (null on days with no trade, so only trade days get a marker)
  const index = {};
  rows.forEach((r, i) => { index[r.date] = i; });
  const buys = new Array(rows.length).fill(null);
  const sells = new Array(rows.length).fill(null);
  for (const t of strat.trades) {
    if (index[t.entryDate] !== undefined) buys[index[t.entryDate]] = t.entryPrice;
    if (index[t.exitDate] !== undefined) sells[index[t.exitDate]] = t.exitPrice;
  }
  const marker = (label, data, color, style, rotation) => ({
    label, data, showLine: false, borderColor: color, backgroundColor: color,
    pointStyle: style, rotation, pointRadius: 5, pointHoverRadius: 7, type: 'line'
  });
  drawChart('price', 'price-chart', {
    type: 'line',
    data: { labels, datasets: [
      line('Price', rows.map(r => r.close), muted, { borderWidth: 1.2 }),
      marker('Buy', buys, good, 'triangle', 0),
      marker('Sell', sells, bad, 'triangle', 180)
    ]},
    options: baseOptions(v => v.toLocaleString('en-IN'))
  });

  // 3. drawdown
  drawChart('dd', 'dd-chart', {
    type: 'line',
    data: { labels, datasets: [
      line('Strategy', drawdownSeries(strat.equity), accent),
      line('Buy and hold', drawdownSeries(hold.equity), base)
    ]},
    options: baseOptions(v => v.toFixed(0) + '%')
  });
}
