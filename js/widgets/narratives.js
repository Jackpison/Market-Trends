import { $, $$, esc, num, signed, loadScript, cssVar, onTab } from '../util.js';
import { loadTrends, loadHistory, SECTORS, HORIZONS, SECTOR_COLOR, QUAD_CLASS, NO_DATA, statusTable } from '../trendsData.js';
import { spark } from '../charts/spark.js';

let D, H = [], loaded = false, F = { horizon: 'all', sector: 'all' }, sortKey = 'nvs', sel = null, scatter = null, bench = null;
const SRC = { hn: 'Hacker News', reddit: 'Reddit', github: 'GitHub new repos', arxiv: 'arXiv papers', wiki: 'Wikipedia views', gdelt: 'GDELT news volume', sec: 'SEC filing mentions' };
const filtered = () => D.trends.filter(t => (F.horizon === 'all' || t.horizon === F.horizon) && (F.sector === 'all' || t.sector === F.sector));
const val = (t, k) => k === 'nvs' ? t.nvs : k === 'capital' ? t.capital.score : k === 'smii' ? t.smii.score : k === 'stage' ? t.stage_index : t.name;
const bar = (v, c) => `<div class="mini"><i style="width:${v ?? 0}%;background:${c}"></i></div><b>${v == null ? '–' : v.toFixed(0)}</b>`;
const dots = i => '<span class="sdots" title="Infiltration stage">' + [0, 1, 2, 3].map(k => `<i class="${k <= i ? 'on' : ''}"></i>`).join('') + '</span>';
function prevNvs(id) { const today = D.generated.slice(0, 10), p = [...H].reverse().find(h => h.date < today && h.t[id]); return p ? p.t[id][0] : null; }

