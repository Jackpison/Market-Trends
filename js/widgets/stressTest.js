import { $, $$, esc, getJSON, num, signed, onTab, RUN_HINT } from '../util.js';

let loaded = false, M = null, st = { infl: 0, fed: 0, oil: 0, hy: 0, regime: 'post2022', dur: 5, f10: .35, i10: .5 };
const SL = [['infl', 'Inflation shift', 'pp of CPI over 12M', -3, 5, .25, 'pp'], ['fed', 'Fed policy change', 'bp over 12M (negative = cuts)', -400, 400, 25, 'bp'], ['oil', 'Oil price shock', '% change in WTI', -50, 120, 5, '%'], ['hy', 'Credit spread widening', 'bp change in HY OAS', -100, 600, 25, 'bp']];
const PRESETS = {
  'Reset': { infl: 0, fed: 0, oil: 0, hy: 0 },
  '2022-style hiking': { infl: 3, fed: 300, oil: 30, hy: 250 },
  'Soft-landing cuts': { infl: -1, fed: -150, oil: -10, hy: -50 },
  'Oil supply shock': { infl: .5, fed: 50, oil: 60, hy: 150 },
  'Credit event / hard landing': { infl: -1.5, fed: -300, oil: -30, hy: 500 },
};
async function load() {
  if (loaded) return; loaded = true; const root = $('#view-stress');
  try { M = await getJSON('data/indicators/stress.json'); } catch (e) { root.innerHTML = `<div class="panel"><h2>Stress test</h2><div class="notice">${RUN_HINT}</div></div>`; return; }
  root.innerHTML = `<div class="panel"><h2>Macro stress-test simulator</h2>
   <p class="muted">Drag the sliders to apply a 12-month macro shock. Impacts come from simple, transparent sensitivities estimated on monthly history (see model table). This is a scenario tool, <b>not a forecast</b>: relationships shift across regimes and R&sup2; is low.</p>
   <div id="presets" class="chips">${Object.keys(PRESETS).map(k => `<button class="chip" data-p="${esc(k)}">${esc(k)}</button>`).join('')}</div>
   <div class="split"><div id="sliders"></div><div id="outs"></div></div></div>
   <div class="panel"><h3>Advanced assumptions</h3><div class="controls">
    <label>Equity sensitivity regime <select id="regime"><option value="post2022">2022-now (inflation regime)</option><option value="full">Full sample</option><option value="pre2022">1986-2021</option></select></label>
    <label>Fed &rarr; 10Y pass-through <input id="f10" type="number" step=".05" value="${st.f10}"></label>
    <label>Inflation &rarr; 10Y pass-through <input id="i10" type="number" step=".05" value="${st.i10}"></label>
    <label>Bank securities duration (yrs) <input id="dur" type="number" step=".5" value="${st.dur}"></label></div>
    <div id="model"></div></div>`;
  $('#sliders').innerHTML = SL.map(([k, n, sub, lo, hi, step, u]) => `<div class="slider"><div class="sl-top"><b>${n}</b><span id="v_${k}" class="sv"></span></div><input type="range" id="s_${k}" min="${lo}" max="${hi}" step="${step}" value="${st[k]}"><div class="muted small">${sub}</div></div>`).join('');
  SL.forEach(([k]) => $('#s_' + k).oninput = e => { st[k] = +e.target.value; calc(); });
  $('#presets').onclick = e => { const p = PRESETS[e.target.dataset?.p]; if (!p) return; Object.assign(st, p); SL.forEach(([k]) => $('#s_' + k).value = st[k]); calc(); };
  $('#regime').onchange = e => { st.regime = e.target.value; calc(); };
  ['f10', 'i10', 'dur'].forEach(k => $('#' + k).oninput = e => { st[k] = +e.target.value || 0; calc(); });
  renderModel(); calc();
}
function beta(key) {
  const find = pre => M.betas.find(b => b.target.startsWith(pre));
  let b = null, name = '';
  if (key === 'spx') { b = st.regime === 'full' ? M.betas.find(x => x.target === 'S&P 500') : st.regime === 'pre2022' ? find('S&P 500 (1986') : find('S&P 500 (2022'); name = 'S&P 500'; }
  if (key === 'banks') { b = find('Regional banks'); name = 'Regional banks'; }
  if (key === 'reits') { b = find('REITs'); name = 'REITs'; }
  const pr = M.priors[key];
  return b ? { name, y10: b.coef[0], oil: b.coef[1], hy: pr.hy_per_100bp, r2: b.r2, src: 'estimated' } : { name, y10: pr.d10y_pp, oil: pr.oil_pct, hy: pr.hy_per_100bp, r2: null, src: 'prior' };
}
const pmt = (L, r) => { const i = r / 1200, n = 360; return i === 0 ? L / n : L * i / (1 - Math.pow(1 + i, -n)); };
function calc() {
  SL.forEach(([k, , , , , , u]) => $('#v_' + k).textContent = (st[k] > 0 && k !== 'hy' ? '+' : st[k] > 0 ? '+' : '') + st[k] + ' ' + u);
  const B = M.baseline, T = M.transmission, cp = M.cpi_passthrough, pas = (cp && cp.t > 2 && cp.coef > 0) ? cp.coef : M.priors.cpi_passthrough;
  const inflTot = st.infl + pas * st.oil, d10 = st.f10 * st.fed / 100 + st.i10 * inflTot;
  const mb = M.mortgage_beta, mortB = (mb && mb.r2 > 0.3 && mb.coef > 0.4 && mb.coef < 1.5) ? mb.coef : M.priors.mortgage_beta;
  const assets = ['spx', 'banks', 'reits'].map(k => { const b = beta(k), r = b.y10 * d10, o = b.oil * st.oil, c = b.hy * st.hy / 100; return { b, rates: r, oil: o, credit: c, tot: r + o + c }; });
  const cpi0 = B.cpi_yoy ?? 3, wage0 = B.wage_yoy ?? 4, mort0 = B.mortgage30 ?? ((B.y10 ?? 4) + 1.8), y100 = B.y10;
  const cpi1 = cpi0 + inflTot, mort1 = Math.max(0, mort0 + mortB * d10), p0 = pmt(T.loan, mort0), p1 = pmt(T.loan, mort1);
  const wage1 = wage0 + T.wage_stickiness * inflTot, real1 = wage1 - cpi1, real0 = wage0 - cpi0, mtm = -st.dur * d10;
  const tilt = (st.hy >= 150 || st.oil >= 40 || st.fed >= 200) ? 'Defensive tilt: staples, healthcare, utilities, strong balance sheets; avoid leveraged credit and high-beta cyclicals.' : (st.fed <= -100 && st.infl <= 0.5) ? 'Rate-relief tilt: duration, housing-linked, small caps and REITs historically benefit if growth holds.' : 'No strong rotation signal from this scenario.';
  const card = (t, v, sub, cls = '') => `<div class="out ${cls}"><span>${t}</span><b>${v}</b><small>${sub}</small></div>`;
  const cl = v => v < -0.05 ? 'neg' : v > 0.05 ? 'pos' : '';
  $('#outs').innerHTML = `<div class="outs">
   ${assets.map(a => card(a.b.name, signed(a.tot, 1, '%'), `rates ${signed(a.rates, 1)} &middot; oil ${signed(a.oil, 1)} &middot; credit ${signed(a.credit, 1)}${a.b.src === 'prior' ? ' (prior)' : ''}`, cl(a.tot))).join('')}
   ${card('10Y Treasury yield', y100 == null ? signed(d10, 2, 'pp') : num(y100 + d10, 2) + '%', `change ${signed(d10, 2, 'pp')}`)}
   ${card('30Y mortgage rate', num(mort1, 2) + '%', `monthly P&I on $${(T.loan / 1000).toFixed(0)}k: $${num(p1, 0)} (${p1 - p0 >= 0 ? '+' : '-'}$${num(Math.abs(p1 - p0), 0)})`, cl(-(p1 - p0)))}
   ${card('Headline CPI (YoY)', num(cpi1, 1) + '%', `from ${num(cpi0, 1)}% &middot; oil pass-through ${signed(pas * st.oil, 2, 'pp')}`)}
   ${card('Real wage growth', signed(real1, 1, '%'), `from ${signed(real0, 1, '%')} (wages assumed to follow ${Math.round(T.wage_stickiness * 100)}% of inflation shift)`, cl(real1 - real0))}
   ${card('Bank securities mark-to-market', signed(mtm, 1, '% of book'), `duration ${st.dur}y x 10Y change; negative = unrealised losses (SVB-type risk)`, cl(mtm))}</div>
   <div class="notice"><b>Rotation read:</b> ${tilt}</div>`;
}
const f2 = v => v == null ? 'n/a' : num(v, 2);
function renderModel() {
  const rows = M.betas.map(b => `<tr><td>${esc(b.target)}</td><td>${esc(b.period)}</td><td class="n">${num(b.coef[0], 2)} <span class="muted">(t ${num(b.t[0], 1)})</span></td><td class="n">${num(b.coef[1], 3)} <span class="muted">(t ${num(b.t[1], 1)})</span></td><td class="n">${num(b.r2 * 100, 1)}%</td><td class="n">${b.n}</td></tr>`).join('');
  const prior = Object.entries(M.priors).filter(([k]) => ['spx', 'banks', 'reits'].includes(k)).map(([k, p]) => `${k}: ${p.hy_per_100bp}%`).join(', ');
  $('#model').innerHTML = `<h4>Model transparency</h4><div class="tw"><table class="matrix"><thead><tr><th>Target</th><th>Sample</th><th class="n">% per +1pp 10Y</th><th class="n">% per +1% oil</th><th class="n">R&sup2;</th><th class="n">Months</th></tr></thead><tbody>${rows || '<tr><td colspan=6>No estimates yet; priors are used.</td></tr>'}</tbody></table></div>
   <ul class="small muted"><li>OLS on monthly returns vs month-end changes in the 10Y yield and WTI oil. Low R&sup2; means these factors explain little of monthly returns; <b>the stock-bond relationship flipped around 2022</b>, which is why the regime selector exists.</li>
   <li>Credit-spread sensitivity (per +100bp HY: ${esc(prior)}) is a <b>prior assumption</b>, not estimated, because free HY history is short.</li>
   <li>Yield pass-through (Fed &rarr; 10Y, inflation &rarr; 10Y) and wage stickiness are editable assumptions. CPI pass-through and mortgage beta use the estimate only when it is statistically sensible (t-stat above 2, mortgage beta between 0.4 and 1.5, R&sup2; above 0.3); otherwise a prior is used (0.035pp CPI per 1% oil, 0.9 mortgage beta).</li>
   <li>Baseline levels: CPI ${f2(M.baseline.cpi_yoy)}%, wages ${f2(M.baseline.wage_yoy)}%, Fed funds ${f2(M.baseline.fed_funds)}%, 10Y ${f2(M.baseline.y10)}%, mortgage ${M.baseline.mortgage30 == null ? 'n/a (assumed 10Y + 1.8pp)' : f2(M.baseline.mortgage30) + '%'}.</li></ul>`;
}
export function initStressTest() { onTab('stress', load); }
