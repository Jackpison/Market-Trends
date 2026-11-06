import { $, esc, num } from '../util.js';
import { loadTrends } from '../trendsData.js';
export async function initTicker() {
  const d = await loadTrends(); const bar = $('#tickerbar'); if (!d || !(d.ticker || []).length) return;
  const item = t => { const c = t.chg * 100, cls = c > 0.005 ? 'up' : c < -0.005 ? 'dn' : ''; return `<span class="tk"><b>${esc(t.name)}</b> ${num(t.last, t.last >= 1000 ? 0 : 2)} <i class="${cls}">${c > 0 ? '+' : ''}${num(c, 2)}%</i></span>`; };
  const html = d.ticker.map(item).join('');
  bar.innerHTML = `<div class="tk-track"><div class="tk-set">${html}</div><div class="tk-set" aria-hidden="true">${html}</div></div><span class="tk-asof" title="Prices refresh every 6 hours">as of ${esc(d.generated.replace('T', ' '))} UTC</span>`; bar.hidden = false;
}
