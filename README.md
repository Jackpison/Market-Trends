# Market Trends: 100 years of cycles

A research dataset and analysis project on how markets, technologies and policy shocks have played out over the last century (1926-2026), built as the foundation for an interactive website.

> Research and education only. Not financial advice. Entries are curated summaries; verify against primary sources before relying on any figure.

Live site: https://jackpison.github.io/Market-Trends/

## Status
| Layer | Coverage | State |
|---|---|---|
| Yearly overview | 1926-2026 | Drafted (2026 partial) |
| Monthly detail | 1996-2005 | Drafted (sample decade) |
| Monthly detail | 1926-1995, 2006-2026 | To do |
| Market + macro series | FRED, Yahoo (daily, automated) | Runs via GitHub Actions |
| Early-warning system | 17 indicators, radar, heatmap, yield curve, stress test | Live (see Radar tab) |
| Cycle analysis | Frameworks, signals, case studies | First pass |

## Architecture
```
GitHub Actions (weekdays, UTC evening)            Static site (GitHub Pages, no build step)
  scripts/fetch_market_data.py  -> data/market/*.csv        index.html + css/ + js/ (ES modules)
  scripts/fetch_macro.py        -> data/macro/*.csv           js/widgets: earlyWarning, yieldCurve, stressTest
  scripts/build_indicators.py   -> data/indicators/*.json     js/charts: radar, heatmap, linechart, yieldchart, spark
        reads config/indicators.json (thresholds)             assets/app.js: 100-year history, monthly, markets, learn
```

## Speculative-trend intelligence (Trends tabs)
`scripts/fetch_trends.py` (every 6 hours via `.github/workflows/update_trends.yml`) measures narrative velocity (NVS), infiltration stage, Smart Money Inflow Index (SMII), DeFi liquidity, VC clusters and smart-money signals for 13 editorial trend definitions in `config/trends.json`, writing `data/macro_data.json`. Methodology, formulas and an honest list of what is measured vs proxied vs unavailable: `docs/07-narrative-engine.md`. Chart.js, Vis Network and JetBrains Mono are vendored in `vendor/` (licenses in `vendor/LICENSES.md`).

## Layout
- `config/indicators.json`: the 17 indicators, thresholds and historical notes (generated from `scripts/_indicator_defs.py`)
- `data/indicators/`: `latest.json`, `heatmap.json`, `yield_curve.json`, `stress.json` (computed)
- `data/macro/`, `data/market/`: raw downloaded series
- `data/yearly`, `data/monthly`: curated 100-year history
- `docs/04-06`: indicator framework, transmission channels (Mermaid), impact by horizon
- `js/`, `css/`: modular frontend; `assets/`: legacy history views

- `data/yearly/overview.json`: one row per year
- `data/monthly/YYYY.json`: 12 rows per year
- `data/market/*.csv`: downloaded series (run the script)
- `docs/`: frameworks, signals checklist, case studies
- `schema/README.md`: field definitions
- `scripts/`: builders and the data fetcher

## Quick start
```bash
python3 scripts/fetch_market_data.py   # long-history monthly series
python3 scripts/fetch_macro.py         # daily macro series (FRED, Yahoo)
python3 scripts/build_indicators.py    # indicators, heatmap, yield curve, stress betas
python3 -m http.server                 # then open http://localhost:8000
python3 scripts/build_yearly.py        # rebuilds data/yearly/overview.json
python3 scripts/build_monthly.py       # rebuilds monthly files
```

## Method and honesty rules
- Qualitative text is written from general historical knowledge and is marked with a `confidence` field.
- Months without a clearly identified standout event are marked `context-only` instead of being filled with guesses.
- Numeric returns are not hand-typed; they come from the downloaded series.

## Roadmap
1. Run the fetcher and merge metrics into the JSON
2. Extend monthly coverage decade by decade
3. Score each major cycle against `docs/02-signals-checklist.md`
4. Build the interactive site (timeline, filters by tag/regime, cycle overlays)

Licensed under the repository LICENSE.
