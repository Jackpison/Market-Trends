#!/usr/bin/env python3
"""Speculative-trend intelligence pipeline -> data/macro_data.json (+ data/trends_history.json).

Only free, keyless sources are used; every source fails independently and its status is recorded in the
output so the UI can show what is measured, what is a proxy and what is unavailable. Nothing is simulated.
Env (all optional): GITHUB_TOKEN (GitHub search rate limit), SEC_CONTACT (identify yourself to the SEC)."""
import datetime as dt, http.cookiejar, json, math, os, re, statistics, sys, threading, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
P = lambda *a: os.path.join(ROOT, *a)
UA = "Mozilla/5.0 (compatible; Market-Trends-Research/1.0; +https://github.com/Jackpison/Market-Trends)"
SEC_UA = "Market-Trends-Research (%s)" % os.environ.get("SEC_CONTACT", "jackpison@users.noreply.github.com")
NOW = dt.datetime.now(dt.timezone.utc)
END = NOW.date() - dt.timedelta(days=1)            # last complete UTC day
DAYS31 = [END - dt.timedelta(days=i) for i in range(30, -1, -1)]   # oldest -> newest
STATUS = {}; _slock = threading.Lock()

def note(src, ok, err=None):
    with _slock:
        s = STATUS.setdefault(src, {"ok": 0, "fail": 0, "errors": []})
        s["ok" if ok else "fail"] += 1
        if err and len(s["errors"]) < 3: s["errors"].append(str(err)[:140])

class Throttle:
    def __init__(s, interval): s.i, s.t, s.l = interval, 0.0, threading.Lock()
    def wait(s):
        with s.l:
            d = s.t + s.i - time.time()
            if d > 0: time.sleep(d)
            s.t = time.time()
TH = {"gdelt": Throttle(7.0), "arxiv": Throttle(3.2), "github": Throttle(2.2), "sec": Throttle(0.2), "reddit": Throttle(2.0)}

def get(url, headers=None, timeout=25, tries=2, opener=None):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=dict({"User-Agent": UA}, **(headers or {})))
            with (opener.open(req, timeout=timeout) if opener else urllib.request.urlopen(req, timeout=timeout)) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            last = e; time.sleep(1.0 * (k + 1))
    raise last
def jget(url, **kw): return json.loads(get(url, **kw))
Q = urllib.parse.quote

# ------------------------------------------------------------------ statistics
def clamp(x, lo=0.0, hi=100.0): return max(lo, min(hi, x))
def zstat(series, kind="count", min_len=20):
    """series: 31 daily values oldest->newest. z of last day vs the prior 30 (per the NVS formula)."""
    if not series or len(series) < min_len or all(v is None for v in series): return None
    s = [0.0 if v is None else float(v) for v in series]; base, last = s[:-1], s[-1]
    if len(base) < 2: return None
    mean = sum(base) / len(base); sd = statistics.stdev(base) if len(base) > 1 else 0.0
    floor = math.sqrt(max(mean, 0.25)) if kind == "count" else max(0.05 * abs(mean), 1e-9)
    z = max(-5.0, min(8.0, (last - mean) / max(sd, floor)))
    return {"z": round(z, 2), "last": round(last, 4), "mean": round(mean, 4), "sd": round(sd, 4), "series": [round(v, 4) for v in s]}
def bucket(dates_iter):
    idx = {d: i for i, d in enumerate(DAYS31)}; out = [0] * 31
    for d in dates_iter:
        if d in idx: out[idx[d]] += 1
    return out
def parse_day(s): return dt.date.fromisoformat(s[:10])

# ------------------------------------------------------------------ narrative sources (per trend -> zstat dict or None)
def source_state(v):
    """live = every call worked; partial = some failed; unconfigured = only missing optional credentials (not an outage); failed = all calls failed."""
    if v["ok"]: return "live" if not v["fail"] else "partial"
    miss = v["errors"] and all(e.split(": ", 1)[-1].startswith("no REDDIT_CLIENT_ID") for e in v["errors"])
    return "unconfigured" if miss else "failed"

def src_hn(t):
    start = int(dt.datetime.combine(DAYS31[0], dt.time()).replace(tzinfo=dt.timezone.utc).timestamp()); end = start + 31 * 86400
    hq = t["query"] if '"' in t["query"] else '"%s"' % t["query"]     # quoted = exact word/phrase (Algolia otherwise prefix-matches, e.g. DeFi -> define)
    base = "https://hn.algolia.com/api/v1/search_by_date?query=%s&tags=(story,comment)&advancedSyntax=true" % Q(hq)
    d = jget(base + "&numericFilters=created_at_i>=%d,created_at_i<%d&hitsPerPage=1000" % (start, end))
    if d.get("nbHits", 0) <= 1000:
        days = [dt.datetime.fromtimestamp(h["created_at_i"], dt.timezone.utc).date() for h in d["hits"]]; return zstat(bucket(days))
    out = []
    for i in range(31):
        a = start + i * 86400
        out.append(jget(base + "&numericFilters=created_at_i>=%d,created_at_i<%d&hitsPerPage=0" % (a, a + 86400)).get("nbHits", 0))
    return zstat(out)

_rtok = {}
def reddit_token():
    cid, sec = os.environ.get("REDDIT_CLIENT_ID"), os.environ.get("REDDIT_CLIENT_SECRET")
    if not cid or not sec: raise RuntimeError("no REDDIT_CLIENT_ID/SECRET set (unauthenticated requests are blocked from cloud servers)")
    if "t" not in _rtok:
        import base64
        req = urllib.request.Request("https://www.reddit.com/api/v1/access_token", data=b"grant_type=client_credentials", headers={"User-Agent": UA, "Authorization": "Basic " + base64.b64encode(("%s:%s" % (cid, sec)).encode()).decode()})
        _rtok["t"] = json.loads(urllib.request.urlopen(req, timeout=25).read().decode())["access_token"]
    return _rtok["t"]
