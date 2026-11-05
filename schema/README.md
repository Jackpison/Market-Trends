# Data schema

## data/yearly/overview.json (101 rows, 1926-2026)
| field | type | meaning |
|---|---|---|
| year | int | calendar year |
| headline | string | key events and market-relevant facts |
| regime | string | short label for the market/cycle phase |
| impact | 0-5 | subjective market/economic significance (0 = not yet rated) |
| tags | string[] | topics for filtering (e.g. `dotcom`, `fed`, `oil`) |
| confidence | high / medium / low | how well-sourced the entry is |
| metrics | object or null | filled later from `data/market/` (returns, rates) |

## data/monthly/YYYY.json (12 rows per file)
| field | type | meaning |
|---|---|---|
| month | `YYYY-MM` | month |
| event | string or null | the standout event(s); null = none confidently identified |
| market_effect | string | impact or context |
| metrics | object or null | filled later from `data/market/` |
| confidence | high / context-only | `context-only` = no standout event, regime context only |

## data/market/*.csv
Raw monthly series downloaded by `scripts/fetch_market_data.py` (FRED, Yahoo Finance, Stooq).
