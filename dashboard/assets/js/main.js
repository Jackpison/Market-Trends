import { initTheme } from './modules/theme.js';
import { loadLive } from './modules/live.js';
import { initRadar } from './modules/radar.js';
import { initYield } from './modules/yieldcurve.js';
import { initHeatmap } from './modules/heatmap.js';
import { initStress } from './modules/stress.js';
import { initImpact } from './modules/impact.js';
import { initCascade } from './modules/cascade.js';

// Chart.js is loaded via a classic <script> before this module runs (modules are deferred).
initTheme();
await loadLive();   // swap in real pipeline data before any widget renders (falls back to simulation)
const safe = (name, fn) => { try { fn(); } catch (e) { console.error(`[${name}]`, e); } };
safe('radar', initRadar);
safe('yield', initYield);
safe('heatmap', initHeatmap);
safe('stress', initStress);
safe('impact', initImpact);
safe('cascade', initCascade);

document.getElementById('year').textContent = new Date().getFullYear();