def src_reddit(t):
    tok = reddit_token(); TH["reddit"].wait()
    d = jget("https://oauth.reddit.com/search?q=%s&sort=new&t=month&limit=100" % Q(t["query"].replace('"', "")), headers={"Authorization": "Bearer " + tok})
    ch = d["data"]["children"]
    days = [dt.datetime.fromtimestamp(c["data"]["created_utc"], dt.timezone.utc).date() for c in ch]
    if len(ch) >= 100 and min(days) > DAYS31[0]: raise RuntimeError("result cap hit (volume understated)")
    return zstat(bucket(days))

def src_github(t):
    tok = os.environ.get("GITHUB_TOKEN"); hdr = {"Accept": "application/vnd.github+json"}
    if tok: hdr["Authorization"] = "Bearer " + tok
    q = '%s in:name,description,topics created:>=%s' % (t["query"].replace('"', ""), DAYS31[0].isoformat()); days = []
    for page in (1, 2, 3):
        TH["github"].wait()
        d = jget("https://api.github.com/search/repositories?q=%s&sort=updated&order=desc&per_page=100&page=%d" % (Q(q), page), headers=hdr)
        items = d.get("items", []); days += [parse_day(i["created_at"]) for i in items]
        if len(items) < 100: break
    return zstat(bucket(days))

def src_arxiv(t):
    TH["arxiv"].wait()
    x = get("https://export.arxiv.org/api/query?search_query=all:%s&sortBy=submittedDate&sortOrder=descending&max_results=300" % Q(t["arxiv"]))
    ns = {"a": "http://www.w3.org/2005/Atom"}
    days = [parse_day(e.find("a:published", ns).text) for e in ET.fromstring(x).findall("a:entry", ns)]
    return zstat(bucket(days))

def src_wiki(t):
    WD = [d - dt.timedelta(days=1) for d in DAYS31]    # Wikimedia publishes daily pageviews about a day late
    a, b = WD[0].strftime("%Y%m%d00"), WD[-1].strftime("%Y%m%d00"); tot = [0] * 31; got = 0
    for art in t["wiki"]:
        try:
            d = jget("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/%s/daily/%s/%s" % (Q(art, safe=""), a, b))
            for it in d["items"]:
                day = dt.datetime.strptime(it["timestamp"][:8], "%Y%m%d").date()
                if day in WD: tot[WD.index(day)] += it["views"]
            got += 1
        except Exception as e: note("wiki_article", False, "%s: %s" % (art, e))
    if not got: raise RuntimeError("no article returned data")
    return zstat(tot, "count")

def _gdelt(q, mode, span="35d"):
    url = "https://api.gdeltproject.org/api/v2/doc/doc?query=%s&mode=%s&timespan=%s&format=json" % (Q(q), mode, span)
    d = None
    for attempt in range(4):                      # GDELT answers 429 / plain-text errors when throttled: back off 20s, 40s, 60s
        TH["gdelt"].wait()
        try: txt = get(url, timeout=40, tries=1)
        except Exception as e:
            if attempt < 3 and "429" in str(e): time.sleep(20 * (attempt + 1)); continue
            raise
        if txt.lstrip().startswith("{"): d = json.loads(txt); break
        if "rate" in txt.lower() or "limit" in txt.lower():
            if attempt < 3: time.sleep(20 * (attempt + 1)); continue
        raise RuntimeError("GDELT rejected the query: " + txt[:80].replace("\n", " "))
    if d is None: raise RuntimeError("GDELT still rate limited after retries")
    acc = {}
    for s in d.get("timeline", [])[:1]:
        for p in s["data"]:
            day = dt.datetime.strptime(p["date"][:8], "%Y%m%d").date(); acc.setdefault(day, []).append(float(p["value"]))
    return acc
def src_gdelt(t):
    acc = _gdelt(t["news_query"], "timelinevol")
    if not acc: raise RuntimeError("empty timeline")
    if END not in acc: raise RuntimeError("no GDELT data for the last complete day")
    present = [sum(acc[d]) / len(acc[d]) for d in DAYS31 if d in acc]       # only days GDELT actually reported
    if len(present) < 15: raise RuntimeError("only %d of 31 days present" % len(present))
    z = zstat(present, "cont", min_len=12)
    try:
        tone = _gdelt(t["news_query"], "timelinetone", "7d"); vals = [v for d in sorted(tone)[-3:] for v in tone[d]]
        if z and vals: z["tone"] = round(sum(vals) / len(vals), 2)
    except Exception as e: note("gdelt_tone", False, e)
    return z

def _sec_weeks(q, forms):
    out = []
    for w in range(7, -1, -1):
        e = END - dt.timedelta(days=7 * w); s = e - dt.timedelta(days=6); TH["sec"].wait()
        d = jget("https://efts.sec.gov/LATEST/search-index?q=%s&dateRange=custom&startdt=%s&enddt=%s&forms=%s" % (Q(q), s, e, forms), headers={"User-Agent": SEC_UA})
        out.append(d["hits"]["total"]["value"])
    return out
_ctrl = {}; _clock = threading.Lock()
def sec_control(forms):
    """weekly count for a ubiquitous word: tracks total filing volume so earnings-season seasonality cancels out"""
    with _clock:
        if forms not in _ctrl: _ctrl[forms] = _sec_weeks("revenue", forms)
        return _ctrl[forms]
