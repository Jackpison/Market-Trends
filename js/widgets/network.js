import { $, $$, esc, signed, loadScript, cssVar, onTab } from '../util.js';
import { loadTrends, NO_DATA } from '../trendsData.js';
const ROLE = { driver: ['Upstream driver', '#6ea8fe'], core: ['Core trend', '#b36bff'], enabler: ['Enabler', '#2ec98a'], beneficiary: ['Beneficiary', '#4ec9b0'], bottleneck: ['Bottleneck', '#e2a32c'], risk: ['Risk / laggard', '#e5484d'] };
let loaded = false, N, D, G, gid = null, net = null, nodes, edges;
async function load() {
  if (loaded) return; loaded = true; const root = $('#view-network'); D = await loadTrends();
  try { N = await (await fetch('config/network.json')).json(); } catch (e) { root.innerHTML = '<div class="panel"><div class="notice">Could not load config/network.json.</div></div>'; return; }
  root.innerHTML = `<div class="panel glass"><div class="listhead"><div><h2>Asset connectivity network</h2><p class="muted small" id="nBlurb"></p></div><div class="controls"><label>Map <select id="nSel">${N.graphs.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label><button class="ghost" id="nClear">Clear selection</button></div></div>
   <div class="legend nlegend">${Object.entries(ROLE).map(([k, [n, c]]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}<span class="muted">Border = average 3M price move of the node's tickers (green up, red down).</span></div>
   <div class="split nsplit"><div id="vis" class="vis"></div><div id="nSide" class="nside"></div></div>
   <p class="muted small">These are <b>editorial hypothesis maps</b> of how a trend could propagate, not computed causal links. Live quotes are overlaid from the latest run. Click a node to highlight its upstream drivers and downstream effects.</p></div>`;
  $('#nSel').onchange = e => build(e.target.value); $('#nClear').onclick = () => select(null); document.addEventListener('themechange', () => { if (net && $('#view-network').classList.contains('on')) build(gid); });
  await loadScript('vendor/vis-network.min.js'); build(N.graphs[0].id);
}
function levels(g) {
  const pred = {}; g.nodes.forEach(n => pred[n.id] = []); g.edges.forEach(e => pred[e.to].push(e.from)); const memo = {};
  const lv = (id, stack = []) => { if (memo[id] != null) return memo[id]; if (stack.includes(id)) return 0; const p = pred[id]; return memo[id] = p.length ? 1 + Math.max(...p.map(x => lv(x, [...stack, id]))) : 0; };
  g.nodes.forEach(n => lv(n.id)); return memo;
}
const q = s => (D && D.network_quotes && D.network_quotes[s]) || null;
const avg3m = n => { const v = n.tickers.map(t => q(t)).filter(x => x && x.ret_3m != null).map(x => x.ret_3m); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
function build(id) {
  gid = id; G = N.graphs.find(g => g.id === id); $('#nBlurb').textContent = G.blurb; const lv = levels(G), txt = cssVar('--ink'), ln = cssVar('--line');
  nodes = new vis.DataSet(G.nodes.map(n => { const r = avg3m(n), bc = r == null ? ROLE[n.role][1] : r >= 0 ? '#2ec98a' : '#e5484d';
    return { id: n.id, level: lv[n.id], label: n.label + (n.tickers.length ? '\n' + n.tickers.join(' ') : ''), shape: 'box', margin: 10, borderWidth: r == null ? 1.5 : 3, color: { background: ROLE[n.role][1] + '33', border: bc, highlight: { background: ROLE[n.role][1] + '66', border: bc }, hover: { background: ROLE[n.role][1] + '55', border: bc } }, font: { color: txt, size: 13, face: 'JetBrains Mono, monospace' }, widthConstraint: { maximum: 170 } }; }));
  edges = new vis.DataSet(G.edges.map((e, i) => ({ id: i, from: e.from, to: e.to, label: '', title: e.label, arrows: 'to', font: { size: 10, color: cssVar('--muted'), strokeWidth: 3, strokeColor: cssVar('--card'), face: 'JetBrains Mono, monospace' }, color: { color: ln, highlight: cssVar('--acc') }, smooth: { type: 'cubicBezier', forceDirection: 'horizontal' } })));
  if (net) net.destroy();
  net = new vis.Network($('#vis'), { nodes, edges }, { layout: { hierarchical: { enabled: true, direction: 'LR', levelSeparation: 230, nodeSpacing: 95, sortMethod: 'directed' } }, physics: false, interaction: { hover: true, tooltipDelay: 120 }, nodes: { shadow: false } });
  net.on('click', p => select(p.nodes[0] || null)); select(null);
}
function reach(start, dir) { const seen = new Set(), st = [start]; while (st.length) { const c = st.pop(); G.edges.forEach(e => { const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from]; if (a === c && !seen.has(b)) { seen.add(b); st.push(b); } }); } return seen; }
const chip = s => { const x = q(s); return `<span class="tkchip ${x && x.ret_3m != null ? (x.ret_3m >= 0 ? 'up' : 'dn') : ''}" title="${x ? 'last ' + x.last : 'no quote'}">${esc(s)}${x && x.ret_3m != null ? ' ' + signed(x.ret_3m * 100, 0, '%') : ''}</span>`; };
const item = n => `<div class="nitem"><b>${esc(n.label)}</b><div class="muted small">${esc(n.note)}</div>${n.tickers.length ? '<div>' + n.tickers.map(chip).join(' ') + '</div>' : ''}</div>`;
function select(id) {
  const side = $('#nSide'), byId = Object.fromEntries(G.nodes.map(n => [n.id, n]));
  if (!id) { nodes.update(G.nodes.map(n => ({ id: n.id, opacity: 1 }))); edges.update(G.edges.map((e, i) => ({ id: i, label: '', color: { color: cssVar('--muted'), opacity: .6 } })));
    side.innerHTML = '<h4>Whole map by role</h4>' + Object.entries(ROLE).map(([k, [name, c]]) => { const l = G.nodes.filter(n => n.role === k); return l.length ? `<div class="rolehead" style="border-color:${c}">${name}</div>` + l.map(item).join('') : ''; }).join(''); return; }
  const up = reach(id, 'up'), down = reach(id, 'down'), keep = new Set([id, ...up, ...down]);
  nodes.update(G.nodes.map(n => ({ id: n.id, opacity: keep.has(n.id) ? 1 : 0.18 }))); edges.update(G.edges.map((e, i) => { const on = keep.has(e.from) && keep.has(e.to); return { id: i, label: on ? e.label : '', color: { color: on ? cssVar('--acc') : cssVar('--line'), opacity: on ? 1 : 0.15 } }; }));
  const pick = (set, f) => [...set].map(k => byId[k]).filter(n => n && f(n)), sec = (t, l, c) => l.length ? `<div class="rolehead" style="border-color:${c}">${t}</div>` + l.map(item).join('') : '';
  const n0 = byId[id]; side.innerHTML = `<h4>${esc(n0.label)} <span class="pill" style="background:${ROLE[n0.role][1]}33">${ROLE[n0.role][0]}</span></h4><p class="muted small">${esc(n0.note)}</p>${n0.tickers.length ? '<div>' + n0.tickers.map(chip).join(' ') + '</div>' : ''}
   ${sec('Upstream drivers', pick(up, n => n.role === 'driver' || n.role === 'core' || n.role === 'enabler'), ROLE.driver[1])}${sec('Primary beneficiaries', pick(down, n => n.role === 'beneficiary' || n.role === 'enabler'), ROLE.beneficiary[1])}
   ${sec('Raw-material & supply bottlenecks', pick(new Set([...up, ...down]), n => n.role === 'bottleneck'), ROLE.bottleneck[1])}${sec('Downstream risks & laggards', pick(down, n => n.role === 'risk'), ROLE.risk[1])}`;
}
export function initNetwork() { onTab('network', load); }
