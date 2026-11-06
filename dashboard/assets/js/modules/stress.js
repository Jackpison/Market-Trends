import { SHOCKS, PRESETS, BASELINE } from './data.js';
import { cssVar, onThemeChange, chartDefaults } from './theme.js';

// Stylized first-order sensitivities (per unit shock). Educational, NOT calibrated regressions.
// Replace with betas estimated from your own regressions (see docs/BLUEPRINT.md).
const BETA = {
  spy:   { infl: -2.2, cuts: 0.7,  oil: -0.12, credit: -0.035 },
  banks: { infl: -1.8, cuts: -0.2, oil: -0.08, credit: -0.060 },
  reits: { infl: -3.5, cuts: 1.6,  oil: -0.05, credit: -0.030 },
};
// Horizon scalars: equity-type shocks partly mean-revert; CPI level shifts persist longer.
const HORIZON = { 1: { mkt: 1, cpi: 1 }, 5: { mkt: 0.8, cpi: 0.7 }, 10: { mkt: 0.6, cpi: 0.45 }, 20: { mkt: 0.4, cpi: 0.3 } };
const BASE = BASELINE;   // mutated in place by live.js when real data is available

export function model(s, horizon = 1) {
  const h = HORIZON[horizon];
  const lin = (b) => b.infl * s.infl + b.cuts * (s.cuts / 100) + b.oil * s.oil + b.credit * s.credit;
  // Convexity: tail shocks hit harder (forced selling / margin spirals). Triggered by large credit + vol combos.
  const tail = 1 + Math.max(0, (s.credit - 250) / 600) * 0.6 + Math.max(0, (s.infl - 3) / 5) * 0.3;
  const eq = (b) => { const v = lin(b); return (v < 0 ? v * tail : v) * h.mkt; };
  const cpiDelta = (s.infl + s.oil * 0.025 + (s.cuts / 100) * 0.15) * h.cpi;
  const dy10 = s.infl * 35 - s.cuts * 0.25 - s.credit * 0.05; // bp
  const cpi = BASE.cpi + cpiDelta;
  return {
    spy: eq(BETA.spy), banks: eq(BETA.banks), reits: eq(BETA.reits),
    cpi, cpiDelta, dy10,
    mort: BASE.mort + (dy10 / 100) * 0.8 + s.credit / 100 * 0.1,
    realWage: BASE.wage - cpi,
    delinq: BASE.delinq + 0.4 * (cpi - BASE.cpi) + s.credit * 0.004,
  };
}

let chart, state = {}, horizon = 1;
SHOCKS.forEach((k) => (state[k.id] = k.value));

function render() {
  const m = model(state, horizon);
  const pos = cssVar('--green'), neg = cssVar('--red');
  const vals = [m.spy, m.banks, m.reits, -m.cpiDelta * 4];
  chart.data.datasets[0].data = vals;
  chart.data.datasets[0].backgroundColor = vals.map((v) => (v >= 0 ? pos : neg));
  chart.update();
  const f = (v, d = 1, u = '%') => `${v >= 0 ? '+' : ''}${v.toFixed(d)}${u}`;
  const cell = (label, val, cls = '') => `<div class="kpi"><span>${label}</span><b class="${cls}">${val}</b></div>`;
  const c = (v) => (v >= 0 ? 'green-t' : 'red-t');
  const bl = document.getElementById('stress-base'); if (bl) bl.textContent = `CPI ${BASE.cpi.toFixed(1)}%, wages ${BASE.wage.toFixed(1)}%, mortgage ${BASE.mort.toFixed(2)}%, 10Y ${BASE.y10.toFixed(2)}%`;
  document.getElementById('stress-kpis').innerHTML = [
    cell('SPY (price)', f(m.spy), c(m.spy)), cell('Banks (KBW-style)', f(m.banks), c(m.banks)),
    cell('Real estate (REITs)', f(m.reits), c(m.reits)), cell('Headline CPI YoY', `${m.cpi.toFixed(1)}%`, m.cpiDelta > 0.5 ? 'red-t' : ''),
    cell('10Y yield Δ', f(m.dy10, 0, 'bp'), ''), cell('30Y mortgage rate', `${m.mort.toFixed(2)}%`, m.mort > 7.5 ? 'red-t' : ''),
    cell('Real wage growth', f(m.realWage, 1, '%'), c(m.realWage)), cell('Card delinquency', `${m.delinq.toFixed(1)}%`, m.delinq > 4.5 ? 'red-t' : ''),
  ].join('');
  SHOCKS.forEach((k) => {
    document.getElementById(`out-${k.id}`).textContent = `${state[k.id] > 0 && k.id !== 'credit' ? '+' : ''}${state[k.id]}${k.unit}`;
    document.getElementById(`in-${k.id}`).value = state[k.id];
  });
}

export function initStress() {
  chartDefaults();
  document.getElementById('stress-sliders').innerHTML = SHOCKS.map((k) => `
    <label class="slider"><div><span>${k.label}</span><output id="out-${k.id}"></output></div>
      <input type="range" id="in-${k.id}" min="${k.min}" max="${k.max}" step="${k.step}" value="${k.value}" aria-describedby="h-${k.id}">
      <small id="h-${k.id}">${k.hint}</small></label>`).join('');
  document.getElementById('stress-presets').innerHTML = Object.keys(PRESETS).map((p) => `<button class="btn" data-p="${p}">${p}</button>`).join('');

  chart = new Chart(document.getElementById('stressChart'), {
    type: 'bar',
    data: { labels: ['SPY %', 'Banks %', 'Real estate %', 'Consumer purchasing power (−4×ΔCPI)'], datasets: [{ data: [0, 0, 0, 0], borderRadius: 3 }] },
    options: {
      indexAxis: 'y', maintainAspectRatio: false, animation: { duration: 250 },
      scales: { x: { grid: { color: cssVar('--border') }, suggestedMin: -20, suggestedMax: 20 }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.x.toFixed(1)}` } } },
    },
  });
  SHOCKS.forEach((k) => document.getElementById(`in-${k.id}`).addEventListener('input', (e) => { state[k.id] = +e.target.value; render(); }));
  document.getElementById('stress-presets').addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]'); if (!p) return; Object.assign(state, PRESETS[p.dataset.p]); render();
  });
  document.getElementById('stress-horizon').addEventListener('change', (e) => { horizon = +e.target.value; render(); });
  onThemeChange(() => { chart.options.scales.x.grid.color = cssVar('--border'); render(); });
  render();
}