def _weekly_z(vals, raw=None):
    base, last = vals[:-1], vals[-1]; mean = sum(base) / len(base); sd = statistics.stdev(base) if len(base) > 1 else 0
    z = max(-5, min(8, (last - mean) / max(sd, 0.15 * mean if raw else math.sqrt(max(mean, .25)))))
    r = raw or vals
    return {"z": round(z, 2), "last": r[-1], "mean": round(sum(r[:-1]) / len(r[:-1]), 2), "sd": round(sd, 2), "series": [round(v, 3) for v in vals], "weekly": True, "normalized": bool(raw)}
def src_sec(t):
    forms = "10-K,10-Q,8-K,S-1"; v = _sec_weeks(t["query"], forms); c = sec_control(forms)
    return _weekly_z([a / max(b, 1) * 1000 for a, b in zip(v, c)], raw=v)       # share of filings mentioning the theme
def src_formd(t):
    v = _sec_weeks(t["query"], "D")
    if sum(v) == 0: raise RuntimeError("no Form D hits (SEC full-text search does not index Form D text)")
    return _weekly_z(v)

NARR_SOURCES = {"hn": src_hn, "reddit": src_reddit, "github": src_github, "arxiv": src_arxiv, "wiki": src_wiki, "gdelt": src_gdelt, "sec": src_sec, "formd": src_formd}
def run_source(name, trends):
    res = {}; streak = 0
    for t in trends:
        if streak >= 3: res[t["id"]] = None; continue          # circuit breaker: stop hammering a blocked / rate-limited source
        try:
            res[t["id"]] = NARR_SOURCES[name](t); ok = res[t["id"]] is not None; note(name, ok, None if ok else "no data"); streak = 0 if ok else streak + 1
        except Exception as e:
            res[t["id"]] = None; streak += 1; note(name, False, "%s: %s" % (t["id"], e))
            if streak >= 3: note(name, False, "aborted after 3 consecutive failures (remaining trends skipped)")
    return name, res

# ------------------------------------------------------------------ market data (Yahoo chart API, keyless)
_ycache = {}; _ylock = threading.Lock()
def yahoo_range(sym, start, end=None):
    p1 = int(dt.datetime.combine(start, dt.time()).replace(tzinfo=dt.timezone.utc).timestamp()); p2 = int((end or NOW).timestamp()) if end else int(NOW.timestamp())
    d = jget("https://query1.finance.yahoo.com/v8/finance/chart/%s?period1=%d&period2=%d&interval=1d" % (Q(sym, safe=""), p1, p2))["chart"]["result"][0]
    q = d["indicators"]["quote"][0]; rows = []
    for i, t in enumerate(d["timestamp"]):
        c = q["close"][i]
        if c is None: continue
        rows.append((dt.datetime.fromtimestamp(t, dt.timezone.utc).date(), float(c), float(q["high"][i] or c), float(q["low"][i] or c), float(q["volume"][i] or 0)))
    return rows
def chart(sym, days=430):
    with _ylock:
        if sym in _ycache: return _ycache[sym]
    try: rows = yahoo_range(sym, NOW.date() - dt.timedelta(days=days)); note("yahoo_chart", bool(rows), None if rows else sym + ": empty")
    except Exception as e: rows = []; note("yahoo_chart", False, "%s: %s" % (sym, e))
    with _ylock: _ycache[sym] = rows
    return rows
def ffill_daily(rows, start, end):
    """calendar-day forward-filled closes from start..end (None before the first observation)."""
    m = {r[0]: r[1] for r in rows}; out = []; last = None; d = start
    while d <= end:
        if d in m: last = m[d]
        out.append(last); d += dt.timedelta(days=1)
    return out
def basket_path(tickers, days=420):
    end = NOW.date(); start = end - dt.timedelta(days=days); series = []
    for s in tickers:
        r = chart(s)
        if len(r) > 30: series.append(ffill_daily(r, start, end))
    if not series: return []
    first = max(next(i for i, v in enumerate(s) if v is not None) for s in series)
    norm = [[100.0 * v / s[first] for v in s[first:]] for s in series]
    return [round(sum(c) / len(c), 2) for c in zip(*norm)]
def pct(path, n):
    return None if len(path) <= n or not path[-1 - n] else round(path[-1] / path[-1 - n] - 1, 4)
def tape_metrics(tickers):
    rows = {s: chart(s) for s in tickers}; rows = {s: r for s, r in rows.items() if len(r) > 90}
    if not rows: return None
    path = basket_path(list(rows)); spy = basket_path(["SPY"])
    r1, r3 = pct(path, 30), pct(path, 91); rs3 = None if r3 is None or pct(spy, 91) is None else round(r3 - pct(spy, 91), 4)
    # dollar volume: basket sum over common dates; z of last day vs prior 30; ratio 20d/90d
    common = sorted(set.intersection(*[{x[0] for x in r} for r in rows.values()])); dv = []
    for d in common:
        dv.append(sum(next(x[1] * x[4] for x in r if x[0] == d) for r in rows.values()))
    dv_z = zstat(dv[-31:], "cont") if len(dv) >= 31 else None
    ratio = (sum(dv[-20:]) / 20) / (sum(dv[-90:]) / 90) if len(dv) >= 90 and sum(dv[-90:]) > 0 else None
    cmfs = []
    for r in rows.values():
        w = r[-20:]; vol = sum(x[4] for x in w)
        if vol > 0: cmfs.append(sum((((x[1] - x[3]) - (x[2] - x[1])) / (x[2] - x[3]) if x[2] > x[3] else 0) * x[4] for x in w) / vol)
    cmf = sum(cmfs) / len(cmfs) if cmfs else None
    comp = {}
    if rs3 is not None: comp["rel_strength"] = clamp(50 + 100 * rs3)
    if ratio: comp["dollar_volume"] = clamp(50 + 50 * math.log(ratio) / math.log(2))
    if cmf is not None: comp["money_flow"] = clamp(50 + 150 * cmf)
    score = sum(comp.values()) / len(comp) if comp else None
    return {"tickers": list(rows), "ret_1m": r1, "ret_3m": r3, "rs_3m": rs3, "dv_ratio": None if ratio is None else round(ratio, 2), "dv_z": dv_z["z"] if dv_z else None, "cmf20": None if cmf is None else round(cmf, 3),
            "components": {k: round(v, 1) for k, v in comp.items()}, "score": None if score is None else round(score, 1), "path": path[-420:]}

