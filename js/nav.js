import { $, $$, esc } from './util.js';
const GROUPS = [
  { id: 'macro', label: 'Macro', tabs: [['radar', 'Radar'], ['yield', 'Yield curve'], ['stress', 'Stress test']] },
  { id: 'trends', label: 'Trends', tabs: [['narratives', 'Narratives'], ['capital', 'Capital & DeFi'], ['network', 'Network'], ['smart', 'Smart money']] },
  { id: 'history', label: 'History', tabs: [['timeline', 'Timeline'], ['months', 'Monthly'], ['markets', 'Markets']] },
  { id: 'learn', label: 'Learn', tabs: [['learn', 'Docs'], ['about', 'Data & sources']] },
];
const last = {};
export function initNav() {
  $('#tabs').innerHTML = GROUPS.map(g => `<button data-group="${g.id}">${esc(g.label)}</button>`).join('');
  $('#tabs').addEventListener('click', e => { const g = e.target.dataset?.group; if (!g) return; const grp = GROUPS.find(x => x.id === g); location.hash = '#' + (last[g] || grp.tabs[0][0]); });
  $('#subnav').addEventListener('click', e => { const t = e.target.dataset?.tab; if (t) location.hash = '#' + t; });
  const sync = () => {
    const tab = (location.hash || '#radar').slice(1), grp = GROUPS.find(g => g.tabs.some(t => t[0] === tab)) || GROUPS[0]; last[grp.id] = tab;
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.group === grp.id));
    $('#subnav').innerHTML = grp.tabs.map(([id, n]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${esc(n)}</button>`).join('');
  };
  addEventListener('hashchange', sync); sync();
}
