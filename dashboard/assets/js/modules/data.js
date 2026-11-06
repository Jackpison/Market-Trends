// Central data layer. ALL VALUES ARE ILLUSTRATIVE / SIMULATED until you wire in real feeds
// (see docs/BLUEPRINT.md -> "Going live"). Swap `INDICATORS[].value` with data/latest.json.

/** dir: 'high' = higher value is worse, 'low' = lower value is worse.
 *  warn / crit are the yellow / red trigger levels. */
export const INDICATORS = [
  { id: 'c2s10', name: '10Y–2Y Spread', cat: 'Curve', unit: 'bp', dec: 0, value: 18, warn: 25, crit: 0, dir: 'low',
    src: 'FRED T10Y2Y', logic: 'Red when inverted (<0). Also watch the un-inversion: a rapid re-steepening (+50bp in 3m) from negative has preceded recessions (2007, 2019-20, 2024).',
    hist: 'Inverted mid-2006 → recession Dec 2007; inverted Aug 2019; deeply inverted Jul 2022 – 2024.' },
  { id: 'c3m10', name: '10Y–3M Spread', cat: 'Curve', unit: 'bp', dec: 0, value: 42, warn: 50, crit: 0, dir: 'low',
    src: 'FRED T10Y3M', logic: 'NY Fed recession-probability input. Red <0; yellow <50bp. Trigger on 3m average, not one print.',
    hist: 'Most reliable single curve signal since 1960s; inverted before every US recession.' },
  { id: 'nliq', name: 'Fed Net Liquidity YoY', cat: 'Liquidity', unit: '%', dec: 1, value: -1.8, warn: 0, crit: -5, dir: 'low',
    src: 'FRED WALCL − RRPONTSYD − WTREGEN', logic: 'Net Liquidity = Fed assets − Reverse Repo − Treasury General Account. Yellow when YoY < 0, red < −5%.',
    hist: 'QT + TGA rebuild drained liquidity in 2022; Mar-2020 and Mar-2023 saw emergency injections.' },
  { id: 'gm2', name: 'Global M2 YoY', cat: 'Liquidity', unit: '%', dec: 1, value: 4.1, warn: 3, crit: 0, dir: 'low',
    src: 'FRED M2SL + BIS / central-bank M2 (USD-converted)', logic: 'G4+China M2 in USD. Contraction (<0) is rare and highly disinflationary; 10–12 week lead on risk assets is a common heuristic.',
    hist: '2020 surge (+25%) fed the 2021 boom; 2022 contraction preceded the equity/crypto drawdown.' },
  { id: 'hyoas', name: 'HY OAS', cat: 'Credit', unit: 'bp', dec: 0, value: 380, warn: 450, crit: 600, dir: 'high',
    src: 'FRED BAMLH0A0HYM2', logic: 'Yellow >450bp, red >600bp. Velocity matters: +100bp in 30 days is an alert regardless of level.',
    hist: '2008: 2,000bp+. 2020: ~1,100bp. 2022: ~600bp peak.' },
  { id: 'bcds', name: 'Bank 5Y CDS (avg)', cat: 'Credit', unit: 'bp', dec: 0, value: 88, warn: 100, crit: 175, dir: 'high',
    src: 'Bloomberg / ICE CDS; free proxy: KRE vs XLF relative drawdown', logic: 'Median of G-SIB + regional bank 5Y CDS. Idiosyncratic spikes >2σ above sector median flag run risk.',
    hist: 'SVB/Credit Suisse Mar-2023; Lehman Sep-2008.' },
  { id: 'hydef', name: 'HY Default Rate (12m fwd)', cat: 'Credit', unit: '%', dec: 1, value: 4.4, warn: 4, crit: 7, dir: 'high',
    src: 'Moody’s / S&P; proxy: HYG–LQD spread, FRED DRCCLACBS (card charge-offs)', logic: 'IG vs HY implied default probability from spreads: PD ≈ spread / (1 − recovery). Compare HY PD to IG PD ratio; rising ratio = quality divergence.',
    hist: '2009: 13%; 2020: ~6%; 2016 energy: ~5%.' },
  { id: 'dxy', name: 'DXY 3-Month Momentum', cat: 'FX & Commodities', unit: '%', dec: 1, value: 2.1, warn: 4, crit: 8, dir: 'high',
    src: 'Yahoo Finance DX-Y.NYB', logic: 'A fast dollar surge tightens global financial conditions and stresses USD debtors (EM, carry trades).',
    hist: '2008 flight to USD; 2014-15 +20%; 2022 +17%.' },
  { id: 'cugold', name: 'Copper/Gold 6m Change', cat: 'FX & Commodities', unit: '%', dec: 1, value: -6.5, warn: -5, crit: -12, dir: 'low',
    src: 'Yahoo Finance HG=F / GC=F', logic: 'Falling ratio = growth pessimism / risk-off. Compare vs US 10Y yield direction; divergence is the signal.',
    hist: 'Led yields lower in 2008, 2011, 2019; bottomed ahead of 2020 reflation.' },
  { id: 'oil', name: 'Brent 3-Month Change', cat: 'FX & Commodities', unit: '%', dec: 1, value: 8, warn: 20, crit: 40, dir: 'high',
    src: 'Yahoo Finance BZ=F / FRED DCOILBRENTEU', logic: 'Supply-shock detector. >+40% in 3m historically precedes a CPI re-acceleration and demand destruction.',
    hist: '1973, 1990, 2008 ($147), 2022 (Ukraine).' },
  { id: 'bei', name: '10Y Breakeven Inflation', cat: 'FX & Commodities', unit: 'bp', dec: 0, value: 238, warn: 250, crit: 300, dir: 'high',
    src: 'FRED T10YIE; 5y5y forward: T5YIFR', logic: 'De-anchoring risk when 5y5y > 2.75%. Falling breakevens + falling oil = deflation scare.',
    hist: '2008: collapsed to ~0%; 2022: ~3%.' },
  { id: 'vix', name: 'VIX', cat: 'Volatility', unit: '', dec: 1, value: 17, warn: 22, crit: 30, dir: 'high',
    src: 'FRED VIXCLS / Yahoo ^VIX', logic: 'Yellow >22, red >30. Term-structure inversion (VIX > VIX3M) is a sharper stress flag.',
    hist: '2008: 80; 2020: 82; 2022: 36.' },
  { id: 'move', name: 'MOVE Index', cat: 'Volatility', unit: '', dec: 0, value: 104, warn: 110, crit: 140, dir: 'high',
    src: 'Yahoo Finance ^MOVE', logic: 'Bond-vol precedes funding stress: >140 has coincided with Treasury-market dysfunction and bank/LDI shocks.',
    hist: '2008: 264; Mar-2020: 164; Mar-2023: 199.' },
  { id: 'skew', name: 'CBOE SKEW', cat: 'Volatility', unit: '', dec: 0, value: 146, warn: 140, crit: 155, dir: 'high',
    src: 'Yahoo Finance ^SKEW', logic: 'Tail-hedging demand. High SKEW + low VIX = complacent surface hiding crash insurance buying.',
    hist: 'Records >150 in 1990 & 2021, often with calm VIX.' },
  { id: 'gex', name: 'Dealer Net GEX (SPX)', cat: 'Volatility', unit: '$bn', dec: 1, value: 3.1, warn: 0, crit: -5, dir: 'low',
    src: 'SqueezeMetrics (DIX/GEX), CBOE OI via vendor', logic: 'Positive GEX dampens moves (dealers sell rallies / buy dips); negative GEX amplifies them. Red when deeply negative.',
    hist: 'Negative GEX regimes: Feb-2018 Volmageddon, Mar-2020, Aug-2024 yen-carry shock.' },
];