# ------------------------------------------------------------------ Yahoo crumb session: options skew + 13F-derived institutional changes
_sess = {}
def yahoo_session():
    if "v" in _sess: return _sess["v"]
    try:
        cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        try: get("https://fc.yahoo.com", opener=op, tries=1)
        except Exception: pass
        crumb = get("https://query1.finance.yahoo.com/v1/test/getcrumb", opener=op, tries=2).strip()
        if not crumb or "<" in crumb or len(crumb) > 40: raise RuntimeError("no crumb")
        _sess["v"] = (op, crumb)
    except Exception as e: note("yahoo_crumb", False, e); _sess["v"] = None
    return _sess["v"]
ETFS = {"GDX", "SMH", "URA", "COPX", "GLD", "XBI", "QTUM", "BOTZ", "GRID", "NLR", "IBIT", "ARKK", "XLF", "KRE", "SPY", "QQQ", "VNQ"}
BASE = {"etf": 0.45, "stock": 0.62}      # typical call share of option volume: ETFs skew put-heavy (hedging), single stocks call-heavy
def options_skew(sym):
    s = yahoo_session()
    if not s: raise RuntimeError("no yahoo session")
    d = jget("https://query2.finance.yahoo.com/v7/finance/options/%s?crumb=%s" % (Q(sym, safe=""), Q(s[1])), opener=s[0])["optionChain"]["result"][0]["options"][0]
    cv = sum(c.get("volume") or 0 for c in d["calls"]); pv = sum(p.get("volume") or 0 for p in d["puts"])
    if cv + pv < 500: raise RuntimeError("thin option volume")
    return cv / (cv + pv)
def inst_change(sym):
    s = yahoo_session()
    if not s: raise RuntimeError("no yahoo session")
    d = jget("https://query2.finance.yahoo.com/v10/finance/quoteSummary/%s?modules=institutionOwnership&crumb=%s" % (Q(sym, safe=""), Q(s[1])), opener=s[0])
    lst = d["quoteSummary"]["result"][0]["institutionOwnership"]["ownershipList"]
    pos = [(x["position"]["raw"], x["pctChange"]["raw"]) for x in lst if x.get("position") and x.get("pctChange")]
    tot = sum(p for p, _ in pos)
    if not pos or tot <= 0: raise RuntimeError("no holder data")
    return sum(p * c for p, c in pos) / tot
def flow_proxies(t):
    out = {"skew": None, "f13": None}
    plain = [x for x in t["tickers"] if re.match(r"^[A-Z]{1,5}$", x)]; stocks = [x for x in plain if x not in ETFS]
    cands = ([t["etf"]] if t.get("etf") else []) + stocks[:3]; devs, used = [], []
    for sym in cands:
        try:
            sh = options_skew(sym); base = BASE["etf"] if sym in ETFS else BASE["stock"]; devs.append(sh - base); used.append({"symbol": sym, "call_share": round(sh, 3), "baseline": base}); note("options", True)
        except Exception as e: note("options", False, "%s: %s" % (sym, e))
    if devs:
        dv = sum(devs) / len(devs); out["skew"] = {"call_share": round(sum(u["call_share"] for u in used) / len(used), 3), "vs_baseline": round(dv, 3), "score": round(clamp(50 + 250 * dv), 1), "symbols": used, "symbol": ",".join(u["symbol"] for u in used)}
    chg = []
    for x in stocks[:4]:
        try: chg.append(inst_change(x)); note("inst13f", True)
        except Exception as e: note("inst13f", False, "%s: %s" % (x, e))
    if chg: v = sum(chg) / len(chg); out["f13"] = {"weighted_pct_change": round(v, 4), "score": round(clamp(50 + 500 * v), 1), "n": len(chg)}
    return out

# ------------------------------------------------------------------ DeFi (DefiLlama, keyless)
def pct_change(series, n):
    return None if len(series) <= n or not series[-1 - n] else series[-1] / series[-1 - n] - 1
