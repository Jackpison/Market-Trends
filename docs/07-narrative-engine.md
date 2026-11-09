# Narrative velocity, capital tracking and smart-money engine

> A research aid for noticing where attention and capital move before consensus forms. It does **not** predict returns. Scores are heuristics built from free public data; each source's live/partial/failed state is shown on the site and recorded in `data/macro_data.json`.

## Pipeline
`scripts/fetch_trends.py` runs every 6 hours (GitHub Action `update_trends.yml`), reads `config/trends.json` (13 editorial trend definitions with queries, baskets and horizons), collects the sources below in parallel, and writes `data/macro_data.json` plus a daily snapshot in `data/trends_history.json`. The site is static and reads those files.

## Narrative Velocity Score (NVS)
For each source, z = (volume of the last complete UTC day minus its prior 30-day mean) / sigma, where sigma is floored (count series: sqrt of the mean, so a quiet baseline cannot create absurd z-scores) and z is clipped to [-5, 8].

- **Source-specific corrections:** Wikipedia daily pageviews are published about a day late, so that window is shifted one day back. SEC filing mentions are measured as a share of a control query's filing volume (the word "revenue"), because 10-Q filings cluster in earnings season and raw counts spike for every theme at once. Hacker News queries use exact-word matching (otherwise "DeFi" matches "define"). GDELT days that the API did not report are ignored rather than counted as zero.
- Combined z = weighted mean of available per-source z values (negative values clipped at -2).
- Sentiment skew S = 1 + 0.5 x s, where s = GDELT average news tone over the last 3 days divided by 5, clamped to [-1, 1].
- **NVS = 100 x (1 - exp(-max(z x S, 0) / 3))**, a saturating map to 0-100. Under pure noise the average NVS is about 10, and only about 2-3% of cases exceed 50 (checked by simulation).

## Infiltration stages
| Stage | Evidence used (highest tier with z at least 1.0) |
|---|---|
| Fringe / Seed | GitHub new repositories, arXiv papers |
| Developer / Reddit | Hacker News mentions, Reddit (often blocked from cloud servers) |
| FinTwit / VC | SEC filing mentions and tape attention (dollar-volume z). **X/Twitter data is not freely available**, so this stage is inferred, not observed |
| Mainstream News | GDELT news volume, Wikipedia pageviews |

## Capital backing and SMII
- **SMII = 0.4 x VC cluster + 0.4 x options call skew + 0.2 x 13F net buying**, renormalised over components that returned data (coverage is shown).
  - VC cluster: share of Y Combinator's two latest *complete* batches (future-labelled and under-50-company batches are ignored) matching the theme versus the prior six, ratio mapped to 0-100. It is a seed-stage sample, not total venture funding. SEC Form D filings are not text-searchable in EDGAR full-text search, so that input is unavailable.
  - Options skew: call share of nearest-expiry option volume on the lead ETF and up to three stocks, compared with a typical baseline (45% for ETFs, which skew put-heavy from hedging; 62% for single stocks) and scaled so +20 points above baseline scores 100. The baselines are my estimates. It is **not** a dark-pool measure.
  - 13F net buying: position-weighted change across top reported institutional holders (quarterly, up to about 45 days stale).
- **Capital score** = 0.6 x tape score + 0.4 x SMII (crypto trends average the tape with a DeFi flow score; private-VC trends use SMII only). Tape score = mean of relative strength vs SPY (3M), dollar-volume ratio (20d/90d) and Chaikin money flow (20d).
- **Quadrants** split at 50 on both axes: Smart Money Stealth (capital high, hype low), Mainstream Trend, Retail Hype / Bubble (hype high, capital low), Dormant / Seed.

## DeFi liquidity (DefiLlama)
Total value locked, stablecoin supply and net minting or burning, and DEX volume. Flow score = mean of TVL 30d change, stablecoin 30d change and DEX 1-month change, each scaled to 0-100. Above 60 reads risk-on, below 40 risk-off.

## Historical overlays
Real daily price history, equal-weight baskets rebased to 100 at each cycle's start (EV/SPAC 2020, crypto 2020-21, generative AI 2023, GFC 2007-09, dot-com 1998-2002). Shape similarity is descriptive. Each cycle's start date is my editorial choice.

## What is measured, proxied, or unavailable
| Item | Status |
|---|---|
| Hacker News, Wikipedia, GitHub, arXiv, SEC filing mentions | Measured (free APIs) |
| GDELT news volume and tone | Measured, but the free API rate-limits aggressively; some trends may be missing in a run |
| Reddit | Needs free API credentials (`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` repo secrets); unauthenticated requests are blocked from cloud servers |
| SEC Form D | Proxy: weekly count of new Form D filers (EDGAR daily index, amendments excluded) whose *name* contains a trend keyword. Names are coarse; reported as partial when a trend has no matching filers |
| X / FinTwit | Unavailable (no free API); stage inferred |
| Dark-pool prints | Unavailable per ticker; options skew used as a proxy |
| 13F | Proxy via Yahoo institutional-ownership changes |
| VC deals | Proxy via YC batches and SEC Form D mentions; no Crunchbase/PitchBook |
| On-chain whale wallets | Unavailable (needs paid keys) |
| Network graph links | Editorial hypotheses, not computed causality |

## Known limits
- Daily sources lag by up to a day; 13F lags by weeks; YC batches change twice a year.
- Keyword queries are noisy ("copper" or "gold" appear in many unrelated contexts). Queries live in `config/trends.json` and can be tuned.
- Thresholds, weights and lead horizons are heuristics. Backtest before relying on them, and record changes in git.