export const CATEGORIES = ['Curve', 'Liquidity', 'Credit', 'FX & Commodities', 'Volatility'];

/** Stress score: 0 = safe-edge, 0.5 = warn, 1 = crit (can exceed 1). Works for either direction. */
export function stress(i) {
  const safe = 2 * i.warn - i.crit;
  return clamp((i.value - safe) / (i.crit - safe), 0, 1.5);
}
export function status(i) {
  const s = stress(i);
  return s >= 1 ? 'red' : s >= 0.5 ? 'yellow' : 'green';
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Yield-curve snapshots. STYLIZED approximations of the shape of each regime, not exact prints. */
export const MATURITIES = ['3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];
export const CURVES = [
  { label: 'Jun 2007 — pre-GFC (flat/inverted)', y: [4.9, 4.95, 4.9, 4.85, 4.8, 4.9, 5.0, 5.03, 5.2, 5.1] },
  { label: 'Apr 2009 — post-GFC steepening', y: [0.15, 0.3, 0.55, 0.95, 1.4, 2.0, 2.8, 3.1, 4.0, 3.9] },
  { label: 'Aug 2019 — inversion', y: [1.95, 1.9, 1.75, 1.55, 1.5, 1.45, 1.5, 1.55, 1.9, 2.0] },
  { label: 'Apr 2020 — pandemic ZIRP', y: [0.13, 0.15, 0.16, 0.2, 0.25, 0.38, 0.5, 0.62, 1.1, 1.28] },
  { label: 'Oct 2022 — hiking cycle, deep inversion', y: [3.9, 4.4, 4.5, 4.4, 4.25, 4.1, 4.1, 4.0, 4.3, 4.1] },
  { label: 'Jul 2023 — peak inversion', y: [5.5, 5.4, 5.1, 4.8, 4.5, 4.2, 4.2, 4.0, 4.3, 4.1] },
  { label: 'Illustrative "now" — un-inverting', y: [4.2, 4.1, 3.9, 3.8, 3.8, 3.9, 4.1, 4.2, 4.7, 4.7] },
];

/** Stress-test sensitivities. Stylized elasticities, NOT calibrated regressions. See docs/BLUEPRINT.md. */
export const SHOCKS = [
  { id: 'infl', label: 'Inflation shift', unit: 'pp', min: -2, max: 5, step: 0.1, value: 0, hint: 'Change in CPI YoY vs baseline 3.0%' },
  { id: 'cuts', label: 'Fed cuts (12m cumulative)', unit: 'bp', min: -200, max: 400, step: 25, value: 0, hint: '+ = cuts, − = hikes' },
  { id: 'oil', label: 'Oil shock', unit: '%', min: -30, max: 120, step: 5, value: 0, hint: 'Brent price change' },
  { id: 'credit', label: 'Credit-spread widening', unit: 'bp', min: 0, max: 600, step: 25, value: 0, hint: 'Change in HY OAS' },
];
export const PRESETS = {
  'Baseline': { infl: 0, cuts: 0, oil: 0, credit: 0 },
  'Soft landing': { infl: -0.5, cuts: 150, oil: -10, credit: 0 },
  '2022 rate shock': { infl: 3, cuts: -200, oil: 40, credit: 200 },
  '1970s oil shock': { infl: 3.5, cuts: 0, oil: 100, credit: 150 },
  '2008 credit freeze': { infl: -1.5, cuts: 400, oil: -30, credit: 600 },
};