def defi():
    out = {"ok": False}
    try:
        tot = jget("https://api.llama.fi/v2/historicalChainTvl"); s = [(dt.datetime.fromtimestamp(int(x["date"]), dt.timezone.utc).date().isoformat(), float(x["tvl"])) for x in tot][-120:]
        v = [x[1] for x in s]; out["tvl"] = {"current": v[-1], "d7": pct_change(v, 7), "d30": pct_change(v, 30), "series": s[-90:]}; note("defillama_tvl", True)
    except Exception as e: note("defillama_tvl", False, e)
    try:
        ch = sorted(jget("https://api.llama.fi/v2/chains"), key=lambda c: -(c.get("tvl") or 0))[:10]; rows = []
        for c in ch:
            r = {"name": c["name"], "tvl": c.get("tvl"), "d7": None, "d30": None}
            try:
                h = jget("https://api.llama.fi/v2/historicalChainTvl/%s" % Q(c["name"], safe="")); v = [float(x["tvl"]) for x in h]; r["d7"] = pct_change(v, 7); r["d30"] = pct_change(v, 30)
            except Exception as e: note("defillama_chain", False, "%s: %s" % (c["name"], e))
            rows.append(r)
        out["chains"] = rows; note("defillama_chains", True)
    except Exception as e: note("defillama_chains", False, e)
    try:
        sc = jget("https://stablecoins.llama.fi/stablecoincharts/all"); v = [float(x["totalCirculatingUSD"]["peggedUSD"]) for x in sc if x.get("totalCirculatingUSD")]
        sd = [dt.datetime.fromtimestamp(int(x["date"]), dt.timezone.utc).date().isoformat() for x in sc if x.get("totalCirculatingUSD")]
        out["stablecoins"] = {"supply": v[-1], "net_7d": v[-1] - v[-8], "net_30d": v[-1] - v[-31], "d7": pct_change(v, 7), "d30": pct_change(v, 30), "series": list(zip(sd, v))[-90:]}
        try:
            pa = jget("https://stablecoins.llama.fi/stablecoins?includePrices=true")["peggedAssets"]; top = []
            for a in sorted(pa, key=lambda a: -((a.get("circulating") or {}).get("peggedUSD") or 0))[:6]:
                cur = (a.get("circulating") or {}).get("peggedUSD") or 0; wk = (a.get("circulatingPrevWeek") or {}).get("peggedUSD") or 0; mo = (a.get("circulatingPrevMonth") or {}).get("peggedUSD") or 0
                top.append({"symbol": a.get("symbol"), "circulating": cur, "net_7d": cur - wk, "net_30d": cur - mo})
            out["stablecoins"]["top"] = top
        except Exception as e: note("defillama_stable_top", False, e)
        note("defillama_stable", True)
    except Exception as e: note("defillama_stable", False, e)
    try:
        dx = jget("https://api.llama.fi/overview/dexs?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true&dataType=dailyVolume")
        ch = dx.get("totalDataChart") or []
        out["dex"] = {"total24h": dx.get("total24h"), "change_1d": dx.get("change_1d"), "change_7d": dx.get("change_7d"), "change_1m": dx.get("change_1m"),
                      "series": [[dt.datetime.fromtimestamp(int(p[0]), dt.timezone.utc).date().isoformat(), p[1]] for p in ch][-90:]}; note("defillama_dex", True)
    except Exception as e: note("defillama_dex", False, e)
    sc = []
    if out.get("tvl") and out["tvl"].get("d30") is not None: sc.append(clamp(50 + 250 * out["tvl"]["d30"]))
    if out.get("stablecoins") and out["stablecoins"].get("d30") is not None: sc.append(clamp(50 + 1000 * out["stablecoins"]["d30"]))
    if out.get("dex") and out["dex"].get("change_1m") is not None: sc.append(clamp(50 + out["dex"]["change_1m"]))
    if sc:
        out["flow_score"] = round(sum(sc) / len(sc), 1); out["regime"] = "risk-on" if out["flow_score"] >= 60 else "risk-off" if out["flow_score"] <= 40 else "neutral"; out["ok"] = True
    return out

# ------------------------------------------------------------------ Private VC cluster (Y Combinator public dataset)
def yc_clusters(trends):
    try: data = jget("https://yc-oss.github.io/api/companies/all.json", timeout=60)
    except Exception as e: note("yc", False, e); return {}
    def key(b):
        if not b: return None
        b = str(b).strip(); m = re.match(r"(winter|spring|summer|fall)\s+(\d{4})", b, re.I)
        if m: return (int(m.group(2)), ["winter", "spring", "summer", "fall"].index(m.group(1).lower()))
        m = re.match(r"([WXSF])(\d{2})$", b)
        return (2000 + int(m.group(2)), "WXSF".index(m.group(1))) if m else None
    batches = {}
    for c in data:
        k = key(c.get("batch"))
        if k: batches.setdefault(k, []).append((" ".join([str(c.get("one_liner") or ""), str(c.get("long_description") or ""), " ".join(c.get("tags") or [])])).lower())
    start_m = {0: 1, 1: 4, 2: 6, 3: 9}; today = NOW.date()
    order = sorted(b for b in batches if dt.date(b[0], start_m[b[1]], 1) <= today and len(batches[b]) >= 50)   # drop future-labelled / partial batches
    recent, prior = order[-2:], order[-8:-2]
    if len(order) < 6: note("yc", False, "too few batches parsed"); return {}
    nr = sum(len(batches[b]) for b in recent); npr = sum(len(batches[b]) for b in prior); res = {}
    for t in trends:
        terms = t.get("vc_terms") or []
        if not terms: continue
        hit = lambda txt: any(w in txt for w in terms)
        a = sum(1 for b in recent for x in batches[b] if hit(x)); b2 = sum(1 for b in prior for x in batches[b] if hit(x))
        sr, sp = a / max(nr, 1), (b2 + 0.5) / max(npr, 1)
        ratio = sr / sp if sp else None
        res[t["id"]] = {"recent_count": a, "recent_share": round(sr, 4), "prior_share": round(sp, 4), "ratio": None if ratio is None else round(ratio, 2),
                        "score": None if ratio is None else round(clamp(50 + 40 * math.log(max(ratio, 0.05)) / math.log(2)), 1), "confidence": "ok" if a >= 5 else "thin (<5 companies)",
                        "recent_batches": ["%d-%d" % b for b in recent]}
    note("yc", True); return res

