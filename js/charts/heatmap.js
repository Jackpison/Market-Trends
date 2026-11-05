import { esc, scoreColor, tip } from '../util.js';
/** Indicator x month risk heatmap. data: {months, rows:[{name,cat,scores}]} */
export function drawHeatmap(svg, data, catNames) {
  const rows = data.rows, n = data.months.length, L = 200, W = 1000, rh = 17, top = 18, cw = (W - L - 6) / n, H = top + rows.length * rh + 6;
  let h = '';
  data.months.forEach((m, i) => { if (m.endsWith('-01') && +m.slice(0, 4) % 2 === 0) h += `<text class="ax" x="${(L + i * cw).toFixed(1)}" y="11">${m.slice(0, 4)}</text>`; });
  rows.forEach((r, j) => {
    const y = top + j * rh; h += `<text class="rowlabel" x="${L - 8}" y="${y + 12}" text-anchor="end">${esc(r.name.length > 34 ? r.name.slice(0, 33) + '…' : r.name)}</text>`;
    r.scores.forEach((s, i) => { h += `<rect data-r="${j}" data-c="${i}" x="${(L + i * cw).toFixed(1)}" y="${y}" width="${(cw + .4).toFixed(2)}" height="${rh - 2}" fill="${scoreColor(s)}" opacity="${s == null ? .25 : 1}"/>`; });
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.height = 'auto'; svg.innerHTML = h;
  svg.onmousemove = e => { const t = e.target.dataset; if (t.r == null) return tip.hide(); const r = rows[+t.r], s = r.scores[+t.c]; tip.show(`<b>${esc(r.name)}</b><br>${data.months[+t.c]}: ${s == null ? 'no data' : 'risk ' + s.toFixed(0) + '/100'}`, e); };
  svg.onmouseleave = tip.hide;
}
