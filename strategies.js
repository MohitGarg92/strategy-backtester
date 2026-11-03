// strategies.js — each strategy is one small function.
// It receives the list of closing prices and a settings object, and returns
// an array of signals (1 = be invested, 0 = stay in cash), one per day.
// To add a new strategy: write a function like smaCross, then add it to STRATEGIES.

// Simple moving average: the average of the last n closing prices.
// Returns null for the first n-1 days (not enough history yet).
function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// Invested while the fast average is above the slow average.
function smaCross(closes, { fast, slow }) {
  const fastMa = sma(closes, fast);
  const slowMa = sma(closes, slow);
  return closes.map((_, i) =>
    fastMa[i] !== null && slowMa[i] !== null && fastMa[i] > slowMa[i] ? 1 : 0
  );
}
function wma(values, n) {
  const out = new Array(values.length).fill(null);
  const weightSum = (n * (n + 1)) / 2;          // 1+2+...+n
  for (let i = n - 1; i < values.length; i++) {
    let total = 0;
    for (let k = 0; k < n; k++) {
      total += values[i - n + 1 + k] * (k + 1); // oldest day gets weight 1, newest gets n
    }
    out[i] = total / weightSum;
  }
  return out;
}

function wmaCross(closes, { fast, slow }) {
  const fastMa = wma(closes, fast);
  const slowMa = wma(closes, slow);
  return closes.map((_, i) =>
    fastMa[i] !== null && slowMa[i] !== null && fastMa[i] > slowMa[i] ? 1 : 0
  );
}

function ema(values, n) {
  const out = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const alpha = 2 / (n + 1);
  let seed = 0;
  for (let i = 0; i < n; i++) seed += values[i];
  out[n - 1] = seed / n;                       // starting point: simple average
  for (let i = n; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function emaCross(closes, { fast, slow }) {
  const fastMa = ema(closes, fast);
  const slowMa = ema(closes, slow);
  return closes.map((_, i) =>
    fastMa[i] !== null && slowMa[i] !== null && fastMa[i] > slowMa[i] ? 1 : 0
  );
}
function breakout(closes, { entry, exit, buffer, confirm, trend }) {
  const n = closes.length;
  const signals = new Array(n).fill(0);
  const trendMa = trend > 0 ? sma(closes, trend) : null;
  let invested = 0;
  let pendingLevel = null;   // the breakout level we are waiting to see held
  let daysHeld = 0;

  for (let i = 0; i < n; i++) {
    if (i < Math.max(entry, exit)) continue;      // not enough history yet

    // Highest and lowest close of the PREVIOUS days (today is not included).
    let high = -Infinity, low = Infinity;
    for (let k = i - entry; k < i; k++) high = Math.max(high, closes[k]);
    for (let k = i - exit; k < i; k++) low = Math.min(low, closes[k]);

    if (invested === 0) {
      if (pendingLevel === null) {
        const level = high * (1 + buffer / 100);
        const trendOk = trendMa === null || (trendMa[i] !== null && closes[i] > trendMa[i]);
        if (closes[i] > level && trendOk) { pendingLevel = level; daysHeld = 1; }
      } else if (closes[i] > pendingLevel) {
        daysHeld++;
      } else {
        pendingLevel = null; daysHeld = 0;         // fell back: it was a false breakout
      }
      if (pendingLevel !== null && daysHeld >= confirm) {
        invested = 1; pendingLevel = null; daysHeld = 0;
      }
    } else if (closes[i] < low) {
      invested = 0;
    }
    signals[i] = invested;
  }
  return signals;
}
function rsi(values, n) {
  const out = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  const toRsi = (g, l) => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {                  // first n changes: plain averages
    const change = values[i] - values[i - 1];
    if (change > 0) gain += change; else loss -= change;
  }
  let avgGain = gain / n, avgLoss = loss / n;
  out[n] = toRsi(avgGain, avgLoss);
  for (let i = n + 1; i < values.length; i++) {   // then a running average, like the EMA
    const change = values[i] - values[i - 1];
    avgGain = (avgGain * (n - 1) + (change > 0 ? change : 0)) / n;
    avgLoss = (avgLoss * (n - 1) + (change < 0 ? -change : 0)) / n;
    out[i] = toRsi(avgGain, avgLoss);
  }
  return out;
}

function rsiStrategy(closes, { period, buyBelow, sellAbove }) {
  const r = rsi(closes, period);
  const signals = new Array(closes.length).fill(0);
  let invested = 0;
  for (let i = 0; i < closes.length; i++) {
    if (r[i] !== null) {
      if (invested === 0 && r[i] < buyBelow) invested = 1;
      else if (invested === 1 && r[i] > sellAbove) invested = 0;
    }
    signals[i] = invested;
  }
  return signals;
}
// The registry the page reads to build its dropdown and settings boxes.
const STRATEGIES = {
  smaCross: {
    label: 'Moving average crossover',
    run: smaCross,
    params: [
      { key: 'fast', label: 'Fast average (days)', default: 10, min: 2, max: 200 },
      { key: 'slow', label: 'Slow average (days)', default: 30, min: 3, max: 400 }
    ],
    check: p => (p.fast < p.slow ? null : 'Fast average must be smaller than slow average.')
  },
  wmaCross: {
    label: 'Weighted moving average crossover',
    run: wmaCross,
    params: [
      { key: 'fast', label: 'Fast average (days)', default: 10, min: 2, max: 200 },
      { key: 'slow', label: 'Slow average (days)', default: 30, min: 3, max: 400 }
    ],
    check: p => (p.fast < p.slow ? null : 'Fast average must be smaller than slow average.')
  },
  emaCross: {
    label: 'Exponential moving average crossover',
    run: emaCross,
    params: [
      { key: 'fast', label: 'Fast average (days)', default: 10, min: 2, max: 200 },
      { key: 'slow', label: 'Slow average (days)', default: 30, min: 3, max: 400 }
    ],
    check: p => (p.fast < p.slow ? null : 'Fast average must be smaller than slow average.')
  },
  breakout: {
    label: 'Breakout (high/low channel)',
    run: breakout,
    params: [
      { key: 'entry', label: 'Buy above highest close of last (days)', default: 20, min: 2, max: 250 },
      { key: 'exit', label: 'Sell below lowest close of last (days)', default: 10, min: 2, max: 250 },
      { key: 'buffer', label: 'Extra margin above the high (%, 0 = off)', default: 0, min: 0, max: 10 },
      { key: 'confirm', label: 'Days it must hold above (1 = off)', default: 1, min: 1, max: 10 },
      { key: 'trend', label: 'Only if above this average (days, 0 = off)', default: 0, min: 0, max: 400 }
    ],
    check: p => (p.exit <= p.entry ? null : 'The sell window should not be longer than the buy window.')
  },
  rsi: {
    label: 'RSI (buy after a fall)',
    run: rsiStrategy,
    params: [
      { key: 'period', label: 'RSI period (days)', default: 14, min: 2, max: 100 },
      { key: 'buyBelow', label: 'Buy when RSI below', default: 30, min: 5, max: 50 },
      { key: 'sellAbove', label: 'Sell when RSI above', default: 70, min: 50, max: 95 }
    ],
    check: p => (p.buyBelow < p.sellAbove ? null : 'The buy level must be lower than the sell level.')
  }
};

if (typeof module !== 'undefined') module.exports = { sma, smaCross, STRATEGIES };

