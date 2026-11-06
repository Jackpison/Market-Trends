'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const LABELS = {sp500:'S&P 500',nasdaq_composite:'Nasdaq Composite',dow_jones_long:'Dow Jones (long history)',dow_jones_yahoo:'Dow Jones (Yahoo)',
  fed_funds_rate:'Fed funds rate (%)',cpi_all_items:'CPI, all items',unemployment_rate:'Unemployment rate (%)',treasury_10y:'10-year Treasury yield (%)',
  wti_oil:'WTI crude oil ($)',industrial_production:'Industrial production',gold_futures:'Gold futures ($)',bitcoin_usd:'Bitcoin (USD)'};
const DOCS = [['docs/07-narrative-engine.md','Narrative & capital engine'],['docs/04-indicator-framework.md','Indicator framework'],['docs/05-transmission-channels.md','Transmission channels'],['docs/06-impact-horizons.md','Impact by horizon'],['docs/01-cycle-frameworks.md','Cycle frameworks'],['docs/02-signals-checklist.md','Signals checklist'],['docs/03-case-studies.md','Case studies']];
const S = {years:[], monthIdx:[], months:{}, tags:new Set(), q:'', minImpact:0, decade:0, sel:null, series:[], cache:{}, recession:null};

/* ---------- tiny markdown renderer ---------- */
function md(src){
  const L = src.replace(/\r/g,'').split('\n'), out = []; let i = 0;
  const inl = s => esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g,'$1<em>$2</em>').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  const li = /^\s*([-*]|\d+\.)\s+/;
  while (i < L.length) {
    const l = L[i]; let m;
    if (/^```/.test(l)) { const b=[]; i++; while(i<L.length && !/^```/.test(L[i])) b.push(L[i++]); i++; out.push('<pre><code>'+esc(b.join('\n'))+'</code></pre>'); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { const n=m[1].length+1; out.push(`<h${n}>${inl(m[2])}</h${n}>`); i++; continue; }
    if (/^\|/.test(l) && /^\|?\s*:?-{2,}/.test(L[i+1]||'')) {
      const row = r => r.replace(/^\||\|$/g,'').split('|').map(c=>c.trim()); const h=row(l); i+=2; const rows=[];
      while(i<L.length && /^\|/.test(L[i])) rows.push(row(L[i++]));
      out.push('<div class="tw"><table><thead><tr>'+h.map(c=>`<th>${inl(c)}</th>`).join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>`<td>${inl(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>'); continue; }
    if (/^>\s?/.test(l)) { const b=[]; while(i<L.length && /^>\s?/.test(L[i])) b.push(L[i++].replace(/^>\s?/,'')); out.push('<blockquote>'+inl(b.join(' '))+'</blockquote>'); continue; }
    if (li.test(l)) { const ord=/^\s*\d+\./.test(l), items=[]; while(i<L.length && li.test(L[i])) items.push(L[i++].replace(li,''));
      out.push((ord?'<ol>':'<ul>')+items.map(t=>{const c=t.match(/^\[( |x)\]\s+(.*)/); return c?`<li class="chk"><input type="checkbox" ${c[1]==='x'?'checked':''}> ${inl(c[2])}</li>`:`<li>${inl(t)}</li>`}).join('')+(ord?'</ol>':'</ul>')); continue; }
    if (/^---+$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const p=[]; while(i<L.length && L[i].trim() && !/^(#{1,4}\s|\||>|```)/.test(L[i]) && !li.test(L[i])) p.push(L[i++]);
    if (!p.length) p.push(L[i++]);
    out.push('<p>'+inl(p.join(' '))+'</p>');
  }
  return out.join('\n');
}

/* ---------- tooltip ---------- */
const tip = $('#tip');
function showTip(html, ev){ tip.innerHTML = html; tip.hidden = false; const w = tip.offsetWidth, x = Math.min(ev.clientX + 14, innerWidth - w - 10); tip.style.left = Math.max(8, x) + 'px'; tip.style.top = (ev.clientY + 16) + 'px'; }
function hideTip(){ tip.hidden = true; }

