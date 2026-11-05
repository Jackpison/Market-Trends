import { $, $$, esc, getJSON, onTab, RUN_HINT, signed } from '../util.js';
import { draw2D, drawRidge, scaleFor } from '../charts/yieldchart.js';

let loaded = false, D, sc, idx = 0, timer = null, mode = '2d';
const PRESETS = [['2000-03', 'Dot-com peak'], ['2006-12', 'Pre-GFC inversion'], ['2019-08', 'Aug 2019 inversion'], ['2020-03', 'COVID cut to zero'], ['2022-10', '2022 hiking'], ['2023-03', 'Bank stress']];

async function load() {
  if (loaded) return; loaded = true;
  const root = $('#view-yield');
  try { D = await getJSON('data/indicators/yield_curve.json'); if (!D.dates.length) throw 0; } catch (e) { root.innerHTML = `<div class="panel"><h2>Yield curve</h2><div class="notice">${RUN_HINT}</div></div>`; return; }
  sc = scaleFor(D.curves); idx = D.dates.length - 1;
  root.innerHTML = `<div class="panel"><div class="listhead"><h2>US Treasury yield curve through time</h2>
    <div class="controls"><button class="ghost" id="ycPlay">&#9654; Play</button><label>Speed <select id="ycSpeed"><option value="140">Fast</option><option value="260" selected>Normal</option><option value="500">Slow</option></select></label>
    <label>View <select id="ycMode"><option value="2d">2D curve</option><option value="ridge">3D ridges</option></select></label>
    <label><input type="checkbox" id="ycGhost" checked> Compare to 1 year earlier</label></div></div>
    <div id="ycPresets" class="chips">${PRESETS.map(([d, n]) => `<button class="chip" data-d="${d}">${esc(n)} (${d})</button>`).join('')}<button class="chip" data-d="latest">Latest</button></div>
    <input type="range" id="ycSlider" min="0" max="${D.dates.length - 1}" value="${idx}" class="wide">
    <div id="ycInfo" class="kpis"></div><svg id="yc" class="lc tall" role="img" aria-label="Yield curve"></svg>
    <p class="muted small">Source: FRED constant-maturity Treasury yields (DGS series), month-end snapshots since 1990. An inverted curve (long yields below short yields) has preceded most US recessions, with variable lead time; see Learn for caveats.</p></div>`;
  $('#ycSlider').oninput = e => { stop(); show(+e.target.value); };
  $('#ycPlay').onclick = () => timer ? stop() : play();
  $('#ycMode').onchange = e => { mode = e.target.value; show(idx); };
  $('#ycGhost').onchange = () => show(idx);
  $('#ycPresets').onclick = e => { const d = e.target.dataset?.d; if (!d) return; stop(); let i = d === 'latest' ? D.dates.length - 1 : D.dates.findIndex(x => x.startsWith(d)); if (i >= 0) show(i); };
  show(idx);
}
function show(i) {
  idx = Math.max(0, Math.min(D.dates.length - 1, i)); $('#ycSlider').value = idx;
  const c = D.curves[idx], g = $('#ycGhost').checked && idx >= 12 ? D.curves[idx - 12] : null, L = D.maturities;
  const s2 = c[4] != null && c[8] != null ? c[8] - c[4] : null, s3 = c[1] != null && c[8] != null ? c[8] - c[1] : null;
  const st = (s2 != null && s2 < 0) || (s3 != null && s3 < 0) ? ['INVERTED', 'var(--bad)'] : (s2 != null && s2 < .5) ? ['FLAT', 'var(--warn)'] : ['NORMAL / STEEP', 'var(--ok)'];
  $('#ycInfo').innerHTML = `<div class="kpi"><span>Date</span><b>${D.dates[idx]}</b></div><div class="kpi"><span>10Y-2Y</span><b>${signed(s2, 2, 'pp')}</b></div><div class="kpi"><span>10Y-3M</span><b>${signed(s3, 2, 'pp')}</b></div><div class="kpi"><span>Shape</span><b style="color:${st[1]}">${st[0]}</b></div>`;
  if (mode === 'ridge') drawRidge($('#yc'), L, D.dates, D.curves, idx); else draw2D($('#yc'), L, c, g, sc);
}
function play() { if (idx >= D.dates.length - 1) idx = 0; $('#ycPlay').innerHTML = '&#10074;&#10074; Pause'; timer = setInterval(() => { if (idx >= D.dates.length - 1) return stop(); show(idx + 1); }, +$('#ycSpeed').value); }
function stop() { clearInterval(timer); timer = null; const b = $('#ycPlay'); if (b) b.innerHTML = '&#9654; Play'; }
export function initYieldCurve() { onTab('yield', load); document.addEventListener('tabchange', e => { if (e.detail !== 'yield') stop(); }); }
