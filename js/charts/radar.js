import { esc, tip } from '../util.js';
/** Radar of category risk scores (0-100). Rings: 50 = warning edge, 100 = critical. */
export function drawRadar(svg, cats) {
  const W = 600, cx = 300, cy = 215, R = 140, n = cats.length;
  const SHORT = { curve: 'Yield curve', liquidity: 'Liquidity', credit: 'Credit & banks', cross: 'FX / commodities', vol: 'Volatility', growth: 'Labor & growth' };
  const ang = i => (-90 + i * 360 / n) * Math.PI / 180, pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  let h = '';
  [25, 50, 75, 100].forEach(l => {
    const pts = cats.map((_, i) => pt(i, R * l / 100).map(x => x.toFixed(1)).join(',')).join(' ');
    const cls = l === 50 ? 'ring warn' : l === 100 ? 'ring bad' : 'ring';
    h += `<polygon class="${cls}" points="${pts}"/>`;
  });
  cats.forEach((c, i) => {
    const [x, y] = pt(i, R), [lx, ly] = pt(i, R + 26);
    h += `<line class="spoke" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
    const a = Math.cos(ang(i)); const anchor = Math.abs(a) < .25 ? 'middle' : a > 0 ? 'start' : 'end';
    h += `<text class="rlabel" x="${lx}" y="${ly + 4}" text-anchor="${anchor}">${esc(SHORT[c.id] || c.name)}</text>`;
  });
  const vals = cats.map(c => c.score == null ? 0 : c.score);
  h += `<polygon class="shape" points="${vals.map((v, i) => pt(i, R * v / 100).map(x => x.toFixed(1)).join(',')).join(' ')}"/>`;
  cats.forEach((c, i) => { const [x, y] = pt(i, R * vals[i] / 100); h += `<circle class="vtx" data-i="${i}" cx="${x}" cy="${y}" r="5.5"/>`; });
  svg.setAttribute('viewBox', `0 0 ${W} 430`); svg.innerHTML = h;
  svg.onmousemove = e => { const i = e.target.dataset?.i; if (i == null) return tip.hide(); const c = cats[i]; tip.show(`<b>${esc(c.name)}</b><br>risk score ${c.score == null ? 'no data' : c.score.toFixed(0)} / 100<br>weight ${(c.weight * 100).toFixed(0)}%`, e); };
  svg.onmouseleave = tip.hide;
}
