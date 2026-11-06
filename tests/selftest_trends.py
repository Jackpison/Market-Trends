"""Offline self-test: patches fetch_trends.get with a fake HTTP layer (payload shapes mirror each API) and
writes to TRENDS_OUT (never the repo's data/). Usage: TRENDS_OUT=/tmp/t3/data python3 tests/selftest_trends.py"""
import datetime as dt, json, os, random, re, sys, urllib.parse
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fetch_trends as F
random.seed(11); NOW = dt.datetime.now(dt.timezone.utc)
for th in F.TH.values(): th.i = 0
def walk(n, x0, vol): 
    x, out = x0, []
    for _ in range(n): x *= 1 + random.gauss(0.0004, vol); out.append(x)
    return out
def yahoo(url):
    sym = urllib.parse.unquote(url.split("/chart/")[1].split("?")[0]); q = dict(urllib.parse.parse_qsl(url.split("?")[1]))
    p1, p2 = int(q["period1"]), int(q["period2"]); days = max(2, (p2 - p1) // 86400); start = dt.datetime.fromtimestamp(p1, dt.timezone.utc)
    ts, c, h, l, v = [], [], [], [], []; px = walk(days, 100 if "-USD" not in sym else 30000, 0.02)
    for i, p in enumerate(px):
        d = start + dt.timedelta(days=i)
        if d.weekday() >= 5 and "-USD" not in sym: continue
        ts.append(int(d.timestamp())); c.append(p); h.append(p * 1.01); l.append(p * 0.99); v.append(int(random.uniform(1e6, 2e6) * (4 if i == len(px) - 1 and sym in ("NVDA", "OKLO") else 1)))
    c[-1] *= 1.05 if sym in ("NVDA", "OKLO") else 1
    return json.dumps({"chart": {"result": [{"timestamp": ts, "indicators": {"quote": [{"close": c, "high": h, "low": l, "volume": v}]}}]}})
def daily_counts(lam, spike=0): return [max(0, int(random.gauss(lam, lam ** .5 + 1))) + (spike if i == 30 else 0) for i in range(31)]
def fake_get(url, headers=None, timeout=25, tries=2, opener=None):
    if "hn.algolia" in url: 
        n = random.randint(5, 60); return json.dumps({"nbHits": n, "hits": [{"created_at_i": int((NOW - dt.timedelta(days=random.randint(1, 30))).timestamp())} for _ in range(n)] + [{"created_at_i": int((NOW - dt.timedelta(days=1)).timestamp())} for _ in range(40)]})
    if "reddit.com" in url: raise RuntimeError("HTTP 403 (simulated block)")
    if "revenue" in url and "efts.sec.gov" in url: return json.dumps({"hits": {"total": {"value": 5000}}})
    if "api.github.com/search" in url: return json.dumps({"items": [{"created_at": (NOW - dt.timedelta(days=random.randint(1, 30))).isoformat()} for _ in range(random.randint(3, 60))]})
    if "export.arxiv" in url: return "<feed xmlns='http://www.w3.org/2005/Atom'>" + "".join("<entry><published>%s</published></entry>" % (NOW - dt.timedelta(days=random.randint(1, 30))).isoformat() for _ in range(80)) + "</feed>"
    if "wikimedia" in url: 
        a = dt.datetime.strptime(url.split("/daily/")[1][:8], "%Y%m%d"); return json.dumps({"items": [{"timestamp": (a + dt.timedelta(days=i)).strftime("%Y%m%d00"), "views": int(1000 + random.gauss(0, 80) + (900 if i == 30 else 0))} for i in range(31)]})
    if "gdeltproject" in url:
        base = NOW.date() - dt.timedelta(days=34); mode = "tone" if "timelinetone" in url else "vol"
        return json.dumps({"timeline": [{"series": "x", "data": [{"date": (base + dt.timedelta(days=i)).strftime("%Y%m%dT000000Z"), "value": (random.gauss(2.0, .5) if mode == "tone" else 0.02 + random.random() * .004 + (0.01 if i == 34 else 0))} for i in range(35)]}]})
    if "efts.sec.gov" in url:
        if "forms=D" in url: return json.dumps({"hits": {"total": {"value": 0}}})
        return json.dumps({"hits": {"total": {"value": random.randint(20, 60) + (80 if "startdt=%s" % (F.END - dt.timedelta(days=6)) in url else 0)}}})
    if "fc.yahoo.com" in url: return ""
    if "getcrumb" in url: return "abc123XYZ"
    if "/v7/finance/options/" in url: return json.dumps({"optionChain": {"result": [{"options": [{"calls": [{"volume": random.randint(500, 3000)} for _ in range(20)], "puts": [{"volume": random.randint(200, 1500)} for _ in range(20)]}]}]}})
    if "quoteSummary" in url: return json.dumps({"quoteSummary": {"result": [{"institutionOwnership": {"ownershipList": [{"position": {"raw": 1e6 * (i + 1)}, "pctChange": {"raw": random.uniform(-0.02, 0.12)}} for i in range(10)]}}]}})
    if "/chart/" in url: return yahoo(url)
    if "historicalChainTvl/" in url or url.endswith("historicalChainTvl"): 
        v = walk(200, 1e9, .01); return json.dumps([{"date": int((NOW - dt.timedelta(days=len(v) - i)).timestamp()), "tvl": x} for i, x in enumerate(v)])
    if "api.llama.fi/v2/chains" in url: return json.dumps([{"name": n, "tvl": 1e9 * (10 - i)} for i, n in enumerate(["Ethereum", "Solana", "Tron", "BSC", "Base", "Arbitrum"])])
    if "stablecoincharts" in url: 
        v = walk(200, 2e11, .002); return json.dumps([{"date": str(int((NOW - dt.timedelta(days=len(v) - i)).timestamp())), "totalCirculatingUSD": {"peggedUSD": x}} for i, x in enumerate(v)])
    if "stablecoins.llama.fi/stablecoins" in url: return json.dumps({"peggedAssets": [{"symbol": s, "circulating": {"peggedUSD": 1e10}, "circulatingPrevWeek": {"peggedUSD": 9.9e9}, "circulatingPrevMonth": {"peggedUSD": 9.5e9}} for s in ("USDT", "USDC")]})
    if "overview/dexs" in url: return json.dumps({"total24h": 5e9, "change_1d": 12.0, "change_7d": 5.0, "change_1m": 20.0, "totalDataChart": [[int((NOW - dt.timedelta(days=90 - i)).timestamp()), 4e9 + random.random() * 1e9] for i in range(90)]})
    if "yc-oss" in url:
        seasons = ["Winter", "Spring", "Summer", "Fall"]; co = []
        for y in (2022, 2023, 2024, 2025, 2027):
            for s in seasons:
                for i in range(60): co.append({"name": "c", "batch": "%s %d" % (s, y), "one_liner": "AI agents for ops" if (y == 2025 and i < 14) or i < 2 else "marketplace for stuff", "long_description": "", "tags": []})
        return json.dumps(co)
    raise RuntimeError("unmocked url " + url[:80])
F.get = fake_get; F.main()
