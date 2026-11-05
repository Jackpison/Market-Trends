import { $ } from './util.js';
import { initEarlyWarning } from './widgets/earlyWarning.js';
import { initYieldCurve } from './widgets/yieldCurve.js';
import { initStressTest } from './widgets/stressTest.js';

function initTheme() {
  const root = document.documentElement; let saved = null;
  try { saved = localStorage.getItem('mt-theme'); } catch (e) {}
  const apply = m => { root.dataset.theme = m; root.dataset.mode = m; const b = $('#themeBtn'); if (b) b.textContent = m === 'dark' ? '\u2600 Light' : '\u263E Dark'; };
  apply(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  $('#themeBtn').onclick = () => { const n = root.dataset.mode === 'dark' ? 'light' : 'dark'; apply(n); try { localStorage.setItem('mt-theme', n); } catch (e) {} };
}
initTheme(); initEarlyWarning(); initYieldCurve(); initStressTest();
