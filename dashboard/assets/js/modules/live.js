// Loads the repo's real pipeline output (../data/indicators/*.json) and swaps it in for the simulated defaults.
// Anything that fails to load silently keeps the simulated values, and the badge says which mode is active.
import { INDICATORS, CATEGORIES, CURVES, MATURITIES, BASELINE } from './data.js';

const getJSON = async (p) => { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KEEP = [['2007-06', 'pre-GFC flat curve'], ['2009-04', 'post-GFC steepening'], ['2019-08', 'inversion'], ['2020-04', 'pandemic ZIRP'], ['2022-10', 'hiking cycle'], ['2023-07', 'peak inversion']];

function fillNulls(row) {   // linear interpolation across missing maturities (e.g. 1M before it existed), edges copy nearest
  const ok = row.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  if (!ok.length) return null;
  return row.map((v, i) => {
    if (v != null) return v;
    const lo = [...ok].reverse().find((k) => k < i), hi = ok.find((k) => k > i);
    if (lo == null) return row[hi]; if (hi == null) return row[lo];
    return row[lo] + (row[hi] - row[lo]) * (i - lo) / (hi - lo);
  });
}

function applyIndicators(L) {
  const names = Object.fromEntries(L.categories.map((c) => [c.id, c.name]));
  const mapped = L.indicators.filter((r) => r.value != null).map((r) => ({
    id: r.id, name: r.name, cat: names[r.cat] || r.cat, unit: r.unit === 'idx' ? '' : r.unit, dec: r.unit === 'idx' || r.unit === '$bn' ? 1 : 2,
    value: r.value, warn: r.warn, crit: r.crit, dir: r.direction === 'lower_worse' ? 'low' : 'high', center: r.center ?? null, twoSided: !!r.two_sided,
    src: (r.sources || []).join('; '), logic: r.logic, hist: Object.entries(r.history || {}).map(([y, t]) => `${y}: ${t}`).join(' '), live: true, asof: r.asof,
  }));
  if (!mapped.length) throw new Error('no indicators');
  INDICATORS.splice(0, INDICATORS.length, ...mapped);
  CATEGORIES.splice(0, CATEGORIES.length, ...L.categories.filter((c) => mapped.some((m) => m.cat === c.name)).map((c) => c.name));
}

function applyCurves(Y) {
  const idx = (pre) => Y.dates.findIndex((d) => d.startsWith(pre));
  const snaps = KEEP.map(([p, label]) => [idx(p), label]).filter(([i]) => i >= 0).map(([i, label]) => ({ i, label }));
  snaps.push({ i: Y.dates.length - 1, label: 'latest month-end' });
  const out = snaps.map(({ i, label }) => { const y = fillNulls(Y.curves[i]); const [yy, mm] = Y.dates[i].split('-'); return y && { label: `${MON[+mm - 1]} ${yy}: ${label}`, y }; }).filter(Boolean);
  if (out.length < 3) throw new Error('too few curves');
  MATURITIES.splice(0, MATURITIES.length, ...Y.maturities); CURVES.splice(0, CURVES.length, ...out);
}

function applyBaseline(S) {
  const b = S.baseline; if (!b) return;
  Object.assign(BASELINE, { cpi: b.cpi_yoy, wage: b.wage_yoy, mort: b.mortgage30, y10: b.y10 });
}

export async function loadLive() {
  const parts = { indicators: false, curves: false, baseline: false };
  let asof = null;
  try { const L = await getJSON('../data/indicators/latest.json'); applyIndicators(L); parts.indicators = true; asof = L.generated; } catch (e) { console.warn('[live] indicators', e.message); }
  try { applyCurves(await getJSON('../data/indicators/yield_curve.json')); parts.curves = true; } catch (e) { console.warn('[live] curves', e.message); }
  try { applyBaseline(await getJSON('../data/indicators/stress.json')); parts.baseline = true; } catch (e) { console.warn('[live] baseline', e.message); }
  const el = document.getElementById('data-badge');
  if (el) {
    const live = Object.entries(parts).filter(([, v]) => v).map(([k]) => k);
    el.innerHTML = live.length
      ? `<b>Live data</b> from this repo's pipeline: ${live.join(', ')}${asof ? ` (as of ${asof} UTC)` : ''}. The cross-asset heatmap and the stress-test sensitivities remain simulated/stylized.`
      : `<b>Demo data.</b> The repo's data files could not be loaded, so everything is simulated.`;
  }
  return parts;
}