# ------------------------------------------------------------------ Historical benchmarks (lifecycle overlay)
def benchmarks(cfgs):
    out = []
    for b in cfgs:
        d0 = dt.date.fromisoformat(b["day0"]); end = min(NOW.date(), d0 + dt.timedelta(days=b["days"])); series = []
        for s in b["tickers"]:
            try: rows = yahoo_range(s, d0 - dt.timedelta(days=10), None); note("yahoo_bench", True)
            except Exception as e: note("yahoo_bench", False, "%s: %s" % (s, e)); continue
            f = ffill_daily(rows, d0, end)
            if f and f[0] is not None: series.append([100.0 * v / f[0] if v is not None else None for v in f])
        if not series: continue
        n = min(len(s) for s in series); path = [round(sum(s[i] for s in series if s[i] is not None) / len([1 for s in series if s[i] is not None]), 1) for i in range(n)]
        pk = max(range(len(path)), key=lambda i: path[i]); dd = min(path[pk:]) / path[pk] - 1
        out.append({"id": b["id"], "name": b["name"], "note": b["note"], "day0": b["day0"], "path": path, "peak_day": pk, "peak_value": path[pk], "max_drawdown_after_peak": round(dd, 3),
                    "complete": b["day0"] and (d0 + dt.timedelta(days=b["days"])) <= NOW.date()})
    return out

# ------------------------------------------------------------------ scoring
STAGES = ["Fringe / Seed", "Developer / Reddit", "FinTwit / VC", "Mainstream News"]
LEAD = {"vc": "12-24 months", "f13": "3-9 months", "options": "1-3 months", "tape": "1-3 months", "sec": "6-18 months", "defi": "1-6 months", "narrative": "3-12 months"}
def strength(z=None, confirmations=1):
    if z is None: return "Speculative"
    if z >= 3 or (z >= 2 and confirmations >= 2): return "High"
    return "Medium" if z >= 2 else "Speculative"

def score_trend(t, cfg, src, tape, flows, yc, defi_out):
    W = cfg["weights"]; tid = t["id"]; got = {}
    for name, w in W["nvs_sources"].items():
        z = (src.get(name) or {}).get(tid)
        if z: got[name] = (z, w)
    zc = sum(w * max(z["z"], -2) for z, w in got.values()) / sum(w for _, w in got.values()) if got else None
    tone = (got.get("gdelt", ({}, 0))[0] or {}).get("tone"); s = clamp((tone or 0) / 5.0, -1, 1); S = 1 + 0.5 * s
    raw = None if zc is None else zc * S; nvs = None if raw is None else round(100 * (1 - math.exp(-max(raw, 0) / 3.0)), 1)
    tiers = {}
    for k, names in cfg["tiers"].items():
        zs = [got[n][0]["z"] for n in names if n in got]
        if "tape" in names and tape and tape.get("dv_z") is not None: zs.append(tape["dv_z"])
        tiers[k] = max(zs) if zs else None
    stage = 0
    for i, k in enumerate(["t1", "t2", "t3", "t4"]):
        if tiers[k] is not None and tiers[k] >= 1.0: stage = i
    # SMII = 0.4 VC cluster + 0.4 options call skew + 0.2 13F net buying (renormalised over available components)
    comp = {}; sw = W["smii"]; fd = (src.get("formd") or {}).get(tid); y = yc.get(tid)
    vcs = [x for x in [y and y.get("score"), fd and clamp(50 + 15 * fd["z"])] if x is not None]
    if vcs: comp["vc"] = round(sum(vcs) / len(vcs), 1)
    if flows.get("skew"): comp["skew"] = flows["skew"]["score"]
    if flows.get("f13"): comp["f13"] = flows["f13"]["score"]
    cov = sum(sw[k] for k in comp); smii = round(sum(sw[k] * v for k, v in comp.items()) / cov, 1) if comp else None
    mode = t.get("capital_mode", "tape"); tape_s = tape["score"] if tape else None; parts = []
    if mode != "vc" and tape_s is not None:
        tp = tape_s
        if mode == "defi+tape" and defi_out.get("flow_score") is not None: tp = (tape_s + defi_out["flow_score"]) / 2
        parts.append((0.6 if smii is not None else 1.0, tp))
    if smii is not None: parts.append((0.4 if len(parts) else 1.0, smii))
    capital = round(sum(w * v for w, v in parts) / sum(w for w, _ in parts), 1) if parts else None
    quad = None if nvs is None or capital is None else ("Mainstream Trend" if capital >= 50 and nvs >= 50 else "Smart Money Stealth" if capital >= 50 else "Retail Hype / Bubble" if nvs >= 50 else "Dormant / Seed")
    return {"id": tid, "name": t["name"], "sector": t["sector"], "horizon": t["horizon"], "hypothesis": t["hypothesis"], "nvs": nvs, "z_combined": None if zc is None else round(zc, 2), "sentiment": {"tone": tone, "skew": round(s, 2), "multiplier": round(S, 2)},
            "stage": STAGES[stage], "stage_index": stage, "tier_z": {k: None if v is None else round(v, 2) for k, v in tiers.items()}, "quadrant": quad,
            "narrative_sources": {k: {"z": v[0]["z"], "last": v[0]["last"], "mean": v[0]["mean"], "sd": v[0]["sd"], "series": v[0]["series"][-31:], "weekly": bool(v[0].get("weekly"))} for k, v in got.items()},
            "nvs_coverage": round(sum(w for _, w in got.values()) / sum(W["nvs_sources"].values()), 2),
            "capital": {"score": capital, "mode": mode, "tape": None if not tape else {k: v for k, v in tape.items() if k != "path"}, "defi_flow": defi_out.get("flow_score") if mode == "defi+tape" else None},
            "smii": {"score": smii, "coverage": round(cov, 2), "components": comp, "skew_detail": flows.get("skew"), "f13_detail": flows.get("f13"), "yc": y, "formd": None if not fd else {"z": fd["z"], "last": fd["last"]}},
            "basket": {"tickers": tape["tickers"] if tape else [], "path": tape["path"] if tape else []}}

