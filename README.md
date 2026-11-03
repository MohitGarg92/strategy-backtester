# Strategy Backtester

A small in-browser tool that replays historical prices, applies a trading rule, and compares the result with simply buying and holding. It runs entirely in the browser, with no server and no build step.

## How to use

1. Open `index.html` in a browser.
2. Click **Choose CSV file** and pick a price file with a `Date` column and a `Close` column (Yahoo Finance, niftyindices.com and Python `yfinance` layouts are all understood), or click **Use demo data** to try it with made-up prices.
3. Pick a strategy and adjust its settings.
4. Choose the period: use a quick pick, or type your own start and end dates (limited to the days in your file).
5. Optionally set a yearly interest rate for money that is not invested, then click **Run backtest**.

## What it reports

- Total return and yearly growth (CAGR)
- Maximum drawdown (the worst fall from a previous high)
- Number of trades and win rate
- The same numbers for buy and hold, as a baseline
- A "Cash only" column and dashed line when you set an interest rate on cash
- Time invested (the share of days the money was in the market)
- Charts: growth of ₹1,00,000, price with buy and sell points, and drawdown

## Project structure

| File | Job |
|---|---|
| `data.js` | Reads CSV text into a clean list of `{ date, close }` |
| `engine.js` | Replays prices day by day, tracks cash and shares, calculates the numbers. It knows nothing about any specific strategy. |
| `strategies.js` | One small function per strategy, plus a registry the page reads to build its controls |
| `app.js` | Connects the page to the files above and draws the results |
| `index.html`, `style.css` | Layout and look |
| `lib/chart.umd.js` | Chart.js, bundled so the page works offline |

## Design decisions

- **No look-ahead.** A signal worked out at the close of day *t* is only acted on from day *t+1*. Otherwise the test would use information it could not have had.
- **Engine and strategies are separate.** A strategy only returns one number per day (1 = invested, 0 = in cash). Adding a strategy never touches the engine.
- **Train and test periods.** The page can score the first 70% of the data or the last 30% separately, to help spot settings that only fit the past (overfitting).
- **Trading costs.** A percentage cost is charged on every buy and every sell.
- **Custom dates.** The rule's averages are always worked out from the whole file, so they are ready on the first day of the chosen period. A date with no data moves to the nearest day that has data.
- **Interest on cash.** Uninvested money earns a yearly rate you choose, counted in calendar days so weekends and holidays are handled correctly. The rate is an assumption, not a guarantee.

## Adding a strategy

Open `strategies.js`, write a function that takes `(closes, params)` and returns an array of 1s and 0s, then add it to `STRATEGIES` with its settings. It appears in the dropdown automatically.

## Limits

- Long-only, one instrument at a time, fractional shares, trades at the closing price.
- Taxes, slippage and dividends are not modelled (use the cost setting as a rough stand-in). Interest on cash is only added if you set a rate, and it is not taxed.
- Past results do not predict the future. This tool is for learning, not investment advice.

## Getting price data

This project does not include market data. Download your own from a source you are allowed to use, for example:

- **Official index site:** the Nifty Indices historical data page (niftyindices.com), as CSV.
- **Python (personal use):** `yfinance` in Google Colab:
  ```python
  import yfinance as yf
  df = yf.download("^NSEI", start="2016-01-01", end="2026-11-02", auto_adjust=True)
  df.to_csv("nifty50.csv")
  ```
- **Public datasets** (for example on Kaggle), checking each dataset's licence.

Upload the CSV on the page. It needs a Date column and a Close column. The file is read in your browser and is never uploaded anywhere.

Market data belongs to its provider. Follow the terms of whichever source you use. This project is not affiliated with any data provider and is for education only, not investment advice.