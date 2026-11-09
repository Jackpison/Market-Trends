// Accessibility + responsive helpers that apply to every dynamically rendered view.
//  - scrollable table wrappers become keyboard-focusable regions
//  - clickable rows (tr[data-id]) become focusable buttons operable with Enter / Space
//  - table cells get data-label so the trend table can reflow into cards on phones (CSS)
let queued = false;
function enhance() {
  queued = false;
  document.querySelectorAll('.tw:not([data-a11y])').forEach(w => { w.dataset.a11y = '1'; w.tabIndex = 0; w.setAttribute('role', 'region'); w.setAttribute('aria-label', 'Scrollable table'); });
  document.querySelectorAll('tr[data-id]:not([data-a11y])').forEach(r => { r.dataset.a11y = '1'; r.tabIndex = 0; r.setAttribute('role', 'button'); });
  document.querySelectorAll('table.nt').forEach(t => {
    const heads = [...t.querySelectorAll('thead th')].map(h => h.textContent.trim());
    t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { if (heads[i] && !td.dataset.label) td.dataset.label = heads[i]; }));
  });
}
export function initA11y() {
  document.addEventListener('keydown', e => {
    const el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el.matches && el.matches('tr[data-id], .nitem[data-node]')) { e.preventDefault(); el.click(); }
  });
  const main = document.querySelector('main');
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(enhance); } }).observe(main, { childList: true, subtree: true });
  enhance();
}
