import { $, $$, esc } from './util.js';
import { icon } from './icons.js';
const GI = { macro: 'gauge', trends: 'trending-up', history: 'history', learn: 'book-open' };
const TI = { radar: 'radar', yield: 'chart-line', stress: 'sliders-horizontal', narratives: 'radio', capital: 'coins', network: 'network', smart: 'fish', timeline: 'history', months: 'clock', markets: 'chart-column', learn: 'book-open', about: 'database' };
const GROUPS = [
  { id: 'macro', label: 'Macro', tabs: [['radar', 'Radar'], ['yield', 'Yield curve'], ['stress', 'Stress test']] },
  { id: 'trends', label: 'Trends', tabs: [['narratives', 'Narratives'], ['capital', 'Capital & DeFi'], ['network', 'Network'], ['smart', 'Smart money']] },
  { id: 'history', label: 'History', tabs: [['timeline', 'Timeline'], ['months', 'Monthly'], ['markets', 'Markets']] },
  { id: 'learn', label: 'Learn', tabs: [['learn', 'Docs'], ['about', 'Data & sources']] },
];
const last = {};
export function initNav() {
  $('#tabs').innerHTML = GROUPS.map(g => `<button data-group="${g.id}">${icon(GI[g.id], 15)}<span class="lbl">${esc(g.label)}</span></button>`).join('');
  $('#tabs').addEventListener('click', e => { const g = e.target.closest('[data-group]')?.dataset.group; if (!g) return; const grp = GROUPS.find(x => x.id === g); location.hash = '#' + (last[g] || grp.tabs[0][0]); });
  $('#subnav').addEventListener('click', e => { const t = e.target.closest('[data-tab]')?.dataset.tab; if (t) location.hash = '#' + t; });
  const sync = () => {
    const tab = (location.hash || '#radar').slice(1), grp = GROUPS.find(g => g.tabs.some(t => t[0] === tab)) || GROUPS[0]; last[grp.id] = tab;
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.group === grp.id));
    $('#subnav').innerHTML = grp.tabs.map(([id, n]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${icon(TI[id], 14)}${esc(n)}</button>`).join('');
  };
  addEventListener('hashchange', () => { sync(); requestAnimationFrame(() => scrollTo({ top: 0 })); }); sync();
}
