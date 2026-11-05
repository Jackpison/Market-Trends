# Market Trends: 100 years of cycles

A research dataset and analysis project on how markets, technologies and policy shocks have played out over the last century (1926-2026), built as the foundation for an interactive website.

> Research and education only. Not financial advice. Entries are curated summaries; verify against primary sources before relying on any figure.

## Status
| Layer | Coverage | State |
|---|---|---|
| Yearly overview | 1926-2026 | Drafted (2026 partial) |
| Monthly detail | 1996-2005 | Drafted (sample decade) |
| Monthly detail | 1926-1995, 2006-2026 | To do |
| Quantitative series | FRED, Yahoo, Stooq | Script written, not yet run |
| Cycle analysis | Frameworks, signals, case studies | First pass |

## Layout
- `data/yearly/overview.json`: one row per year
- `data/monthly/YYYY.json`: 12 rows per year
- `data/market/*.csv`: downloaded series (run the script)
- `docs/`: frameworks, signals checklist, case studies
- `schema/README.md`: field definitions
- `scripts/`: builders and the data fetcher

## Quick start
```bash
python3 scripts/fetch_market_data.py   # downloads real monthly series
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
