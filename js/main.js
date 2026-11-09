import { $ } from './util.js';
import { icon, hydrateIcons } from './icons.js';
import { initEarlyWarning } from './widgets/earlyWarning.js';
import { initYieldCurve } from './widgets/yieldCurve.js';
import { initStressTest } from './widgets/stressTest.js';
import { initNav } from './nav.js';
import { initTicker } from './widgets/ticker.js';
import { initNarratives } from './widgets/narratives.js';
import { initCapital } from './widgets/capitalFlows.js';
import { initNetwork } from './widgets/network.js';
import { initSmartMoney } from './widgets/smartMoney.js';
import { initHealth } from './health.js';
import { initA11y } from './a11y.js';

function initTheme() {
  const root = document.documentElement; let saved = null;
  try { saved = localStorage.getItem('mt-theme'); } catch (e) {}
  const apply = m => { root.dataset.theme = m; root.dataset.mode = m; document.dispatchEvent(new CustomEvent('themechange', { detail: m })); const b = $('#themeBtn'); if (b) b.innerHTML = m === 'dark' ? icon('sun', 15) + ' Light' : icon('moon', 15) + ' Dark'; };
  apply(saved || 'dark');
  $('#themeBtn').onclick = () => { const n = root.dataset.mode === 'dark' ? 'light' : 'dark'; apply(n); try { localStorage.setItem('mt-theme', n); } catch (e) {} };
}
hydrateIcons(); initTheme(); initNav(); initTicker(); initEarlyWarning(); initYieldCurve(); initStressTest(); initNarratives(); initCapital(); initNetwork(); initSmartMoney();
initA11y(); initHealth();
