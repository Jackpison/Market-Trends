import { getJSON, esc } from './util.js';
// Stale-data banner: the scheduled workflows fail silently, so the page says when its own data is old or sources are failing.
const HOUR = 3600e3, TRENDS_MAX_H = 26, INDICATORS_MAX_H = 80;   // GitHub cron is best-effort: observed gaps between 6-hourly runs reach ~27h. Indicators run weekdays 22:30 UTC (Fri->Mon gap ~72h)
const age = g => { const t = Date.parse(g || ''); return isNaN(t) ? null : (Date.now() - t) / HOUR; };
const fmt = h => h >= 48 ? Math.round(h / 24) + ' days' : Math.round(h) + ' hours';
export async function initHealth() {
  const bar = document.getElementById('healthbar'); if (!bar) return;
  const [t, i] = await Promise.all([getJSON('data/macro_data.json').catch(() => null), getJSON('data/indicators/latest.json').catch(() => null)]);
  const msgs = [], at = t && age(t.generated), ai = i && age(i.generated);
  if (!t) msgs.push('Trend data could not be loaded.'); else if (at != null && at > TRENDS_MAX_H) msgs.push(`Trend data is ${fmt(at)} old (it is scheduled every 6 hours, but GitHub can delay scheduled runs).`);
  if (!i) msgs.push('Indicator data could not be loaded.'); else if (ai != null && ai > INDICATORS_MAX_H) msgs.push(`Indicator data is ${fmt(ai)} old (it should refresh each weekday).`);
  const failed = t ? Object.entries(t.status || {}).filter(([, v]) => v.state === 'failed').map(([k]) => k) : [];
  if (failed.length) msgs.push(`${failed.length} data source${failed.length > 1 ? 's' : ''} failing: ${failed.map(esc).join(', ')}.`);
  if (!msgs.length) { bar.hidden = true; return; }
  bar.innerHTML = `<div class="wrap"><b>Data health</b> ${msgs.join(' ')} <a href="https://github.com/Jackpison/Market-Trends/actions" target="_blank" rel="noopener">Check the scheduled workflows</a>.</div>`;
  bar.hidden = false;
}
