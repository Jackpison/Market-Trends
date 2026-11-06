import { onThemeChange } from './theme.js';

let src = '';
async function draw(theme) {
  const el = document.getElementById('cascade');
  if (!window.mermaid || !src) return;
  try {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : 'neutral', flowchart: { curve: 'basis', htmlLabels: true } });
    const { svg } = await window.mermaid.render('cascade-svg-' + Date.now(), src);
    el.innerHTML = svg;
  } catch (e) {
    el.innerHTML = `<pre class="muted">${src.replace(/</g, '&lt;')}</pre>`;
  }
}

export async function initCascade() {
  const el = document.getElementById('cascade');
  try {
    const r = await fetch('docs/cascade.mmd');
    if (!r.ok) throw new Error(r.status);
    src = await r.text();
  } catch { el.textContent = 'Serve over http(s) to load docs/cascade.mmd (fetch is blocked on file://).'; return; }
  draw(document.documentElement.dataset.theme);
  onThemeChange(draw);
}
