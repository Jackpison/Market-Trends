import { icon } from '../icons.js';
import { $, $$, esc, getJSON, num, signed, unitFmt, STATUS, scoreColor, onTab, RUN_HINT } from '../util.js';
import { drawRadar } from '../charts/radar.js';
import { drawHeatmap } from '../charts/heatmap.js';
import { lineChart } from '../charts/linechart.js';
import { spark } from '../charts/spark.js';

let loaded = false, D = null, HM = null, BT = null, AL = null, filter = 'all', selId = null;
const STATUS_LABEL = { green: 'OK', yellow: 'WARN', red: 'ALERT', nodata: 'NO DATA', stale: 'STALE' };

async function load() {
  if (loaded) return; loaded = true;
  const root = $('#view-radar');
  try { D = await getJSON('data/indicators/latest.json'); } catch (e) { root.innerHTML = `<div class="panel"><h2>Early-warning radar</h2><div class="notice">${RUN_HINT}</div></div>`; return; }
  try { HM = await getJSON('data/indicators/heatmap.json'); } catch (e) { HM = null; }
  try { BT = await getJSON('data/indicators/backtest.json'); } catch (e) { BT = null; }
  try { AL = await getJSON('data/alerts.json'); } catch (e) { AL = null; }
  render(root);
}

function render(root) {
  const cov = D.coverage, c = D.composite;
  const col = c == null ? 'var(--muted)' : scoreColor(c);
  root.innerHTML = `
  <div class="panel hero">
    <div class="hero-main">
      <div class="gauge"><div class="gnum" style="color:${col}">${c == null ? '–' : c.toFixed(0)}</div><div class="glabel">composite risk (0-100)</div></div>
      <div><div class="regime" style="border-color:${col};color:${col}">${esc(D.regime || 'Insufficient data')}</div>
      <p class="muted">Data as of ${esc(D.generated)} UTC &middot; ${cov.with_data} of ${cov.total} indicators have fresh data</p></div>
    </div>
    ${cov.with_data < 8 ? `<div class="notice">Only ${cov.with_data} of ${cov.total} indicators have data, so the composite is incomplete. ${RUN_HINT}</div>` : ''}
  </div>
  ${AL ? alertsPanel() : ''}
  <div class="split">
    <div class="panel"><h3>Risk radar by category</h3><svg id="radar" class="radar" role="img" aria-label="Category risk radar"></svg>
      <div class="legend"><i class="lg"></i>0-49 normal <i class="ly"></i>50-99 warning <i class="lr"></i>100 critical</div></div>
    <div class="panel"><h3>Category scores</h3><div id="catlist"></div>
      <p class="muted small">Score per indicator is 0 at the calm end, 50 at the warning threshold and 100 at the critical threshold. Thresholds are heuristics editable in <code>config/indicators.json</code>.</p></div>
  </div>
  <div class="panel"><div class="listhead"><h3>Indicator matrix</h3><div id="catchips" class="chips"></div></div>
    <div class="tw"><table class="matrix"><thead><tr><th></th><th>Indicator</th><th class="n">Latest</th><th class="n">1M chg</th><th class="n">3M chg</th><th class="n">10Y pctile</th><th>Risk</th><th>3Y trend</th></tr></thead><tbody id="mbody"></tbody></table></div></div>
  <div id="ewDetail" class="panel" hidden></div>
  ${BT ? trackPanel() : ''}
  ${HM ? `<div class="panel"><h3>Risk heatmap, last 15 years</h3><p class="muted small">Each cell is the indicator's risk score at month end. Grey = no data. Credit-spread history on FRED is limited to roughly 3 years (license).</p><svg id="hm" class="hm"></svg>
  <h3 style="margin-top:18px">Composite risk history${BT ? ' (since 1990)' : ''}</h3><svg id="comp" class="lc"></svg></div>` : ''}`;
  drawRadar($('#radar'), D.categories);
  $('#radar').setAttribute('aria-label', 'Category risk radar. ' + D.categories.map(k => `${k.name} ${k.score == null ? 'no data' : Math.round(k.score)}`).join(', ') + '. Scale 0 to 100.');
  $('#catlist').innerHTML = D.categories.map(k => `<div class="catrow"><span>${esc(k.name)}</span><div class="bar"><i style="width:${k.score ?? 0}%;background:${scoreColor(k.score)}"></i></div><b>${k.score == null ? '–' : k.score.toFixed(0)}</b></div>`).join('');
  $('#catchips').innerHTML = [['all', 'All'], ...D.categories.map(k => [k.id, k.name.split(',')[0]])].map(([id, n]) => `<button class="chip${filter === id ? ' on' : ''}" data-f="${id}">${esc(n)}</button>`).join('');
  $('#catchips').onclick = e => { const f = e.target.dataset?.f; if (!f) return; filter = f; $$('#catchips .chip').forEach(b => b.classList.toggle('on', b.dataset.f === f)); renderRows(); };
  renderRows();
  if (HM) {
    drawHeatmap($('#hm'), HM);
    $('#hm').setAttribute('role', 'img'); $('#hm').setAttribute('aria-label', `Risk heatmap of ${HM.rows.length} indicators over the last ${HM.months.length} months; darker red means higher risk. The indicator table above has the same latest values as text.`);
    const pts = BT && BT.composite_series.length > 24 ? BT.composite_series : HM.months.map((m, i) => [m, HM.composite[i]]).filter(p => p[1] != null);
    $('#comp').setAttribute('role', 'img'); $('#comp').setAttribute('aria-label', `Composite risk score history from ${pts[0][0]} to ${pts[pts.length - 1][0]}; latest ${Math.round(pts[pts.length - 1][1])} of 100.`);
    lineChart($('#comp'), pts, { lines: [{ y: 25, cls: 'ok' }, { y: 45, cls: 'warn' }, { y: 65, cls: 'bad' }], fmt: v => String(Math.round(v) || 0), height: 200 });
  }
}