/* ---------- data ---------- */
async function getJSON(p){ const r = await fetch(p); if(!r.ok) throw new Error(p+' '+r.status); return r.json(); }
async function init(){
  try { S.years = await getJSON('data/yearly/overview.json'); }
  catch(e){ $('#stats').innerHTML = '<div class="notice" style="grid-column:1/-1">Could not load data. If you opened this file directly, serve it instead: <code>python3 -m http.server</code> then open http://localhost:8000</div>'; return; }
  try { S.monthIdx = (await getJSON('data/monthly/index.json')).years; } catch(e){ S.monthIdx = []; }
  try { S.series = (await getJSON('data/market/index.json')).series; } catch(e){ S.series = []; }
  buildControls(); drawStats(); drawBars(); drawList(); selectYear(S.years.find(y=>y.year===2000) ? 2000 : S.years[0].year, true);
  buildMonths(); buildMarkets(); buildLearn(); buildAbout();
  route();
}

function drawStats(){
  const n = S.years.length, avg = (S.years.filter(y=>y.impact>0).reduce((a,y)=>a+y.impact,0) / S.years.filter(y=>y.impact>0).length).toFixed(1);
  const hi = S.years.filter(y=>y.impact===5).length;
  $('#stats').innerHTML = [[n,'years covered'],[S.monthIdx.length,'years with monthly detail'],[hi,'impact-5 years'],[S.series.length,'market series loaded']]
    .map(([a,b])=>`<div class="stat"><b>${a}</b><span>${b}</span></div>`).join('');
}

