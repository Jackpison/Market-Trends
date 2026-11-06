import { tip } from '../util.js';
/** Line chart for [[label, value], ...]. opts: {lines:[{y,cls}], fmt, height} */
export function lineChart(svg, pts, opts = {}) {
  const W = 760, H = opts.height || 240, m = { l: 48, r: 12, t: 12, b: 24 };
  if (!pts || pts.length < 2) { svg.innerHTML = ''; return; }
  const ys = pts.map(p => p[1]).concat((opts.lines || []).map(l => l.y));
  let lo = Math.min(...ys), hi = Math.max(...ys); const pad = (hi - lo) * .08 || 1; lo -= pad; hi += pad;
  const X = i => m.l + i / (pts.length - 1) * (W - m.l - m.r), Y = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);
  const f = opts.fmt || (v => Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  let h = '';
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); h += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="ax" x="${m.l - 6}" y="${y + 3}" text-anchor="end">${f(v)}</text>`; }
  let last = '';
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (opts.monthly) pts.forEach((p, i) => { const m = p[0].slice(0, 7); if (m !== last) h += `<text class="ax" x="${X(i)}" y="${H - 7}" text-anchor="middle">${MN[+m.slice(5, 7) - 1]}</text>`; last = m; });
  else pts.forEach((p, i) => { const y = p[0].slice(0, 4); if (y !== last && (+y % (pts.length > 150 ? 5 : 2) === 0)) { h += `<text class="ax" x="${X(i)}" y="${H - 7}" text-anchor="middle">${y}</text>`; } last = y; });
  (opts.lines || []).forEach(l => { h += `<line class="thr ${l.cls}" x1="${m.l}" x2="${W - m.r}" y1="${Y(l.y)}" y2="${Y(l.y)}"/>`; });
  h += `<polyline class="ln" fill="none" points="${pts.map((p, i) => X(i).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}"/><line id="lcx" class="cross" y1="${m.t}" y2="${H - m.b}" style="display:none"/>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = h;
  const cx = svg.querySelector('#lcx');
  svg.onmousemove = e => { const b = svg.getBoundingClientRect(), px = (e.clientX - b.left) / b.width * W; const i = Math.max(0, Math.min(pts.length - 1, Math.round((px - m.l) / (W - m.l - m.r) * (pts.length - 1)))); cx.style.display = ''; cx.setAttribute('x1', X(i)); cx.setAttribute('x2', X(i)); tip.show(`<b>${pts[i][0]}</b><br>${f(pts[i][1])}`, e); };
  svg.onmouseleave = () => { tip.hide(); cx.style.display = 'none'; };
}
