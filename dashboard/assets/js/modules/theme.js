const KEY = 'mt-theme';
const listeners = new Set();

export const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const onThemeChange = (fn) => listeners.add(fn);

function apply(t) {
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle('dark', t === 'dark');
  const b = document.getElementById('theme-toggle');
  if (b) b.textContent = t === 'dark' ? '☀ Light' : '☾ Dark';
  listeners.forEach((fn) => fn(t));
}

export function initTheme() {
  let t = 'dark';
  try { t = localStorage.getItem(KEY) || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch {}
  apply(t);
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    t = t === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, t); } catch {}
    apply(t);
  });
}

export function chartDefaults() {
  const C = window.Chart;
  if (!C) return;
  C.defaults.color = cssVar('--muted');
  C.defaults.borderColor = cssVar('--border');
  C.defaults.font.family = cssVar('--mono-font') || 'monospace';
  C.defaults.font.size = 11;
}
