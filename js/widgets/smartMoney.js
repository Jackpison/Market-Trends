import { icon } from '../icons.js';
import { $, esc, onTab } from '../util.js';
import { loadTrends, NO_DATA } from '../trendsData.js';
const TYPES = { tape: 'Tape footprint', options: 'Options flow', '13f': '13F accumulation', sec: 'SEC filings', vc: 'VC cluster', defi: 'DeFi / on-chain flow', narrative: 'Composite' };
const ICON = { tape: 'trending-up', options: 'scale', '13f': 'landmark', sec: 'building-2', vc: 'rocket', defi: 'coins', narrative: 'radio' };
let loaded = false, D, F = { type: 'all', strength: 'all' };
async function load() {
  if (loaded) return; loaded = true; const root = $('#view-smart'); D = await loadTrends();
  if (!D) { root.innerHTML = `<div class="panel"><h2>Smart money</h2><div class="notice">${NO_DATA}</div></div>`; return; }
  root.innerHTML = `<div class="panel glass"><div class="listhead"><div><h2>Smart-money &amp; whale activity stream</h2><p class="muted small">Footprints detected in the latest 6-hourly run (${esc(D.generated.replace('T', ' '))} UTC). Each signal states its source, whether it is directly measured or a proxy, and an estimated lead horizon.</p></div>
   <div class="controls"><label>Type <select id="sT"><option value="all">All</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>Strength <select id="sS"><option value="all">All</option><option>High</option><option>Medium</option><option>Speculative</option></select></label></div></div><div id="sigs"></div></div>
   <div class="split"><div class="panel glass"><h3>Confidence matrix</h3><div class="tw"><table class="matrix"><thead><tr><th>Strength</th><th>Rule (heuristic)</th></tr></thead><tbody>
   <tr><td><span class="pill q-stealth">High</span></td><td>Statistical outlier of 3 sigma or more, or 2 sigma confirmed by a second independent source</td></tr><tr><td><span class="pill q-main">Medium</span></td><td>2 sigma outlier, or a clear threshold crossing (e.g. call share at least 65%, 13F change at least 5%)</td></tr><tr><td><span class="pill q-dormant">Speculative</span></td><td>Thin samples, single weak source, or composite inference</td></tr></tbody></table></div></div>
   <div class="panel glass"><h3>Estimated lead horizons</h3><div class="tw"><table class="matrix"><thead><tr><th>Footprint</th><th>Lead (editorial estimate)</th></tr></thead><tbody><tr><td>Options call skew</td><td>1-3 months</td></tr><tr><td>Tape accumulation</td><td>1-3 months</td></tr><tr><td>13F institutional accumulation</td><td>3-9 months (quarterly, lagged 45 days)</td></tr><tr><td>DeFi / stablecoin flows</td><td>1-6 months</td></tr><tr><td>SEC filing mentions</td><td>6-18 months</td></tr><tr><td>VC clusters</td><td>12-24 months</td></tr></tbody></table></div>
   <p class="muted small"><b>Not available free:</b> on-chain whale-wallet tracking (needs Whale Alert, Arkham or Etherscan keys) and per-ticker dark-pool prints (FINRA ATS data is free but weekly and delayed). Lead horizons are heuristics, not measured.</p></div></div>`;
  $('#sT').onchange = e => { F.type = e.target.value; draw(); }; $('#sS').onchange = e => { F.strength = e.target.value; draw(); }; draw();
}
function draw() {
  const l = D.signals.filter(s => (F.type === 'all' || s.type === F.type) && (F.strength === 'all' || s.strength === F.strength));
  $('#sigs').innerHTML = l.map(s => `<div class="sig sig-${s.strength}"><div class="sig-ic">${icon(ICON[s.type] || 'activity', 20)}</div><div class="sig-body"><div class="sig-top"><b>${esc(s.title)}</b><span class="pill st-${s.strength}">${s.strength}</span></div>
    <div class="muted small">${esc(s.trend_name)} &middot; ${esc(TYPES[s.type] || s.type)}</div><p>${esc(s.detail)}</p><div class="sig-foot small muted">Source: ${esc(s.source)} &middot; <span class="pill basis-${s.basis}">${s.basis}</span> &middot; est. lead ${esc(s.lead)}</div></div></div>`).join('') || '<div class="notice">No signals match. A quiet stream is a valid result: signals only fire on measurable outliers.</div>';
}
export function initSmartMoney() { onTab('smart', load); }
