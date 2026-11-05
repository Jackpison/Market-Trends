#!/usr/bin/env python3
"""Download daily/weekly macro series into data/macro/ (FRED + Yahoo + optional extras).
Each series fails independently. Set FRED_API_KEY (repo secret) for reliability."""
import csv, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "macro"); os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Market-Trends research script)"}
KEY = os.environ.get("FRED_API_KEY", "").strip()

def get(url, timeout=25, tries=2):
    last = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            last = e
    raise last

FRED = {  # id -> start date (daily series trimmed to keep files small)
 "T10Y3M":"1990-01-01","T10Y2Y":"1990-01-01","DGS1MO":"1990-01-01","DGS3MO":"1990-01-01","DGS6MO":"1990-01-01","DGS1":"1990-01-01",
 "DGS2":"1990-01-01","DGS3":"1990-01-01","DGS5":"1990-01-01","DGS7":"1990-01-01","DGS10":"1990-01-01","DGS20":"1990-01-01","DGS30":"1990-01-01",
 "WALCL":"2002-01-01","RRPONTSYD":"2013-01-01","WTREGEN":"2002-01-01","BAMLH0A0HYM2":"1996-01-01","BAMLC0A0CM":"1996-01-01",
 "STLFSI4":"1993-12-01","DTWEXBGS":"2006-01-01","T10YIE":"2003-01-01","T5YIFR":"2003-01-01","DCOILWTICO":"1990-01-01",
 "MORTGAGE30US":"1990-01-01","M2SL":"1959-01-01","CES0500000003":"2006-01-01","NFCI":"1990-01-01",
}
YAHOO = {"vix":"^VIX","move":"^MOVE","skew":"^SKEW","copper":"HG=F","gold":"GC=F","dxy":"DX-Y.NYB","kre":"KRE","vnq":"VNQ","spy":"SPY"}

def fred(sid, start):
    if KEY:
        d = json.loads(get("https://api.stlouisfed.org/fred/series/observations?series_id=%s&api_key=%s&file_type=json&observation_start=%s" % (sid, KEY, start)))
        rows = [(o["date"], o["value"]) for o in d["observations"] if o["value"] != "."]
        with open(os.path.join(OUT, sid + ".csv"), "w", newline="") as f:
            w = csv.writer(f); w.writerow(["DATE", sid]); w.writerows(rows)
        return len(rows)
    txt = get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s&cosd=%s" % (sid, start))
    if "html" in txt[:200].lower(): raise RuntimeError("got HTML instead of CSV")
    open(os.path.join(OUT, sid + ".csv"), "w").write(txt.replace("\r", ""))
    return txt.count("\n") - 1

def yahoo(name, sym):
    q = urllib.request.quote(sym, safe="")
    d = json.loads(get("https://query1.finance.yahoo.com/v8/finance/chart/%s?period1=631152000&period2=%d&interval=1d" % (q, int(time.time()))))["chart"]["result"][0]
    ts, cl = d["timestamp"], d["indicators"]["quote"][0]["close"]
    rows = [(time.strftime("%Y-%m-%d", time.gmtime(t)), c) for t, c in zip(ts, cl) if c is not None]
    with open(os.path.join(OUT, name + ".csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(["date", "close"]); w.writerows(rows)
    return len(rows)

def squeeze():  # unofficial public file; optional
    txt = get("https://squeezemetrics.com/monitor/static/DIX.csv")
    if "dix" not in txt[:200].lower(): raise RuntimeError("unexpected content")
    open(os.path.join(OUT, "squeeze.csv"), "w").write(txt.replace("\r", ""))
    return txt.count("\n") - 1

jobs = [("fred:" + k, (lambda k=k, v=v: fred(k, v))) for k, v in FRED.items()]
jobs += [("yahoo:" + k, (lambda k=k, v=v: yahoo(k, v))) for k, v in YAHOO.items()]
jobs += [("squeeze", squeeze)]

def run(job):
    name, fn = job
    try:
        n = fn(); print("ok   %s: %d rows" % (name, n), flush=True); return (name, n, None)
    except Exception as e:
        print("FAIL %s: %s" % (name, e), file=sys.stderr, flush=True); return (name, 0, str(e))

with ThreadPoolExecutor(max_workers=6) as ex:
    res = list(ex.map(run, jobs))
ok = [r[0] for r in res if not r[2]]; bad = [{"series": r[0], "error": r[2]} for r in res if r[2]]
json.dump({"updated": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()), "ok": ok, "failed": bad}, open(os.path.join(OUT, "index.json"), "w"), indent=1)
print("\n%d ok, %d failed" % (len(ok), len(bad)))
if not ok: sys.exit(1)
