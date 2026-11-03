// engine.js — replays prices day by day and keeps score.
// It knows nothing about any particular strategy. A strategy only supplies a
// list of signals: one number per day, 1 = "be invested", 0 = "stay in cash".
//
// Rule that avoids cheating: the signal calculated at the close of day t is
// only acted on from day t+1. Otherwise the test would "know" the future.
//
// Money that is not invested can earn interest (options.cashRatePct, per year),
// like a liquid fund. Interest is counted in calendar days between two rows, so
// weekends and holidays are handled correctly (Nifty skips them, Bitcoin does not).

// Calendar days between two "YYYY-MM-DD" dates.
function daysBetween(dateA, dateB) {
  return (new Date(dateB) - new Date(dateA)) / 86400000;
}

function runBacktest(rows, signals, options = {}) {
  const startCash = options.startCash ?? 100000;   // ₹1,00,000
  const costPct = options.costPct ?? 0;            // cost per buy or sell, e.g. 0.1 means 0.1%
  const cashRatePct = options.cashRatePct ?? 0;    // yearly interest on money that is not invested
  const cost = costPct / 100;

  const dates = [];
  const equity = [];
  const trades = [];

  let cash = startCash;
  let shares = 0;
  let entryPrice = null;
  let entryDate = null;
  let investedDays = 0;

  for (let t = 0; t < rows.length; t++) {
    const price = rows[t].close;

    // Cash that sat uninvested since yesterday's close earns interest.
    if (t > 0 && shares === 0 && cashRatePct > 0) {
      const days = daysBetween(rows[t - 1].date, rows[t].date);
      cash *= Math.pow(1 + cashRatePct / 100, days / 365);
    }

    // Decide today's position from YESTERDAY's signal (no peeking).
    const wantInvested = t > 0 && signals[t - 1] === 1;

    if (wantInvested && shares === 0) {
      // Buy with all the cash (fractional shares keep the maths simple).
      const spend = cash * (1 - cost);
      shares = spend / price;
      cash = 0;
      entryPrice = price;
      entryDate = rows[t].date;
    } else if (!wantInvested && shares > 0) {
      cash = shares * price * (1 - cost);
      trades.push({
        entryDate, exitDate: rows[t].date,
        entryPrice, exitPrice: price,
        returnPct: (price / entryPrice - 1) * 100
      });
      shares = 0;
      entryPrice = null;
    }

    if (shares > 0) investedDays++;
    dates.push(rows[t].date);
    equity.push(cash + shares * price);
  }

  // If still holding on the last day, record the open trade (marked, not sold).
  if (shares > 0) {
    const last = rows[rows.length - 1];
    trades.push({
      entryDate, exitDate: last.date + ' (open)',
      entryPrice, exitPrice: last.close,
      returnPct: (last.close / entryPrice - 1) * 100
    });
  }

  return { dates, equity, trades, metrics: computeMetrics(dates, equity, trades, investedDays) };
}

// Buy on the first day, never sell. The baseline every strategy must beat.
function runBuyAndHold(rows, options = {}) {
  const signals = rows.map((_, i) => 1);
  // Signals are applied from the next day, so shift by starting invested on day 1.
  return runBacktest(rows, signals, options);
}

// Never invest: all the money stays in cash and earns the interest rate.
function runCashOnly(rows, options = {}) {
  const startCash = options.startCash ?? 100000;
  const rate = (options.cashRatePct ?? 0) / 100;
  const dates = rows.map(r => r.date);
  const equity = rows.map(r => startCash * Math.pow(1 + rate, daysBetween(rows[0].date, r.date) / 365));
  return { dates, equity, trades: [], metrics: computeMetrics(dates, equity, [], 0) };
}

function drawdownSeries(equity) {
  let peak = equity[0];
  return equity.map(v => {
    if (v > peak) peak = v;
    return (v / peak - 1) * 100; // 0 at a new high, negative while below it
  });
}

function computeMetrics(dates, equity, trades, investedDays = 0) {
  const start = equity[0];
  const end = equity[equity.length - 1];
  const totalReturnPct = (end / start - 1) * 100;

  const msPerYear = 365.25 * 24 * 3600 * 1000;
  const years = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / msPerYear;
  const cagrPct = years > 0 ? (Math.pow(end / start, 1 / years) - 1) * 100 : 0;

  const dd = drawdownSeries(equity);
  const maxDrawdownPct = Math.min(...dd); // most negative value

  const closed = trades.filter(t => !String(t.exitDate).includes('(open)'));
  const wins = closed.filter(t => t.returnPct > 0).length;
  const winRatePct = closed.length ? (wins / closed.length) * 100 : null;

  const timeInvestedPct = (investedDays / equity.length) * 100;

  return {
    totalReturnPct, cagrPct, maxDrawdownPct,
    numTrades: trades.length, winRatePct, years, timeInvestedPct
  };
}

if (typeof module !== 'undefined') {
  module.exports = { runBacktest, runBuyAndHold, runCashOnly, drawdownSeries, computeMetrics, daysBetween };
}
