export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export async function getJSON(p) { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); }
export const num = (v, d = 2) => { if (v == null || !isFinite(v)) return '–'; if (Math.abs(v) < 0.5 / Math.pow(10, d)) v = 0; return Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); };
export const signed = (v, d = 2, suf = '') => v == null || !isFinite(v) ? '–' : (v >= 0.5 / Math.pow(10, d) ? '+' : '') + num(v, d) + suf;
export const unitFmt = (v, u) => v == null ? '–' : u === '%' ? num(v, 2) + '%' : u === 'pp' ? num(v, 2) + 'pp' : u === '$bn' ? '$' + num(v, 1) + 'bn' : num(v, 1);
export const STATUS = { green: 'var(--ok)', yellow: 'var(--warn)', red: 'var(--bad)', nodata: 'var(--muted)', stale: 'var(--muted)' };
export const scoreColor = s => s == null ? 'var(--line)' : `hsl(${Math.round(125 - 1.25 * Math.max(0, Math.min(100, s)))} 68% ${document.documentElement.dataset.mode === 'light' ? 48 : 46}%)`;
const tipEl = () => document.getElementById('tip');
export const tip = {
  show(html, e) { const t = tipEl(); if (!t) return; t.innerHTML = html; t.hidden = false; const w = t.offsetWidth, x = Math.min(e.clientX + 14, innerWidth - w - 10); t.style.left = Math.max(8, x) + 'px'; t.style.top = (e.clientY + 16) + 'px'; },
  hide() { const t = tipEl(); if (t) t.hidden = true; },
};
/** Run `cb` whenever the named tab becomes active (and once now if it already is). */
export function onTab(name, cb) {
  document.addEventListener('tabchange', e => { if (e.detail === name) cb(); });
  if ((location.hash || '#radar').slice(1) === name) cb();
}
export function emptyNotice(msg) { return `<div class="notice">${msg}</div>`; }
export const RUN_HINT = 'No data yet. Open the repo <b>Actions</b> tab, choose <b>Update data</b> and press <b>Run workflow</b>; refresh this page after it finishes (about 2 minutes).';