async function load() {
  if (loaded) return; loaded = true; const root = $('#view-narratives');
  D = await loadTrends(); if (!D) { root.innerHTML = `<div class="panel"><h2>Narratives</h2><div class="notice">${NO_DATA}</div></div>`; return; }
  H = await loadHistory();
  root.innerHTML = `<div class="panel glass"><div class="listhead"><div><h2>Narrative velocity &amp; capital tracker</h2><p class="muted small">Updated ${esc(D.generated.replace('T', ' '))} UTC, refreshed every 6 hours. NVS needs at least a day of lag: sources report the last complete UTC day.</p></div>
    <div class="controls"><label>Horizon <select id="fH"><option value="all">All</option>${HORIZONS.map(h => `<option>${h}</option>`).join('')}</select></label>
    <label>Sector <select id="fS"><option value="all">All</option>${SECTORS.map(h => `<option>${h}</option>`).join('')}</select></label><button class="ghost" id="fR">Reset</button></div></div>
    <div class="tw"><table class="matrix nt"><thead><tr><th data-s="name">Trend</th><th>Sector</th><th>Horizon</th><th data-s="stage">Stage</th><th data-s="nvs">NVS</th><th data-s="capital">Capital</th><th data-s="smii">SMII</th><th>Quadrant</th><th class="n">&Delta; NVS</th></tr></thead><tbody id="nbody"></tbody></table></div></div>
   <div class="split"><div class="panel glass"><h3>Trend radar: hype vs capital backing</h3><div class="chartwrap"><canvas id="scatter"></canvas></div><p class="muted small" id="qnote"></p></div><div class="panel glass" id="ndetail"><p class="muted">Click a trend to see its evidence.</p></div></div>
   <div class="panel glass"><h3>Past-trend benchmark overlay</h3><p class="muted small">Overlay the current basket on a historical speculative cycle, aligned by days since the cycle's start. Historical paths are real price data; this is pattern comparison, not a forecast.</p>
    <div class="controls"><label>Trend <select id="bT"></select></label><label>Historical cycle <select id="bB">${D.benchmarks.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>
    <label>Lookback <input type="range" id="bL" min="60" max="400" step="10" value="180"> <b id="bLv">180</b> days</label></div>
    <div class="chartwrap tall"><canvas id="bench"></canvas></div><div id="bRead" class="notice"></div></div>
   <details class="panel glass"><summary><b>Data coverage</b> (what is live, partial or failed)</summary>${statusTable(D)}<p class="muted small">Social-media feeds such as X/FinTwit are not freely available, so the "FinTwit / VC" stage is inferred from SEC filing mentions and tape attention. Reddit often blocks cloud servers.</p></details>`;
  $('#fH').onchange = e => { F.horizon = e.target.value; refresh(); }; $('#fS').onchange = e => { F.sector = e.target.value; refresh(); };
  $('#fR').onclick = () => { F = { horizon: 'all', sector: 'all' }; $('#fH').value = 'all'; $('#fS').value = 'all'; refresh(); };
  $('.nt thead').onclick = e => { const s = e.target.dataset?.s; if (s) { sortKey = s; renderTable(); } };
  $('#nbody').onclick = e => { const r = e.target.closest('tr'); if (r) select(r.dataset.id); };
  $('#bT').onchange = drawBench; $('#bB').onchange = drawBench; $('#bL').oninput = e => { $('#bLv').textContent = e.target.value; drawBench(); };
  document.addEventListener('themechange', () => { if ($('#view-narratives').classList.contains('on')) { drawScatter(); drawBench(); } });
  refresh(); const top = [...D.trends].sort((a, b) => (b.nvs ?? -1) - (a.nvs ?? -1))[0]; if (top) select(top.id);
}
function refresh() { renderTable(); drawScatter(); fillBenchTrends(); drawBench(); }
function renderTable() {
  const rows = filtered().sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name) : (val(b, sortKey) ?? -1) - (val(a, sortKey) ?? -1));
  $('#nbody').innerHTML = rows.map(t => { const p = prevNvs(t.id), dl = p == null || t.nvs == null ? null : t.nvs - p;
    return `<tr data-id="${t.id}" class="${sel === t.id ? 'sel' : ''}"><td><b>${esc(t.name)}</b><div class="muted small">${esc(t.hypothesis.length > 90 ? t.hypothesis.slice(0, 88) + '…' : t.hypothesis)}</div></td>
    <td><span class="sec" style="--c:${SECTOR_COLOR[t.sector]}">${esc(t.sector)}</span></td><td>${esc(t.horizon)}</td><td>${dots(t.stage_index)}<div class="small">${esc(t.stage)}</div></td>
    <td class="bcell">${bar(t.nvs, 'var(--acc)')}</td><td class="bcell">${bar(t.capital.score, 'var(--ok)')}</td><td class="n">${t.smii.score == null ? '–' : t.smii.score.toFixed(0)}<div class="muted small">cov ${Math.round(t.smii.coverage * 100)}%</div></td>
    <td>${t.quadrant ? `<span class="pill ${QUAD_CLASS[t.quadrant]}">${esc(t.quadrant)}</span>` : '<span class="muted">n/a</span>'}</td><td class="n">${dl == null ? '–' : signed(dl, 0)}</td></tr>`; }).join('') || '<tr><td colspan="9" class="muted">No trends match these filters.</td></tr>';
}
const quadrants = { id: 'quadrants', beforeDraw(c) {
  const { ctx, chartArea: a, scales: { x, y } } = c, mx = x.getPixelForValue(50), my = y.getPixelForValue(50); ctx.save();
  [[a.left, a.top, mx - a.left, my - a.top, 'rgba(46,201,138,.08)'], [mx, a.top, a.right - mx, my - a.top, 'rgba(75,134,224,.08)'], [mx, my, a.right - mx, a.bottom - my, 'rgba(229,72,77,.08)'], [a.left, my, mx - a.left, a.bottom - my, 'rgba(140,150,165,.06)']].forEach(([l, t, w, h, f]) => { ctx.fillStyle = f; ctx.fillRect(l, t, w, h); });
  ctx.strokeStyle = cssVar('--line'); ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(mx, a.top); ctx.lineTo(mx, a.bottom); ctx.moveTo(a.left, my); ctx.lineTo(a.right, my); ctx.stroke(); ctx.restore(); },
  afterDraw(c) { const { ctx, chartArea: a } = c; ctx.save(); ctx.font = '600 11px JetBrains Mono, monospace'; ctx.fillStyle = cssVar('--muted'); ctx.textAlign = 'left'; ctx.fillText('SMART MONEY STEALTH', a.left + 8, a.top + 16);
    ctx.textAlign = 'right'; ctx.fillText('MAINSTREAM TREND', a.right - 8, a.top + 16); ctx.fillText('RETAIL HYPE / BUBBLE', a.right - 8, a.bottom - 8); ctx.textAlign = 'left'; ctx.fillText('DORMANT / SEED', a.left + 8, a.bottom - 8); ctx.restore(); } };