function alertsPanel() {
  const ev = (AL.events || []).slice(0, 5), SEV = { critical: 'st-failed', warning: 'st-partial', info: 'st-unconfigured' };
  return `<div class="panel"><div class="listhead"><h3>Recent alerts</h3><a class="small" href="data/feed.xml">${icon('radio', 13)} Atom feed</a></div>
   ${ev.length ? ev.map(x => `<div class="sig alert-${esc(x.severity)}"><div class="sig-body"><div class="sig-top"><b>${esc(x.title)}</b><span class="pill ${SEV[x.severity] || ''}">${esc(x.severity)}</span></div><p class="muted small">${esc(x.ts)} UTC &middot; ${esc(x.detail)}</p></div></div>`).join('')
     : '<p class="muted small">No regime changes, indicator breaches or quadrant moves recorded yet. Alerts are logged after each scheduled data run; serious ones also open a GitHub issue.</p>'}</div>`;
}
/** Verdict from backtest AUC: skill is judged against 0.5 (coin flip). Wording is deliberately cautious: very few independent events. */
const verdict = a => a == null ? ['n/a', 'st-unconfigured'] : a >= 0.65 ? ['Useful', 'st-live'] : a >= 0.55 ? ['Weak', 'st-partial'] : ['No skill', 'st-failed'];
function trackPanel() {
  const cell = (r, k) => { const t = r.recession[k]; return t.hit_rate == null ? '<span class="muted">n/a</span>' : `${Math.round(t.hit_rate * 100)}% <span class="muted">(${t.hits}/${t.events_covered})</span>`; };
  const row = (r, k) => {
    if (!r.recession) return `<tr><td><b>${esc(r.name)}</b></td><td colspan="7" class="muted">Not enough history to backtest${r.note ? ' (' + esc(r.note) + ')' : ''}. FRED serves only ~3 years of credit-spread data.</td></tr>`;
    const a = r.recession, b = r.drawdown, [vt, vc] = verdict(a.auc), t = a[k];
    return `<tr><td><b>${esc(r.name)}</b></td><td class="n">${esc(r.coverage_from)}</td><td class="n">${a.auc == null ? '–' : a.auc.toFixed(2)}</td><td class="n">${cell(r, k)}</td>
      <td class="n">${t.median_lead_months == null ? '–' : t.median_lead_months + ' mo'}</td><td class="n">${t.false_alarm_share == null ? '–' : Math.round(t.false_alarm_share * 100) + '%'}</td>
      <td class="n">${b.auc == null ? '–' : b.auc.toFixed(2)}</td><td><span class="pill ${vc}">${vt}</span></td></tr>`;
  };
  const rows = [row(BT.composite, 't45'), ...BT.indicators.map(r => row(r, 't50'))].join('');
  return `<div class="panel"><h3>Track record: did each signal fire before downturns?</h3>
   <p class="muted small">Backtest on month-end data (${esc(BT.sample)}). Recessions began ${BT.targets.recession.events.map(esc).join(', ')}; S&amp;P 500 bear markets peaked ${BT.targets.drawdown.events.map(esc).join(', ')}.
   <b>AUC</b> 0.5 = coin flip, 1.0 = perfect. <b>Hit rate</b>: share of recessions preceded by a warning (score &ge; 50; composite &ge; 45) in the prior 18 months. <b>False alarms</b>: share of warning episodes not followed by a recession within 18 months.</p>
   <div class="tw"><table class="matrix"><thead><tr><th>Signal</th><th class="n">Data from</th><th class="n">Recession AUC</th><th class="n">Hit rate</th><th class="n">Median lead</th><th class="n">False alarms</th><th class="n">Bear-mkt AUC</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>
   <div class="notice warn"><b>Read with care.</b> ${BT.caveats.map(esc).join(' ')}</div></div>`;
}

