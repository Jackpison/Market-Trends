import { tip } from '../util.js';
const W = 760, H = 330, m = { l: 44, r: 14, t: 14, b: 30 };
export function scaleFor(curves) { const all = curves.flat().filter(x => x != null); return { lo: Math.min(0, ...all) - .3, hi: Math.max(...all) + .4 }; }
/** 2D curve for one date plus an optional ghost (e.g. a year earlier). */
export function draw2D(svg, labels, curve, ghost, sc) {
  const X = i => m.l + i / (labels.length - 1) * (W - m.l - m.r), Y = v => H - m.b - (v - sc.lo) / (sc.hi - sc.lo) * (H - m.t - m.b);
  let h = '';
  for (let k = 0; k <= 5; k++) { const v = sc.lo + (sc.hi - sc.lo) * k / 5, y = Y(v); h += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="ax" x="${m.l - 6}" y="${y + 3}" text-anchor="end">${v.toFixed(1)}%</text>`; }
  h += `<line class="zero" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  labels.forEach((l, i) => { h += `<text class="ax" x="${X(i)}" y="${H - 10}" text-anchor="middle">${l}</text>`; });
  const path = (c, cls) => { const p = c.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean); return p.length > 1 ? `<polyline class="${cls}" fill="none" points="${p.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}"/>` : ''; };
  if (ghost) h += path(ghost, 'ghost');
  h += path(curve, 'now');
  curve.forEach((v, i) => { if (v != null) h += `<circle class="pt" data-i="${i}" cx="${X(i)}" cy="${Y(v)}" r="4"/>`; });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = h;
  svg.onmousemove = e => { const i = e.target.dataset?.i; if (i == null) return tip.hide(); tip.show(`<b>${labels[i]}</b>: ${curve[i].toFixed(2)}%${ghost && ghost[i] != null ? `<br>year earlier: ${ghost[i].toFixed(2)}%` : ''}`, e); };
  svg.onmouseleave = tip.hide;
}
/** Pseudo-3D ridge view: each month is a curve, offset in depth. Red ridges are inverted (10Y below 2Y). */
export function drawRidge(svg, labels, dates, curves, idx, span = 72) {
  const start = Math.max(0, idx - span + 1), sel = curves.slice(start, idx + 1), sc = scaleFor(curves), N = Math.max(1, sel.length - 1);
  const dx = 120, dy = 150, w = W - m.l - m.r - dx, hh = H - m.t - m.b - dy, base = H - m.b;
  let h = '';
  sel.forEach((c, k) => {
    const d = 1 - k / N;  // 1 = oldest (back), 0 = selected date (front)
    const pts = [];
    c.forEach((v, i) => { if (v != null) pts.push([m.l + i / (labels.length - 1) * w + d * dx, base - (v - sc.lo) / (sc.hi - sc.lo) * hh - d * dy]); });
    if (pts.length < 2) return;
    const inv = c[8] != null && c[4] != null && c[8] < c[4], poly = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), floor = (base - d * dy).toFixed(1);
    h += `<polygon class="ridge-fill" points="${pts[0][0].toFixed(1)},${floor} ${poly} ${pts[pts.length - 1][0].toFixed(1)},${floor}"/><polyline class="ridge ${inv ? 'inv' : ''}" fill="none" points="${poly}"/>`;
  });
  labels.forEach((l, i) => { h += `<text class="ax" x="${m.l + i / (labels.length - 1) * w}" y="${H - 10}" text-anchor="middle">${l}</text>`; });
  h += `<text class="ax" x="${m.l}" y="${m.t + 8}">back: ${dates[start]?.slice(0, 7)}  to  front: ${dates[idx]?.slice(0, 7)}  (red = 10Y below 2Y)</text>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = h; svg.onmousemove = null; svg.onmouseleave = null;
}