def make_signals(trs, tapes, defi_out, flows_by, yc, srcs):
    sig = []; ts = NOW.strftime("%Y-%m-%dT%H:%MZ")
    def add(tp, t, title, detail, st, lead, src, basis="measured"): sig.append({"ts": ts, "type": tp, "trend": t["id"] if t else None, "trend_name": t["name"] if t else "DeFi / market-wide", "title": title, "detail": detail, "strength": st, "lead": lead, "source": src, "basis": basis})
    for t in trs:
        tp = tapes.get(t["id"]); tid = t["id"]
        for s in (t.get("capital", {}).get("tape") or {}).get("tickers", []):
            r = _ycache.get(s) or []
            if len(r) > 40:
                dv = [x[1] * x[4] for x in r]; z = zstat(dv[-31:], "cont"); ret = r[-1][1] / r[-2][1] - 1 if len(r) > 1 else 0
                if z and z["z"] >= 3 and abs(ret) >= 0.03: add("tape", t, "%s: unusual dollar volume with a %+.1f%% move" % (s, ret * 100), "Dollar volume is %.1f sigma above its 30-day norm on %s." % (z["z"], r[-1][0]), strength(z["z"]), LEAD["tape"], "Yahoo Finance daily bars")
        cm = ((t.get("capital") or {}).get("tape") or {}).get("cmf20"); rs = ((t.get("capital") or {}).get("tape") or {}).get("rs_3m")
        if cm is not None and cm >= 0.15 and rs is not None and rs > 0: add("tape", t, "Accumulation footprint in the %s basket" % t["name"], "20-day Chaikin money flow %+.2f with %.1f%% 3M outperformance versus SPY." % (cm, rs * 100), "Medium" if cm < 0.25 else "High", LEAD["tape"], "Yahoo Finance daily bars", "proxy")
        sk = (t["smii"] or {}).get("skew_detail")
        if sk and sk["vs_baseline"] >= 0.12: add("options", t, "Call-heavy options flow (%s)" % sk["symbol"], "Calls are %.0f%% of nearest-expiry option volume, %.0f points above the typical baseline for these instruments." % (sk["call_share"] * 100, sk["vs_baseline"] * 100), "High" if sk["vs_baseline"] >= 0.2 else "Medium", LEAD["options"], "Yahoo Finance options chain", "proxy")
        f13 = (t["smii"] or {}).get("f13_detail")
        if f13 and f13["weighted_pct_change"] >= 0.05: add("13f", t, "Institutional accumulation in top holders", "Position-weighted change across top reported holders: %+.1f%% (13F-derived, quarterly, lagged)." % (f13["weighted_pct_change"] * 100), "High" if f13["weighted_pct_change"] >= 0.10 else "Medium", LEAD["f13"], "Yahoo Finance institutional ownership (SEC 13F)")
        sec = (t["narrative_sources"] or {}).get("sec")
        if sec and sec["z"] >= 2: add("sec", t, "Rising mentions in SEC filings", "Filings mentioning the theme last week: %d versus a %.1f weekly average." % (sec["last"], sec["mean"]), strength(sec["z"]), LEAD["sec"], "SEC EDGAR full-text search")
        y = (t["smii"] or {}).get("yc")
        if y and y.get("ratio") and y["ratio"] >= 2 and y["recent_count"] >= 3: add("vc", t, "Y Combinator cluster forming", "%d companies in the last two batches match this theme, %.1fx their prior share." % (y["recent_count"], y["ratio"]), "Medium" if y["recent_count"] >= 5 else "Speculative", LEAD["vc"], "Y Combinator public company list (yc-oss)")
        if t["nvs"] is not None and t["capital"]["score"] is not None and t["quadrant"] == "Smart Money Stealth": add("narrative", t, "Smart-money stealth: capital ahead of attention", "Capital score %.0f with narrative velocity only %.0f (stage: %s)." % (t["capital"]["score"], t["nvs"], t["stage"]), "Medium", LEAD["narrative"], "Composite of measured and proxy signals", "composite")
    st = (defi_out.get("stablecoins") or {})
    if st.get("d7") is not None and abs(st["d7"]) >= 0.01: add("defi", None, "Stablecoin supply %s" % ("expanding" if st["d7"] > 0 else "contracting"), "7-day net change %+.2f%% (%+.1fB USD)." % (st["d7"] * 100, st["net_7d"] / 1e9), "High" if abs(st["d7"]) >= 0.02 else "Medium", LEAD["defi"], "DefiLlama stablecoins")
    for c in defi_out.get("chains") or []:
        if c.get("d7") is not None and c["d7"] >= 0.15: add("defi", None, "%s TVL jumped %.0f%% in 7 days" % (c["name"], c["d7"] * 100), "Total value locked is now about $%.1fB." % ((c["tvl"] or 0) / 1e9), "Medium", LEAD["defi"], "DefiLlama chains")
    dx = defi_out.get("dex") or {}
    if dx.get("change_1d") is not None and dx["change_1d"] >= 50: add("defi", None, "DEX volume spike", "24h DEX volume %+.0f%% versus the prior day." % dx["change_1d"], "Speculative", LEAD["defi"], "DefiLlama DEX overview")
    order = {"High": 0, "Medium": 1, "Speculative": 2}; sig.sort(key=lambda s: order[s["strength"]]); return sig

