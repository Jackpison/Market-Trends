import { getJSON, esc } from './util.js';
let _p = null, _h = null;
export const loadTrends = () => _p || (_p = getJSON('data/macro_data.json').catch(() => null));
export const loadHistory = () => _h || (_h = getJSON('data/trends_history.json').catch(() => []));
export const SECTORS = ['Equities', 'Commodities', 'Crypto/DeFi', 'Private VC'];
export const HORIZONS = ['1-30 Days', '3-12 Months', '1-5 Years'];
export const SECTOR_COLOR = { 'Equities': '#4b86e0', 'Commodities': '#e2a32c', 'Crypto/DeFi': '#b36bff', 'Private VC': '#2ec98a' };
export const QUAD_CLASS = { 'Smart Money Stealth': 'q-stealth', 'Mainstream Trend': 'q-main', 'Retail Hype / Bubble': 'q-hype', 'Dormant / Seed': 'q-dormant' };
export const NO_DATA = 'No trend data yet. Open the repo <b>Actions</b> tab, choose <b>Update trends</b> and press <b>Run workflow</b>; refresh after about 3 minutes.';
const SRC_LABEL = { hn: 'Hacker News', reddit: 'Reddit', github: 'GitHub new repos', arxiv: 'arXiv papers', wiki: 'Wikipedia pageviews', gdelt: 'GDELT news', sec: 'SEC filings', formd: 'SEC Form D', yahoo_chart: 'Yahoo price bars', yahoo_bench: 'Yahoo history (benchmarks)', yahoo_crumb: 'Yahoo session', options: 'Options skew', inst13f: '13F holders', yc: 'Y Combinator', defillama_tvl: 'DefiLlama TVL', defillama_chains: 'DefiLlama chains', defillama_chain: 'DefiLlama chain history', defillama_stable: 'DefiLlama stablecoins', defillama_stable_top: 'DefiLlama top stablecoins', defillama_dex: 'DefiLlama DEX', wiki_article: 'Wikipedia (articles)', gdelt_tone: 'GDELT tone' };
export function statusTable(doc) {
  const rows = Object.entries(doc.status || {}).map(([k, v]) => `<tr><td>${esc(SRC_LABEL[k] || k)}</td><td><span class="pill st-${v.state}">${v.state}</span></td><td class="n">${v.ok}</td><td class="n">${v.fail}</td><td class="muted small">${esc((v.errors || [])[0] || '')}</td></tr>`).join('');
  return `<div class="tw"><table class="matrix"><thead><tr><th>Source</th><th>State</th><th class="n">OK</th><th class="n">Failed</th><th>Last error</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
