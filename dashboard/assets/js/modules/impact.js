// Pillar 3 — multi-layer impact analysis across 1/5/10/20-year horizons for a "higher-for-longer / tightening shock" regime.
const LAYERS = {
  'Financial institutions': [
    ['Capital & liquidity', 'Unrealized AFS/HTM bond losses erode tangible equity; deposit flight to MMFs', 'Basel III endgame binds; CET1 buffers rebuilt via lower buybacks', 'Consolidation of regionals; higher through-cycle capital', 'Structurally thicker capital, more non-bank (private credit) intermediation'],
    ['Net interest margin', 'Deposit betas catch up: NIM compresses 20–60bp', 'Fixed-rate asset repricing restores NIM', 'NIM normalizes with a steeper curve', 'Margin driven by curve slope & competition from fintech/MMFs'],
    ['Credit quality', 'CRE office & leveraged-loan stress; reserves build', 'Loss cycle peaks 2–3y after tightening', 'Underwriting tightens; lower loan growth', 'Credit cycle repeats; risk migrates to shadow banks'],
  ],
  'Equities & asset classes': [
    ['Valuation multiples', 'P/E compresses as real yields rise (−2 to −4 turns per +100bp real)', 'Earnings growth must replace multiple expansion', 'Returns ≈ earnings growth + dividend; multiple mean-reverts', 'Valuation anchored to demographics, productivity, real-rate regime'],
    ['Sector rotation', 'Defensives & value/energy lead; long-duration growth lags', 'Quality + cash-flow compounders; cyclicals recover late', 'Leadership turns over (typically each decade)', 'Secular winners = capex themes (energy transition, AI, defense)'],
    ['Commodities & real estate', 'Cap rates widen 50–150bp; transactions freeze', 'Repricing completes; supply pipeline shrinks', 'Hard assets hedge inflation regime; commodity supercycle risk (underinvestment)', 'Real assets track population, zoning & energy mix'],
  ],
  'Consumer & microeconomy': [
    ['Purchasing power', 'Real wages negative while CPI > wage growth; savings drawdown', 'Wages catch up; relative prices reset higher (price level never reverts)', 'Cumulative price level +25–40% vs. old trend', 'Real income determined by productivity, not inflation episodes'],
    ['Housing & credit', 'Mortgage lock-in freezes mobility; card/auto delinquencies rise', 'Lock-in unwinds; affordability recovers slowly', 'Household formation vs. supply decides prices', 'Housing cost share of income is the long-run affordability gauge'],
    ['Labor market', 'Tightness eases; unemployment +1–2pp in a hard landing', 'Sectoral reallocation; wage premium for skills', 'Demographic labor scarcity supports wages', 'Automation/AI reshapes returns to labor vs. capital'],
  ],
};
const HORIZONS = ['1 year', '5 years', '10 years', '20 years'];

export function initImpact() {
  const tabs = document.getElementById('impact-tabs'), body = document.getElementById('impact-body');
  const names = Object.keys(LAYERS);
  const show = (n) => {
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.n === n));
    body.innerHTML = `<table class="tbl"><thead><tr><th>Channel</th>${HORIZONS.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${LAYERS[n].map((r) => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  tabs.innerHTML = names.map((n) => `<button class="tab" role="tab" data-n="${n}">${n}</button>`).join('');
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) show(b.dataset.n); });
  show(names[0]);
}