/* ---------- timeline ---------- */
function matches(y){
  if (y.impact < S.minImpact) return false;
  if (S.decade && Math.floor(y.year/10)*10 !== S.decade) return false;
  if (S.tags.size && !y.tags.some(t=>S.tags.has(t))) return false;
  if (S.q) { const h = (y.year+' '+y.headline+' '+y.regime+' '+y.tags.join(' ')).toLowerCase(); if (!h.includes(S.q)) return false; }
  return true;
}
function buildControls(){
  const decades = [...new Set(S.years.map(y=>Math.floor(y.year/10)*10))];
  $('#decade').innerHTML = '<option value="">All</option>' + decades.map(d=>`<option value="${d}">${d}s</option>`).join('');
  const freq = {}; S.years.forEach(y=>y.tags.forEach(t=>freq[t]=(freq[t]||0)+1));
  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,22).map(e=>e[0]);
  $('#chips').innerHTML = top.map(t=>`<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  $('#chips').onclick = e => { const t = e.target.dataset.tag; if(!t) return; S.tags.has(t) ? S.tags.delete(t) : S.tags.add(t); e.target.classList.toggle('on'); refresh(); };
  $('#q').oninput = e => { S.q = e.target.value.trim().toLowerCase(); refresh(); };
  $('#minImpact').onchange = e => { S.minImpact = +e.target.value; refresh(); };
  $('#decade').onchange = e => { S.decade = +e.target.value || 0; refresh(); };
  $('#reset').onclick = () => { S.tags.clear(); S.q=''; S.minImpact=0; S.decade=0; $('#q').value=''; $('#minImpact').value=0; $('#decade').value=''; $$('.chip').forEach(c=>c.classList.remove('on')); refresh(); };
}
function refresh(){ drawBars(); drawList(); }
function drawBars(){
  const svg = $('#bars'), W = 1010, H = 190, base = H - 22, step = W / S.years.length;
  let h = '';
  S.years.forEach((y,i)=>{
    const bh = Math.max(y.impact/5*(base-14), 3), x = i*step;
    h += `<rect class="bar i${y.impact}${matches(y)?'':' dim'}${S.sel===y.year?' sel':''}" data-year="${y.year}" x="${x+1}" y="${base-bh}" width="${step-2}" height="${bh}" rx="1.5"></rect>`;
    if (y.year % 10 === 0) h += `<line class="axis" x1="${x+step/2}" x2="${x+step/2}" y1="${base}" y2="${base+4}"/><text class="axis" x="${x+step/2}" y="${H-6}" text-anchor="middle" fill="currentColor" style="font-size:10px;fill:var(--muted)">${y.year}</text>`;
  });
  h += `<line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/>`;
  svg.innerHTML = h;
  svg.onclick = e => { const y = e.target.dataset?.year; if (y) selectYear(+y); };
  svg.onmousemove = e => { const y = e.target.dataset?.year; if (!y) return hideTip(); const r = S.years.find(v=>v.year==y); showTip(`<b>${r.year}</b> (impact ${r.impact})<br>${esc(r.regime)}`, e); };
  svg.onmouseleave = hideTip;
}
function drawList(){
  const f = S.years.filter(matches);
  $('#count').textContent = `(${f.length})`;
  $('#list').innerHTML = f.length ? f.map(y=>`<div class="row${S.sel===y.year?' sel':''}" data-year="${y.year}"><b>${y.year}</b><span>${esc(y.headline.length>110?y.headline.slice(0,108)+'...':y.headline)}</span><em>${y.impact?'impact '+y.impact:'n/a'}</em></div>`).join('') : '<p class="muted">No years match the filters.</p>';
  $('#list').onclick = e => { const r = e.target.closest('.row'); if (r) selectYear(+r.dataset.year); };
}
function selectYear(year, silent){
  S.sel = year; const y = S.years.find(v=>v.year===year); if (!y) return;
  const hasM = S.monthIdx.includes(year);
  $('#detail').innerHTML = `<h2>${y.year}</h2><p><span class="badge i${y.impact}">${y.impact?'Impact '+y.impact:'Not rated'}</span><b>${esc(y.regime)}</b></p>
    <p>${esc(y.headline)}</p><div class="tags">${y.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
    <p class="muted">Confidence: ${esc(y.confidence)}${y.metrics?'':' &middot; numeric metrics not merged yet'}</p>
    <div class="controls">${hasM?`<button class="ghost" id="goMonths">View month by month</button>`:'<span class="muted">Monthly detail for this year not written yet.</span>'}
    <button class="ghost" id="goMarkets">See on market chart</button></div>`;
  if (hasM) $('#goMonths').onclick = () => { location.hash = '#months'; showMonthYear(year); };
  $('#goMarkets').onclick = () => { $('#from').value = Math.max(1900, year-5); $('#to').value = Math.min(2030, year+5); location.hash = '#markets'; plot(); };
  drawBars(); drawList();
  if (!silent) $$('#list .row.sel')[0]?.scrollIntoView({block:'nearest'});
}

/* ---------- monthly ---------- */
function buildMonths(){
  $('#strip').innerHTML = S.years.map(y=>`<div class="sq${S.monthIdx.includes(y.year)?' has':''}" data-year="${y.year}" title="${y.year}${S.monthIdx.includes(y.year)?'':' (not yet)'}"></div>`).join('');
  $('#strip').onclick = e => { const y = +e.target.dataset?.year; if (S.monthIdx.includes(y)) showMonthYear(y); };
  $('#monthYear').innerHTML = S.monthIdx.map(y=>`<option>${y}</option>`).join('');
  $('#monthYear').onchange = e => showMonthYear(+e.target.value);
  const step = d => { const i = S.monthIdx.indexOf(+$('#monthYear').value) + d; if (S.monthIdx[i]) showMonthYear(S.monthIdx[i]); };
  $('#prevY').onclick = () => step(-1); $('#nextY').onclick = () => step(1);
  if (S.monthIdx.length) showMonthYear(S.monthIdx[0]); else $('#monthGrid').innerHTML = '<p class="muted">No monthly data yet.</p>';
}
async function showMonthYear(y){
  $('#monthYear').value = y; $$('.sq').forEach(s=>s.classList.toggle('cur', +s.dataset.year===y));
  const yr = S.years.find(v=>v.year===y); $('#monthHead').textContent = yr ? yr.regime : '';
  try { S.months[y] = S.months[y] || await getJSON(`data/monthly/${y}.json`); } catch(e){ $('#monthGrid').innerHTML = '<p class="muted">Could not load this year.</p>'; return; }
  $('#monthGrid').innerHTML = S.months[y].map(m=>{
    const mi = parseInt(m.month.slice(5),10)-1, quiet = !m.event;
    const met = m.metrics ? Object.entries(m.metrics).map(([k,v])=>`${esc(k)}: ${esc(v)}`).join(' &middot; ') : '';
    return `<div class="mcard${quiet?' quiet':''}"><h4>${MONTHS[mi]} ${y}</h4><div class="ev">${quiet?'No standout event identified':esc(m.event)}</div><div class="ctx">${esc(m.market_effect)}</div>${met?`<div class="muted">${met}</div>`:''}</div>`;
  }).join('');
}

/* ---------- markets ---------- */
async function loadSeries(name){
  if (S.cache[name]) return S.cache[name];
  const r = await fetch(`data/market/${name}.csv`); if (!r.ok) throw new Error('missing');
  const lines = (await r.text()).trim().split(/\r?\n/), head = lines[0].split(',').map(s=>s.trim().toLowerCase());
  let ci = head.indexOf('close'); if (ci < 0) ci = 1; const pts = [];
  for (let i=1;i<lines.length;i++){ const c = lines[i].split(','), v = parseFloat(c[ci]), t = Date.parse(c[0]); if (isFinite(v) && !isNaN(t)) pts.push([t,v]); }
  return S.cache[name] = pts;
}
function buildMarkets(){
  const sel = $('#series');
  if (!S.series.length){
    sel.innerHTML = '<option>No data yet</option>';
    $('#mkMsg').innerHTML = 'No market data downloaded yet. On GitHub open the <b>Actions</b> tab, choose <b>Fetch market data</b> and press <b>Run workflow</b>. After about a minute, refresh this page.';
    $('#line').innerHTML = ''; return;
  }
  sel.innerHTML = S.series.map(n=>`<option value="${esc(n)}">${esc(LABELS[n]||n)}</option>`).join('');
  ['#series','#from','#to','#log','#evt','#rec'].forEach(id=>$(id).onchange = plot);
  if (S.series.includes('recession_flag')) loadSeries('recession_flag').then(p=>{ S.recession = p; plot(); }).catch(()=>{});
  const first = S.series.includes('sp500') ? 'sp500' : S.series[0]; sel.value = first; plot();
}
async function plot(){
  const svg = $('#line'); if (!S.series.length) return;
  const name = $('#series').value; let pts;
  try { pts = await loadSeries(name); } catch(e){ $('#mkMsg').textContent = 'Could not load '+name+'.'; return; }
  $('#mkMsg').textContent = '';
  const y0 = +$('#from').value || 1900, y1 = +$('#to').value || 2030, t0 = Date.UTC(y0,0,1), t1 = Date.UTC(y1+1,0,1);
  pts = pts.filter(p=>p[0]>=t0 && p[0]<t1); if (pts.length < 2){ svg.innerHTML=''; $('#mkMsg').textContent='No data in this range for this series.'; return; }
  const W=1000,H=400,m={l:58,r:14,t:18,b:28}, log = $('#log').checked && pts.every(p=>p[1]>0);
  const tf = v => log ? Math.log(v) : v, ys = pts.map(p=>tf(p[1])); let lo = Math.min(...ys), hi = Math.max(...ys); const pad=(hi-lo)*.05||1; lo-=pad; hi+=pad;
  const X = t => m.l + (t-t0)/(t1-t0)*(W-m.l-m.r), Y = v => H-m.b - (tf(v)-lo)/(hi-lo)*(H-m.t-m.b);
  let h = '';
  if ($('#rec').checked && S.recession){ let st=null; S.recession.forEach(([t,v],i)=>{ if (v===1 && st===null) st=t; if ((v!==1||i===S.recession.length-1) && st!==null){ const a=Math.max(st,t0), b=Math.min(t,t1); if (b>a) h+=`<rect class="rec" x="${X(a)}" y="${m.t}" width="${X(b)-X(a)}" height="${H-m.t-m.b}"/>`; st=null; } }); }
  for (let k=0;k<=5;k++){ const v = lo+(hi-lo)*k/5, real = log?Math.exp(v):v, yy = H-m.b-(H-m.t-m.b)*k/5;
    h += `<line x1="${m.l}" x2="${W-m.r}" y1="${yy}" y2="${yy}" stroke="var(--line)"/><text x="${m.l-6}" y="${yy+3}" text-anchor="end" style="font-size:10px;fill:var(--muted)">${real>=1000?Math.round(real).toLocaleString():real.toPrecision(3)}</text>`; }
  const span = y1-y0+1, stepY = span>60?10:span>25?5:span>10?2:1;
  for (let y=Math.ceil(y0/stepY)*stepY; y<=y1; y+=stepY) h += `<text x="${X(Date.UTC(y,0,1))}" y="${H-10}" text-anchor="middle" style="font-size:10px;fill:var(--muted)">${y}</text>`;
  h += `<path class="ser" d="${pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join('')}"/>`;
  if (+$('#evt').value) S.years.filter(y=>y.impact>=+$('#evt').value && y.year>=y0 && y.year<=y1).forEach(y=>{ const x = X(Date.UTC(y.year,6,1)); h += `<line class="mk" x1="${x}" x2="${x}" y1="${m.t}" y2="${H-m.b}"/><circle class="mkdot" data-year="${y.year}" cx="${x}" cy="${m.t+4}" r="4.5"/>`; });
  h += `<line class="cross" id="cx" y1="${m.t}" y2="${H-m.b}" style="display:none"/>`;
  svg.innerHTML = h;
  const cx = svg.querySelector('#cx');
  svg.onmousemove = e => {
    const dot = e.target.dataset?.year; if (dot){ const r = S.years.find(v=>v.year==dot); return showTip(`<b>${r.year}</b>: ${esc(r.headline)}`, e); }
    const box = svg.getBoundingClientRect(), px = (e.clientX-box.left)/box.width*W; if (px<m.l||px>W-m.r) { cx.style.display='none'; return hideTip(); }
    const t = t0 + (px-m.l)/(W-m.l-m.r)*(t1-t0); let a=0,b=pts.length-1; while(b-a>1){ const mid=(a+b)>>1; pts[mid][0]<t?a=mid:b=mid; }
    const p = Math.abs(pts[a][0]-t)<Math.abs(pts[b][0]-t)?pts[a]:pts[b], d = new Date(p[0]);
    cx.setAttribute('x1',X(p[0])); cx.setAttribute('x2',X(p[0])); cx.style.display='';
    showTip(`<b>${MONTHS[d.getUTCMonth()].slice(0,3)} ${d.getUTCFullYear()}</b><br>${p[1].toLocaleString(undefined,{maximumFractionDigits:2})}`, e);
  };
  svg.onmouseleave = () => { hideTip(); cx.style.display='none'; };
  svg.onclick = e => { const y = e.target.dataset?.year; if (y){ location.hash='#timeline'; selectYear(+y); } };
}

/* ---------- learn + about ---------- */
function buildLearn(){
  $('#docnav').innerHTML = DOCS.map(([p,t],i)=>`<button class="ghost${i?'':' on'}" data-p="${p}">${t}</button>`).join('');
  const open = async p => { try { const r = await fetch(p); $('#doc').innerHTML = md(await r.text()); } catch(e){ $('#doc').textContent = 'Could not load '+p; } };
  $('#docnav').onclick = e => { const p = e.target.dataset?.p; if(!p) return; $$('#docnav button').forEach(b=>b.classList.toggle('on', b===e.target)); open(p); };
  open(DOCS[0][0]);
}
function buildAbout(){
  const raw = 'https://raw.githubusercontent.com/Jackpison/Market-Trends/main/';
  $('#about').innerHTML = `<h2>Data and how it works</h2>
  <p>Everything on this site is read from plain files in the repository, so you can download and analyse the same data yourself.</p>
  <ul><li><a href="${raw}data/yearly/overview.json" target="_blank">data/yearly/overview.json</a> : one row per year</li>
  <li>data/monthly/YYYY.json : month-by-month detail (${S.monthIdx.length} year(s) so far)</li>
  <li>data/market/*.csv : real monthly market and macro series (${S.series.length} loaded)</li></ul>
  <h3>Refreshing market data</h3>
  <p>Open the repository's <b>Actions</b> tab, pick <b>Fetch market data</b>, press <b>Run workflow</b>. It downloads the series on GitHub's servers and saves them to the repo. It also runs automatically on the 1st of each month.</p>
  <h3>Method</h3>
  <p>Qualitative text is written from general historical knowledge and carries a confidence flag. Months without a clearly identified standout event are shown as such instead of being filled with guesses. Numeric values come from the downloaded series, not from hand-typed figures.</p>
  <p class="muted">Research and education only. Not financial advice.</p>`;
}

/* ---------- routing ---------- */
const TABS = ['radar','yield','stress','narratives','capital','network','smart','timeline','months','markets','learn','about'];
function route(){
  const t = (location.hash||'#radar').slice(1), tab = TABS.includes(t) ? t : 'radar';
  $$('.view').forEach(v=>v.classList.toggle('on', v.id==='view-'+tab)); $$('#tabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab===tab));
  $('#stats').style.display = ['timeline','months','markets'].includes(tab) ? '' : 'none';
  if (tab==='markets') plot();
  document.dispatchEvent(new CustomEvent('tabchange', {detail: tab}));
}
$('#tabs').onclick = e => { const t = e.target.dataset?.tab; if (t) location.hash = '#'+t; };
addEventListener('hashchange', route);
init();
addEventListener('DOMContentLoaded', route);
route();