# ------------------------------------------------------------------ assembly
def quote(sym):
    r = chart(sym)
    if len(r) < 2: return None
    last = r[-1][1]; f = ffill_daily(r, NOW.date() - dt.timedelta(days=100), NOW.date())
    def ret(n): return None if len(f) <= n or not f[-1 - n] else round(last / f[-1 - n] - 1, 4)
    return {"last": round(last, 4), "chg": round(last / r[-2][1] - 1, 4), "ret_1m": ret(30), "ret_3m": ret(91), "asof": r[-1][0].isoformat()}

def main():
    out_dir = os.environ.get("TRENDS_OUT", P("data")); cfg = json.load(open(P("config", "trends.json"))); net = json.load(open(P("config", "network.json")))
    trends = cfg["trends"]; t0 = time.time()
    syms = {s for t in trends for s in t["tickers"] + ([t["etf"]] if t.get("etf") else [])} | {"SPY"} | {s for s, _ in cfg["ticker"]} | {x for g in net["graphs"] for n in g["nodes"] for x in n["tickers"]}
    with ThreadPoolExecutor(max_workers=14) as ex:
        yfut = [ex.submit(chart, s) for s in sorted(syms)]
        sfut = [ex.submit(run_source, n, trends) for n in NARR_SOURCES]
        dfut, cfut, bfut = ex.submit(defi), ex.submit(yc_clusters, trends), ex.submit(benchmarks, cfg["benchmarks"])
        for f in yfut: f.result()
        tapes = {t["id"]: tape_metrics(t["tickers"]) for t in trends}
        with ThreadPoolExecutor(max_workers=4) as ex2: flows = dict(zip([t["id"] for t in trends], ex2.map(flow_proxies, trends)))
        src = dict(f.result() for f in sfut); defi_out = dfut.result(); yc = cfut.result(); bench = bfut.result()
    scored = [score_trend(t, cfg, src, tapes[t["id"]], flows[t["id"]], yc, defi_out) for t in trends]
    signals = make_signals(scored, tapes, defi_out, flows, yc, src)
    ticker = [dict(sym=s, name=n, **q) for s, n in cfg["ticker"] for q in [quote(s)] if q]
    nq = {s: q for s in sorted({x for g in net["graphs"] for n in g["nodes"] for x in n["tickers"]}) for q in [quote(s)] if q}
    macro = None
    try:
        L = json.load(open(P("data", "indicators", "latest.json"))); pick = {r["id"]: r.get("value") for r in L["indicators"] if r["id"] in ("t10y2y", "t10y3m", "hyoas", "vix", "move", "sahm")}
        macro = {"composite": L.get("composite"), "regime": L.get("regime"), "asof": L.get("generated"), "readings": pick}
    except Exception: pass
    status = {k: dict(v, state=source_state(v)) for k, v in sorted(STATUS.items())}
    doc = {"schema": 1, "generated": NOW.strftime("%Y-%m-%dT%H:%MZ"), "window_end": END.isoformat(), "runtime_s": round(time.time() - t0, 1),
           "method": {"nvs": "NVS = 100*(1-exp(-max(z*S,0)/3)); z = weighted mean of per-source z-scores (last complete day vs prior 30 days, floored sigma); S = 1 + 0.5*sentiment (GDELT tone/5, clamped to [-1,1]).",
                      "smii": "0.4*VC cluster + 0.4*options call skew + 0.2*13F net change, renormalised over available components; coverage reported.",
                      "capital": "0.6*tape score (+ DeFi flows for crypto) + 0.4*SMII; VC trends use SMII only. Tape = relative strength, dollar-volume ratio, Chaikin money flow."},
           "status": status, "ticker": ticker, "macro": macro, "trends": scored, "defi": defi_out, "signals": signals, "benchmarks": bench, "network_quotes": nq}
    os.makedirs(out_dir, exist_ok=True)
    json.dump(doc, open(os.path.join(out_dir, "macro_data.json"), "w"), separators=(",", ":"), default=str)
    hp = os.path.join(out_dir, "trends_history.json")
    try: hist = json.load(open(hp))
    except Exception: hist = []
    snap = {"date": NOW.date().isoformat(), "t": {t["id"]: [t["nvs"], t["capital"]["score"], t["smii"]["score"]] for t in scored}}
    hist = [h for h in hist if h["date"] != snap["date"]] + [snap]; json.dump(hist[-500:], open(hp, "w"), separators=(",", ":"))
    print("trends:", len(scored), "| signals:", len(signals), "| runtime %.0fs" % (time.time() - t0))
    for k, v in status.items(): print("  %-22s %-8s ok=%-3d fail=%-3d %s" % (k, v["state"], v["ok"], v["fail"], "; ".join(v["errors"])[:110]))
    for t in scored: print("  %-12s NVS=%-6s cap=%-6s smii=%-6s %-20s %s" % (t["id"], t["nvs"], t["capital"]["score"], t["smii"]["score"], t["stage"], t["quadrant"]))
if __name__ == "__main__": main()