function renderRows() {
  const rows = D.indicators.filter(r => filter === 'all' || r.cat === filter);
  $('#mbody').innerHTML = rows.map(r => {
    const st = r.status, flag = (r.flags || []).length ? ' <span class="flag" title="' + esc(r.flags.join('; ')) + '">' + icon('flag', 13) + '</span>' : '';
    return `<tr data-id="${r.id}" class="${selId === r.id ? 'sel' : ''}"><td><span class="dot" style="background:${STATUS[st]}" title="${STATUS_LABEL[st]}"></span></td>
      <td><b>${esc(r.name)}</b>${flag}<div class="muted small">${esc(r.cat)} &middot; ${esc(r.freq)}${r.weight === 0 ? ' &middot; unscored' : ''}</div></td>
      <td class="n">${st === 'nodata' ? '<span class="muted">no data</span>' : unitFmt(r.value, r.unit)}</td>
      <td class="n">${signed(r.chg_1m, 2)}</td><td class="n">${signed(r.chg_3m, 2)}</td><td class="n">${r.pctile_10y == null ? '–' : r.pctile_10y.toFixed(0) + '%'}</td>
      <td><div class="bar"><i style="width:${r.score ?? 0}%;background:${scoreColor(r.score)}"></i></div></td>
      <td>${spark((r.hist || []).slice(-36), STATUS[st])}</td></tr>`;
  }).join('');
  $('#mbody').onclick = e => { const tr = e.target.closest('tr'); if (tr) select(tr.dataset.id); };
}

function select(id) {
  selId = id; $$('#mbody tr').forEach(t => t.classList.toggle('sel', t.dataset.id === id));
  const r = D.indicators.find(x => x.id === id), el = $('#ewDetail'); el.hidden = false;
  const dirTxt = r.direction === 'higher_worse' ? 'higher is worse' : 'lower is worse';
  el.innerHTML = `<div class="listhead"><h3>${esc(r.name)} <span class="badge" style="background:${STATUS[r.status]}">${STATUS_LABEL[r.status]}</span></h3><button class="ghost" id="closeD">Close</button></div>
   ${(r.flags || []).map(f => `<div class="notice">${icon('triangle-alert', 14)} ${esc(f)}</div>`).join('')}
   <div class="split"><div><p><b>Trigger logic.</b> ${esc(r.logic)}</p><p><b>Why it matters.</b> ${esc(r.why)}</p>
     <p class="muted"><b>Thresholds:</b> warn ${r.center != null ? 'beyond ' + r.warn + ' from ' + r.center : r.two_sided ? '|x| > ' + r.warn : r.warn}, critical ${r.center != null ? 'beyond ' + r.crit : r.two_sided ? '|x| > ' + r.crit : r.crit} (${dirTxt}).<br><b>Tracking:</b> ${esc(r.track || '')}<br><b>Sources:</b> ${(r.sources || []).map(esc).join('; ')}</p></div>
     <div><h4>Historical relevance</h4><ul class="eps">${Object.entries(r.history || {}).map(([k, v]) => `<li><b>${esc(k)}</b> ${esc(v)}</li>`).join('')}</ul></div></div>
   ${(r.hist || []).length > 2 ? '<svg id="dchart" class="lc"></svg>' : ''}`;
  $('#closeD').onclick = () => { el.hidden = true; selId = null; $$('#mbody tr').forEach(t => t.classList.remove('sel')); };
  if ((r.hist || []).length > 2) {
    const lines = [];
    if (r.center != null) { lines.push({ y: r.center + r.warn, cls: 'warn' }, { y: r.center - r.warn, cls: 'warn' }, { y: r.center + r.crit, cls: 'bad' }, { y: r.center - r.crit, cls: 'bad' }); }
    else if (r.two_sided) { lines.push({ y: r.warn, cls: 'warn' }, { y: -r.warn, cls: 'warn' }, { y: r.crit, cls: 'bad' }, { y: -r.crit, cls: 'bad' }); }
    else lines.push({ y: r.warn, cls: 'warn' }, { y: r.crit, cls: 'bad' });
    lineChart($('#dchart'), r.hist, { lines, fmt: v => num(v, Math.abs(v) >= 100 ? 0 : 2) });
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function initEarlyWarning() { onTab('radar', load); }
