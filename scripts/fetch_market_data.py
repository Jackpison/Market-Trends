#!/usr/bin/env python3
"""Download monthly market/macro series into data/market/*.csv.

Run locally (needs internet):  python3 scripts/fetch_market_data.py
Sources are public; availability and URLs can change, so each series fails
independently and is reported at the end. NOTE: not yet tested against the live
endpoints - check the output before trusting it.
"""
import csv, io, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "market")
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Market-Trends research script)"}

def get(url, timeout=20, tries=2):
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            last = e
    raise last

# --- FRED (no API key needed for fredgraph.csv) ---
FRED = {
    "fed_funds_rate": "FEDFUNDS",      # monthly, 1954+
    "cpi_all_items": "CPIAUCSL",       # monthly, 1947+
    "unemployment_rate": "UNRATE",     # monthly, 1948+
    "treasury_10y": "GS10",            # monthly, 1953+
    "wti_oil": "WTISPLC",              # monthly, 1946+
    "industrial_production": "INDPRO", # monthly, 1919+
    "recession_flag": "USREC",         # NBER recession indicator, 1854+
}
def fred(name, sid):
    key = os.environ.get("FRED_API_KEY", "").strip()
    if key:  # official API: reliable from cloud servers (free key at fred.stlouisfed.org)
        d = json.loads(get("https://api.stlouisfed.org/fred/series/observations"
                           f"?series_id={sid}&api_key={key}&file_type=json"))
        rows = [(o["date"], o["value"]) for o in d["observations"] if o["value"] != "."]
        with open(os.path.join(OUT, f"{name}.csv"), "w", newline="") as f:
            w = csv.writer(f); w.writerow(["DATE", "VALUE"]); w.writerows(rows)
        return len(rows)
    txt = get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}")
    open(os.path.join(OUT, f"{name}.csv"), "w").write(txt)
    return len(txt.splitlines()) - 1

# --- Yahoo Finance chart API (monthly closes) ---
YAHOO = {
    "sp500": "^GSPC",      # 1927+
    "nasdaq_composite": "^IXIC",  # 1971+
    "dow_jones_yahoo": "^DJI",    # ~1992+
    "gold_futures": "GC=F",       # ~2000+
    "bitcoin_usd": "BTC-USD",     # 2014+
}
def yahoo(name, sym):
    sym_q = urllib.request.quote(sym, safe="")
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym_q}"
           "?period1=-1325635200&period2=" + str(int(time.time())) +
           "&interval=1mo&events=history")
    d = json.loads(get(url))["chart"]["result"][0]
    ts, q = d["timestamp"], d["indicators"]["quote"][0]
    with open(os.path.join(OUT, f"{name}.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(["date","open","high","low","close","volume"])
        for i, t in enumerate(ts):
            w.writerow([time.strftime("%Y-%m-%d", time.gmtime(t))] +
                       [q[k][i] for k in ("open","high","low","close","volume")])
    return len(ts)

# --- Stooq (long Dow history, back to the 1890s) ---
def stooq(name, sym):
    txt = get(f"https://stooq.com/q/d/l/?s={sym}&i=m")
    open(os.path.join(OUT, f"{name}.csv"), "w").write(txt)
    return len(txt.splitlines()) - 1

jobs = [(n, lambda n=n, s=s: fred(n, s)) for n, s in FRED.items()]
jobs += [(n, lambda n=n, s=s: yahoo(n, s)) for n, s in YAHOO.items()]
jobs += [("dow_jones_long", lambda: stooq("dow_jones_long", "^dji"))]

ok, bad = [], []
def run(job):
    name, fn = job
    try:
        n = fn(); print(f"ok   {name}: {n} rows", flush=True); return (name, n, None)
    except Exception as e:
        print(f"FAIL {name}: {e}", file=sys.stderr, flush=True); return (name, 0, str(e))
with ThreadPoolExecutor(max_workers=6) as ex:
    for name, n, err in ex.map(run, jobs):
        (bad if err else ok).append((name, err or n))
json.dump({"series": [n for n, _ in ok], "updated": time.strftime("%Y-%m-%d")},
          open(os.path.join(OUT, "index.json"), "w"))
print(f"\n{len(ok)} succeeded, {len(bad)} failed")
if not ok:
    sys.exit(1)
