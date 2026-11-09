// Browser smoke test. Usage: node tests/smoke.mjs [baseUrl]   (needs `playwright` installed; a static server must already be running)
// For every tab, at desktop AND phone width, in dark and light themes: no console errors / page errors / failed requests,
// the view renders real content (not the loading skeleton), and nothing causes horizontal page scroll on a phone.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8000/index.html';
const TABS = { radar: '#view-radar .matrix tbody tr', yield: '#view-yield svg', stress: '#view-stress .slider', narratives: '#view-narratives .nt tbody tr', capital: '#view-capital svg',
  network: '#view-network #nSide .nitem', smart: '#view-smart .sig', timeline: '#view-timeline #list .row', months: '#view-months #monthGrid .mcard', markets: '#view-markets svg', learn: '#view-learn #doc h2', about: '#view-about h2' };
const failures = [];
const browser = await chromium.launch();
for (const theme of ['dark', 'light']) for (const [label, vp] of [['desktop', { width: 1360, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: theme }); const page = await ctx.newPage(); const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errs.push('request failed: ' + r.url()));
  await page.addInitScript(t => { try { localStorage.setItem('mt-theme', t); } catch (e) {} }, theme);
  for (const [tab, sel] of Object.entries(TABS)) {
    await page.goto(`${BASE}#${tab}`, { waitUntil: 'networkidle' });
    try { await page.waitForSelector(sel, { timeout: 8000 }); } catch { failures.push(`[${theme}/${label}] ${tab}: expected content '${sel}' never rendered`); continue; }
    if (label === 'phone') {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 2) failures.push(`[${theme}/phone] ${tab}: horizontal page overflow of ${over}px`);
    }
  }
  const unique = [...new Set(errs)]; unique.forEach(e => failures.push(`[${theme}/${label}] ${e}`));
  await ctx.close();
}
await browser.close();
if (failures.length) { console.error('SMOKE FAILED:\n' + failures.map(f => '  - ' + f).join('\n')); process.exit(1); }
console.log(`smoke ok: ${Object.keys(TABS).length} tabs x dark/light x desktop/phone`);