async function drawScatter() {
  await loadScript('vendor/chart.umd.js'); const items = filtered().filter(t => t.nvs != null && t.capital.score != null), mut = cssVar('--muted'), ln = cssVar('--line');
  const ds = SECTORS.map(s => ({ label: s, data: items.filter(t => t.sector === s).map(t => ({ x: t.nvs, y: t.capital.score, id: t.id, name: t.name, r: 5 + (t.smii.score ?? 40) / 12, stage: t.stage })), backgroundColor: SECTOR_COLOR[s] + 'cc', borderColor: SECTOR_COLOR[s], pointRadius: c => c.raw?.r ?? 6, pointHoverRadius: c => (c.raw?.r ?? 6) + 2 }));
  if (scatter) scatter.destroy(); const ax = t => ({ min: 0, max: 100, title: { display: true, text: t, color: mut }, grid: { color: ln }, ticks: { color: mut } });
  scatter = new Chart($('#scatter'), { type: 'scatter', data: { datasets: ds }, plugins: [quadrants], options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: ax('Narrative velocity score (NVS)'), y: ax('Capital backing and smart-money flow') },
    plugins: { legend: { labels: { color: mut } }, tooltip: { callbacks: { label: c => `${c.raw.name}: NVS ${c.raw.x.toFixed(0)}, capital ${c.raw.y.toFixed(0)} (${c.raw.stage})` } } }, onClick: (e, els) => { if (els.length) select(scatter.data.datasets[els[0].datasetIndex].data[els[0].index].id); } } });
  const qc = {}; filtered().forEach(t => { if (t.quadrant) qc[t.quadrant] = (qc[t.quadrant] || 0) + 1; });
  $('#scatter').setAttribute('role', 'img'); $('#scatter').setAttribute('aria-label', 'Scatter of narrative velocity (x) against capital score (y). Trends per quadrant: ' + (Object.entries(qc).map(([k, n]) => `${k} ${n}`).join(', ') || 'none') + '. The table above lists every trend with its scores.');
  const miss = filtered().length - items.length; $('#qnote').textContent = `Bubble size = SMII. ${miss ? miss + ' trend(s) hidden because a score is unavailable. ' : ''}Quadrant lines at 50 on both axes.`;
}
function select(id) {
  sel = id; $$('#nbody tr').forEach(r => r.classList.toggle('sel', r.dataset.id === id)); const t = D.trends.find(x => x.id === id), el = $('#ndetail'); if (!t) return;
  const srcRows = Object.entries(t.narrative_sources).map(([k, s]) => `<tr><td>${esc(SRC[k] || k)}${s.weekly ? ' <span class="muted small">(weekly)</span>' : ''}</td><td class="n ${s.z >= 2 ? 'hot' : ''}">${signed(s.z, 1)}</td><td class="n">${num(s.last, s.last < 1 ? 3 : 0)}</td><td class="n">${num(s.mean, s.mean < 1 ? 3 : 1)}</td><td>${spark(s.series.map((v, i) => [i, v]), s.z >= 2 ? 'var(--bad)' : 'var(--acc)', 70, 18)}</td></tr>`).join('');
  const c = t.smii.components, cmp = (k, n) => `<tr><td>${n}</td><td class="n">${c[k] == null ? '<span class="muted">n/a</span>' : c[k].toFixed(0)}</td></tr>`, tp = (t.capital.tape || {}), tc = tp.components || {};
  const mine = D.signals.filter(s => s.trend === id).slice(0, 4);
  el.innerHTML = `<h3>${esc(t.name)}</h3><p class="muted small">${esc(t.hypothesis)}</p>
   <div class="stagebar">${['Fringe / Seed', 'Developer / Reddit', 'FinTwit / VC', 'Mainstream News'].map((s, i) => `<span class="${i <= t.stage_index ? 'on' : ''}">${s}</span>`).join('')}</div>
   <div class="kpis"><div class="kpi"><span>NVS</span><b>${t.nvs ?? '–'}</b></div><div class="kpi"><span>Capital</span><b>${t.capital.score ?? '–'}</b></div><div class="kpi"><span>SMII</span><b>${t.smii.score ?? '–'}</b></div><div class="kpi"><span>Sentiment x</span><b>${t.sentiment.multiplier}</b></div></div>
   <h4>Narrative evidence <span class="muted small">(z-score of last day vs prior 30)</span></h4><div class="tw"><table class="matrix"><thead><tr><th>Source</th><th class="n">z</th><th class="n">Last</th><th class="n">30d avg</th><th>31d</th></tr></thead><tbody>${srcRows || '<tr><td colspan=5 class="muted">No narrative source returned data.</td></tr>'}</tbody></table></div>
   <h4>Capital &amp; smart-money components</h4><div class="tw"><table class="matrix"><tbody>${cmp('vc', 'VC cluster (40%)')}${cmp('skew', 'Options call skew (40%)')}${cmp('f13', '13F net buying (20%)')}<tr><td>SMII coverage</td><td class="n">${Math.round(t.smii.coverage * 100)}%</td></tr>
   <tr><td>Tape: relative strength 3M vs SPY</td><td class="n">${tp.rs_3m == null ? 'n/a' : signed(tp.rs_3m * 100, 1, '%')}</td></tr><tr><td>Tape: dollar-volume 20d/90d</td><td class="n">${tp.dv_ratio ?? 'n/a'}x</td></tr><tr><td>Tape: money flow (CMF 20d)</td><td class="n">${tp.cmf20 ?? 'n/a'}</td></tr>${t.capital.defi_flow != null ? `<tr><td>DeFi flow score</td><td class="n">${t.capital.defi_flow}</td></tr>` : ''}</tbody></table></div>
   ${mine.length ? '<h4>Latest signals</h4>' + mine.map(s => `<div class="mini-sig sig-${s.strength}"><b>${esc(s.title)}</b><div class="muted small">${esc(s.detail)}</div></div>`).join('') : ''}`;
}
function fillBenchTrends() { const opts = filtered().filter(t => t.basket.path.length > 60); $('#bT').innerHTML = opts.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('') || '<option value="">(no basket price data)</option>'; }
async function drawBench() {
  await loadScript('vendor/chart.umd.js'); const t = D.trends.find(x => x.id === $('#bT').value), b = D.benchmarks.find(x => x.id === $('#bB').value), L = +$('#bL').value, mut = cssVar('--muted'), ln = cssVar('--line');
  if (bench) bench.destroy(); if (!t || !b) { $('#bRead').textContent = 'No basket price data to overlay.'; return; }
  const cur = t.basket.path.slice(-(L + 1)), base = cur[0], now = cur.map((v, i) => ({ x: i, y: +(100 * v / base).toFixed(1) }));
  const after = Math.min(b.path.length - 1, L + 240), bm = b.path.slice(0, L + 1).map((y, x) => ({ x, y })), fut = b.path.slice(L, after + 1).map((y, i) => ({ x: L + i, y }));
  const sliced = Math.min(b.peak_day, b.path.length - 1);
  bench = new Chart($('#bench'), { type: 'line', data: { datasets: [
    { label: 'Current: ' + t.name, data: now, borderColor: cssVar('--acc'), borderWidth: 3, pointRadius: 0, tension: .15 },
    { label: b.name, data: bm, borderColor: '#e2a32c', borderWidth: 2, pointRadius: 0, tension: .15 },
    { label: 'What followed historically', data: fut, borderColor: '#e2a32c', borderDash: [6, 5], borderWidth: 2, pointRadius: 0, tension: .15 },
    { label: 'Historical peak', data: [{ x: sliced, y: b.path[sliced] }], borderColor: '#e5484d', backgroundColor: '#e5484d', pointRadius: sliced <= after ? 6 : 0, showLine: false }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false, scales: { x: { type: 'linear', min: 0, max: after, title: { display: true, text: 'Days since cycle start (rebased to 100)', color: mut }, grid: { color: ln }, ticks: { color: mut } }, y: { title: { display: true, text: 'Index (start = 100)', color: mut }, grid: { color: ln }, ticks: { color: mut } } }, plugins: { legend: { labels: { color: mut } } } } });
  const bAt = b.path[Math.min(L, b.path.length - 1)], cNow = now[now.length - 1].y;
  $('#bRead').innerHTML = `<b>Reading:</b> after ${cur.length - 1} days the current basket is <b>${signed(cNow - 100, 0, '%')}</b>; the ${esc(b.name)} was <b>${signed(bAt - 100, 0, '%')}</b> at the same point. That cycle peaked at day ${b.peak_day} (${signed(b.peak_value - 100, 0, '%')}) and then fell as much as <b>${Math.abs(b.max_drawdown_after_peak * 100).toFixed(0)}%</b> from the peak${b.complete ? '' : ' (cycle still unfolding, so this is incomplete)'}. Similar shape is not evidence of a similar outcome.`;
}
export function initNarratives() { onTab('narratives', load); }
