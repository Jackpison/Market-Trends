import { $ } from './util.js';
import { initEarlyWarning } from './widgets/earlyWarning.js';
import { initYieldCurve } from './widgets/yieldCurve.js';
import { initStressTest } from './widgets/stressTest.js';
import { initNav } from './nav.js';
import { initTicker } from './widgets/ticker.js';
import { initNarratives } from './widgets/narratives.js';
import { initCapital } from './widgets/capitalFlows.js';
import { initNetwork } from './widgets/network.js';
import { initSmartMoney } from './widgets/smartMoney.js';

function initTheme() {
  const root = document.documentElement; let saved = null;
  try { saved = localStorage.getItem('mt-theme'); } catch (e) {}
  const apply = m => { root.dataset.theme = m; root.dataset.mode = m; document.dispatchEvent(new CustomEvent('themechange', { detail: m })); const b = $('#themeBtn'); if (b) b.textContent = m === 'dark' ? '\u2600 Light' : '\u263E Dark'; };
  apply(saved || 'dark');
  $('#themeBtn').onclick = () => { const n = root.dataset.mode === 'dark' ? 'light' : 'dark'; apply(n); try { localStorage.setItem('mt-theme', n); } catch (e) {} };
}
initTheme(); initNav(); initTicker(); initEarlyWarning(); initYieldCurve(); initStressTest(); initNarratives(); initCapital(); initNetwork(); initSmartMoney();
