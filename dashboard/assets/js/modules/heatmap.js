// Simulated cross-asset heatmap (seeded PRNG so it is stable per seed). Replace `generate()` with real returns.
const ASSETS = [
  ['SPY', 'S&P 500', 0.16], ['QQQ', 'Nasdaq 100', 0.22], ['IWM', 'Small caps', 0.24], ['XLF', 'Financials', 0.20],
  ['KRE', 'Regional banks', 0.30], ['XLU', 'Utilities', 0.15], ['XLE', 'Energy', 0.28], ['VNQ', 'Real estate', 0.20],
  ['TLT', '20Y+ Treasuries', 0.15], ['HYG', 'High yield', 0.09], ['GLD', 'Gold', 0.14], ['DXY', 'US Dollar', 0.08],
];
const WINDOWS = [['1D', 1], ['1W', 5], ['1M', 21], ['3M', 63], ['1Y', 252]];

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => (r() + r() + r() + r() - 2) * 1.7;

function generate(seed) {
  const r = rng(seed), market = WINDOWS.map(([, d]) => gauss(r) * Math.sqrt(d / 252));
  return ASSETS.map(([, , vol]) => WINDOWS.map(([, d], w) => (0.6 * market[w] + 0.8 * gauss(r)) * vol * Math.sqrt(d / 252) * 100));
}

let seed = 7;
function render() {
  const rows = generate(seed);
  const max = 3;
  const el = document.getElementById('hm-grid');
  let html = `<div class="hm-h"></div>${WINDOWS.map(([w]) => `<div class="hm-h">${w}</div>`).join('')}`;
  rows.forEach((row, i) => {
    html += `<div class="hm-r"><b>${ASSETS[i][0]}</b><span>${ASSETS[i][1]}</span></div>`;
    row.forEach((v, w) => {
      const a = Math.min(Math.abs(v) / (max * Math.sqrt(WINDOWS[w][1]) / 2.2 + 0.5), 1);
      const c = v >= 0 ? '46,204,113' : '255,77,79';
      html += `<div class="hm-c" style="background:rgba(${c},${(0.12 + a * 0.6).toFixed(2)})" title="${ASSETS[i][1]} ${WINDOWS[w][0]}: ${v.toFixed(2)}%">${v >= 0 ? '+' : ''}${v.toFixed(1)}</div>`;
    });
  });
  el.innerHTML = html;
}

export function initHeatmap() {
  render();
  document.getElementById('hm-reseed').addEventListener('click', () => { seed = Math.floor(Math.random() * 1e6); render(); });
}
