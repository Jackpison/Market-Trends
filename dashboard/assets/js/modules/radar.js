import { INDICATORS, CATEGORIES, stress, status, clamp } from './data.js';
import { cssVar, onThemeChange, chartDefaults } from './theme.js';

const LABEL = { green: 'OK', yellow: 'WATCH', red: 'ALERT' };
let BASE = [], chart, timer;

const fmt = (i) => `${i.value.toFixed(i.dec)}${i.unit && i.unit !== '$bn' ? i.unit : ''}${i.unit === '$bn' ? ' $bn' : ''}`;
const catScore = (c) => {
  const xs = INDICATORS.filter((i) => i.cat === c).map((i) => clamp(stress(i), 0, 1));
  return xs.reduce((a, b) => a + b, 0) / xs.length;
};

function renderGrid() {
  const el = document.getElementById('indicator-grid');
  el.innerHTML = INDICATORS.map((i) => {
    const s = status(i), pct = Math.round(clamp(stress(i), 0, 1) * 100);
    return `<article class="ind" data-s="${s}">
      <header><span class="ind-cat">${i.cat}</span><span class="chip ${s}"><i></i>${LABEL[s]}</span></header>
      <h4>${i.name}</h4>
      <div class="ind-val">${fmt(i)}</div>
      <div class="bar" role="img" aria-label="stress ${pct}%"><span class="${s}" style="width:${pct}%"></span></div>
      <div class="ind-thr">warn ${i.warn} · crit ${i.crit} <em>(${i.dir === 'high' ? 'higher' : 'lower'} = worse)</em></div>
      <details><summary>Logic & history</summary>
        <p>${i.logic}</p><p><b>History:</b> ${i.hist}</p><p class="src">Source: ${i.src}</p></details>
    </article>`;
  }).join('');
}

function renderComposite() {
  const all = INDICATORS.map((i) => clamp(stress(i), 0, 1));
  const score = Math.round(all.reduce((a, b) => a + b, 0) / all.length * 100);
  const reds = INDICATORS.filter((i) => status(i) === 'red').length;
  const yel = INDICATORS.filter((i) => status(i) === 'yellow').length;
  const regime = score >= 60 || reds >= 4 ? 'red' : score >= 35 || reds >= 1 || yel >= 5 ? 'yellow' : 'green';
  const names = { green: 'Risk-on / benign', yellow: 'Late-cycle / caution', red: 'Systemic stress' };
  document.getElementById('composite').innerHTML =
    `<div class="score ${regime}">${score}</div><div><div class="regime">${names[regime]}</div>
     <div class="muted">${reds} alert · ${yel} watch · ${INDICATORS.length - reds - yel} ok</div></div>`;
}

function renderChart() {
  const data = CATEGORIES.map((c) => Math.round(catScore(c) * 100));
  const accent = cssVar('--accent');
  if (!chart) {
    chartDefaults();
    chart = new Chart(document.getElementById('radarChart'), {
      type: 'radar',
      data: { labels: CATEGORIES, datasets: [{ label: 'Category stress (0–100)', data, borderWidth: 2, pointRadius: 3 }] },
      options: {
        maintainAspectRatio: false, animation: { duration: 400 }, layout: { padding: { left: 34, right: 34, top: 6, bottom: 6 } },
        scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent' }, grid: { color: cssVar('--border') }, angleLines: { color: cssVar('--border') }, pointLabels: { color: cssVar('--text'), font: { size: 10 }, callback: (l) => (l.length > 14 ? l.split(/,\s*|\s+(?=&)/) : l) } } },
        plugins: { legend: { display: false } },
      },
    });
  }
  const ds = chart.data.datasets[0];
  ds.data = data; ds.borderColor = accent; ds.backgroundColor = accent + '33'; ds.pointBackgroundColor = accent;
  chart.options.scales.r.grid.color = chart.options.scales.r.angleLines.color = cssVar('--border');
  chart.options.scales.r.pointLabels.color = cssVar('--text');
  chart.options.scales.r.ticks.color = cssVar('--muted');
  chart.update();
}

const refresh = () => { renderGrid(); renderComposite(); renderChart(); };

function jitter() {
  INDICATORS.forEach((i) => {
    const step = Math.abs(i.crit - i.warn) * 0.08;
    const r = (Math.random() + Math.random() + Math.random() - 1.5) * step * 1.6;
    i.value = +(i.value + r).toFixed(i.dec + 1);
  });
  const open = [...document.querySelectorAll('#indicator-grid details[open]')].map((d) => d.closest('article').querySelector('h4').textContent);
  refresh();
  document.querySelectorAll('#indicator-grid article').forEach((a) => {
    if (open.includes(a.querySelector('h4').textContent)) a.querySelector('details').open = true;
  });
}

export function initRadar() {
  BASE = INDICATORS.map((i) => i.value);   // snapshot after live data (if any) has been loaded
  refresh();
  onThemeChange(() => chart && renderChart());
  const sim = document.getElementById('sim-toggle');
  sim.addEventListener('click', () => {
    const on = sim.getAttribute('aria-pressed') !== 'true';
    sim.setAttribute('aria-pressed', on);
    sim.textContent = on ? '■ Stop simulation' : '▶ Simulate live ticks';
    clearInterval(timer);
    if (on) timer = setInterval(jitter, 1500);
  });
  document.getElementById('sim-reset').addEventListener('click', () => {
    INDICATORS.forEach((i, k) => (i.value = BASE[k])); refresh();
  });
  document.getElementById('sim-stress').addEventListener('click', () => {
    // Push every indicator to 85% of the way to its crit level to show a systemic-stress regime.
    INDICATORS.forEach((i) => { const safe = 2 * i.warn - i.crit; i.value = +(safe + (i.crit - safe) * 0.85).toFixed(i.dec + 1); });
    refresh();
  });
}
