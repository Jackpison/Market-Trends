# Early-warning indicator framework (Pillar 1)

> Purpose: monitor leading signals of structural market shifts. Everything here is a **monitoring heuristic**, not a forecast. Thresholds live in `config/indicators.json`; change them and rerun `scripts/build_indicators.py`.

## How the score works
- Each indicator gets a **risk score from 0 to 100**: 0 at the calm end, **50 at the warning threshold**, **100 at the critical threshold**, linearly in between and clamped.
- Status: green below 50, yellow from 50 to 99, red at 100.
- The **composite** is a weighted mean of six category scores (curve 20%, liquidity 15%, credit 25%, FX/commodities/inflation 15%, volatility 10%, labor/growth 15%). Missing categories are dropped and the weights renormalised, so read the composite together with the coverage count.
- Regimes: Calm below 25, Watch 25-45, Elevated 45-65, Critical 65 and above.

## The 15 scored indicators (plus 2 experimental)

| # | Indicator | Source | Trigger logic | Historical relevance |
|---|---|---|---|---|
| 1 | 10Y-3M spread | FRED T10Y3M | Warn <0.5pp, red <0 (inverted). Flag re-steepening within 18 months of inversion | Inverted before the Dec 2007 recession; brief 2019 inversion before the 2020 shock; long 2022-24 inversion shows signals can be early |
| 2 | 10Y-2Y spread | FRED T10Y2Y | Same thresholds; reacts earlier to policy-path repricing | Inverted Dec 2005 to mid 2007; again from Jul 2022 (about -100bp in Mar 2023) |
| 3 | Fed net liquidity, 6M change | FRED WALCL, RRPONTSYD, WTREGEN | Warn <-2%, red <-6% | QE periods (2008-09, 2020) coincided with market lows; 2022 QT plus RRP/TGA swings |
| 4 | US M2 growth YoY | FRED M2SL | Warn <4%, red <=0% | >20% growth in 2020-21 preceded the 2022 inflation surge; YoY contraction in 2022-23 |
| 5 | High-yield OAS | FRED BAMLH0A0HYM2 | Warn >4.5%, red >6.5% | >20% in 2008, ~11% in Mar 2020, ~6% in 2022 |
| 6 | Investment-grade OAS | FRED BAMLC0A0CM | Warn >1.6%, red >2.5% | Spread to ~4% in Mar 2020; 5-6% in 2008 |
| 7 | Financial stress index | FRED STLFSI4 | Warn >0, red >1.5 | Spikes in 2008 and Mar 2020 |
| 8 | Regional banks drawdown | Yahoo KRE | Warn <-15%, red <-25% from 12M high | Fell by about a third in Mar 2023 (SVB) |
| 9 | Dollar momentum, 6M | Yahoo DX-Y.NYB / FRED DTWEXBGS | Warn >+6%, red >+12% | Surges in late 2008, Mar 2020, 2022 (DXY ~114 in Sep 2022) |
| 10 | Copper/Gold, 6M change | Yahoo HG=F / GC=F | Warn <-8%, red <-15% | Falls in 2008 and growth scares; confirm against yields |
| 11 | WTI oil, 3M move (absolute) | FRED DCOILWTICO | Warn >25%, red >45% either way | $145 peak (Jul 2008) then collapse; negative futures Apr 2020; ~$124 in Mar 2022 |
| 12 | 10Y breakeven (de-anchoring) | FRED T10YIE | Distance from 2.25%: warn >0.5, red >0.9 | Below 1% in late 2008; ~0.9% Mar 2020; ~3% in spring 2022 |
| 13 | VIX | Yahoo ^VIX | Warn >22, red >30 (low <13 noted as complacency, not scored) | Closing highs near 81 (2008), 83 (2020) |
| 14 | MOVE | Yahoo ^MOVE | Warn >110, red >140 | >200 in late 2008; about 199 in Mar 2023 |
| 15 | Sahm rule | FRED UNRATE | Warn >0.3pp, red >=0.5pp | Triggered in 2008 and 2020; triggered Aug 2024 and was debated as a possible false signal |
| x1 | CBOE SKEW (half weight) | Yahoo ^SKEW | Warn >145, red >160 | Poor timing tool alone |
| x2 | Dealer GEX (unscored) | SqueezeMetrics public file (unofficial) | Shown, weight 0 | Experimental; free dark-pool and gamma data are limited |

## What is deliberately not here (and why)
- **Bank CDS spreads**: proprietary. Proxied by the KRE drawdown and the St. Louis stress index.
- **Global M2**: no clean free series. US M2 only; roadmap is to add euro-area, Chinese and Japanese aggregates from central banks.
- **Dark-pool volume and option gamma (GEX)**: free sources are patchy; included only as experimental, unscored.
- **BIS credit-to-GDP gaps** and **SEC EDGAR / FDIC bank call-report data** (unrealised securities losses, deposit mix): valuable structural-fragility inputs on the roadmap, updated quarterly rather than daily.
- **Valuation (CAPE)**: the long-history dataset only carries earnings through 2023; needs a maintained source before it can be scored.

## Using it responsibly
- Leading indicators have **variable lead times** (months to years) and **false positives**. Use clusters (several categories turning together) rather than any single flag.
- Look at **velocity** (1M and 3M change) as much as level: deterioration speed matters.
- Thresholds are judgement calls. Backtest before relying on them, and record changes in git.
