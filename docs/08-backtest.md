# Backtest: did each signal fire before downturns?

`scripts/backtest.py` produces `data/indicators/backtest.json`, shown in the Radar tab under "Track record".

## Method
- **Sample:** month-end data from 1990 (each indicator starts when its data starts). Scores use `scripts/build_indicators.py`, exactly as the live site does, including staleness rules.
- **Targets:** (1) a new NBER recession starts within the next 12 months; (2) an S&P 500 bear market (-20% from a monthly-close peak) begins within the next 12 months. Months already inside a recession / bear market are excluded.
- **AUC:** probability that a pre-event month scores higher than a non-event month (Mann-Whitney). 0.5 = no skill; the verdict labels use >= 0.65 *Useful*, 0.55-0.65 *Weak*, below 0.55 *No skill*.
- **Hit rate:** share of events preceded by an alert (score >= 50; composite >= 45) in the prior 18 months. **Median lead:** months from the first alert in the prior 24 months to the event.
- **False alarms:** share of alert episodes (runs of consecutive alert months) with no event in the following 18 months. Recent episodes too young to judge are left out.

## Reading the results (as of the last run)
- The 10Y-3M and 10Y-2Y spreads and the composite score show real skill for recessions (AUC about 0.7 to 0.9) but with many false alarms.
- Some signals do not beat a coin flip on this sample (e.g. M2 growth, net liquidity, MOVE, SKEW, the Sahm rule, which is a coincident indicator by design). Consider lowering their weight in `config/indicators.json`; the backtest does not change weights automatically.
- HY and IG OAS cannot be tested: FRED serves about 3 years of history.

## Limits
Only four recessions and a handful of bear markets exist in the sample, so each rate rests on very few independent events. Twelve-month labels overlap. Data are current vintages (revised) and the thresholds were chosen with hindsight, so results are optimistic compared with real-time use. Use this as a sanity check on each signal, not as proof of forecasting skill.
