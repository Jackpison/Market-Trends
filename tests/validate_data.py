#!/usr/bin/env python3
"""Structural validation of every data/config file the frontend reads (stdlib only). Exits non-zero with a list of problems.
Run: python3 tests/validate_data.py   (CI runs it on every pull request, so a pipeline change cannot silently break the site)."""
import datetime as dt, json, os, re, sys, xml.dom.minidom

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
errs = []
def err(f, msg): errs.append("%s: %s" % (f, msg))
def load(rel, required=True):
    try: return json.load(open(os.path.join(ROOT, rel)))
    except FileNotFoundError:
        if required: err(rel, "missing")
    except Exception as e: err(rel, "invalid JSON (%s)" % e)
def need(f, o, keys, what=""):
    for k in keys:
        if not isinstance(o, dict) or k not in o: err(f, "%smissing key '%s'" % (what, k))
def num01(f, name, v, lo=0, hi=100):
    if v is not None and not (isinstance(v, (int, float)) and lo <= v <= hi): err(f, "%s out of range [%s,%s]: %r" % (name, lo, hi, v))
def iso(f, name, v, fmt):
    try: dt.datetime.strptime(v, fmt)
    except Exception: err(f, "%s not a valid timestamp (%r)" % (name, v))

# ---- indicators ----
L = load("data/indicators/latest.json")
if L:
    f = "data/indicators/latest.json"; need(f, L, ["generated", "composite", "regime", "categories", "indicators", "coverage"]); iso(f, "generated", L.get("generated"), "%Y-%m-%dT%H:%MZ")
    num01(f, "composite", L.get("composite")); ids = set()
    for i in L.get("indicators", []):
        need(f, i, ["id", "name", "cat", "direction", "warn", "crit", "status"], "indicator: "); ids.add(i.get("id"))
        if i.get("status") not in ("green", "yellow", "red", "nodata", "stale"): err(f, "%s: bad status %r" % (i.get("id"), i.get("status")))
        num01(f, i.get("id", "?") + ".score", i.get("score"))
        if i.get("direction") not in ("higher_worse", "lower_worse"): err(f, "%s: bad direction" % i.get("id"))
    if len(ids) != len(L.get("indicators", [])): err(f, "duplicate indicator ids")
    cats = {c["id"] for c in L.get("categories", [])}
    for i in L.get("indicators", []):
        if i.get("cat") not in cats: err(f, "%s: unknown category %r" % (i.get("id"), i.get("cat")))
H = load("data/indicators/heatmap.json")
if H:
    f = "data/indicators/heatmap.json"; need(f, H, ["months", "rows", "composite"])
    if len(H.get("composite", [])) != len(H.get("months", [])): err(f, "composite length != months length")
    for r in H.get("rows", []):
        if len(r.get("scores", [])) != len(H.get("months", [])): err(f, "%s: scores length != months length" % r.get("id"))
Y = load("data/indicators/yield_curve.json")
if Y:
    f = "data/indicators/yield_curve.json"; need(f, Y, ["maturities", "dates", "curves"])
    if len(Y.get("dates", [])) != len(Y.get("curves", [])): err(f, "dates/curves length mismatch")
    if any(len(c) != len(Y.get("maturities", [])) for c in Y.get("curves", [])): err(f, "curve row width != maturities")
S = load("data/indicators/stress.json")
if S:
    f = "data/indicators/stress.json"; need(f, S, ["baseline", "betas", "priors", "transmission"])
    for b in S.get("betas", []):
        need(f, b, ["target", "coef", "t", "r2", "n", "se", "resid_sd"], "beta '%s': " % b.get("target"))
        if len(b.get("coef", [])) != len(b.get("se", [])): err(f, "%s: coef/se length mismatch" % b.get("target"))
BT = load("data/indicators/backtest.json")
if BT:
    f = "data/indicators/backtest.json"; need(f, BT, ["sample", "targets", "method", "caveats", "composite", "indicators", "composite_series"])
    for r in BT.get("indicators", []) + [BT.get("composite", {})]:
        for tgt in ("recession", "drawdown"):
            if tgt in r:
                a = r[tgt].get("auc"); num01(f, "%s.%s.auc" % (r.get("id"), tgt), a, 0, 1)
                for k, v in r[tgt].items():
                    if isinstance(v, dict): num01(f, "%s.%s.%s.hit_rate" % (r.get("id"), tgt, k), v.get("hit_rate"), 0, 1); num01(f, "%s.%s.%s.false" % (r.get("id"), tgt, k), v.get("false_alarm_share"), 0, 1)

# ---- trends ----
M = load("data/macro_data.json")
if M:
    f = "data/macro_data.json"; need(f, M, ["generated", "status", "trends", "signals", "benchmarks", "defi", "ticker", "method"]); iso(f, "generated", M.get("generated"), "%Y-%m-%dT%H:%MZ")
    for s, v in M.get("status", {}).items():
        if v.get("state") not in ("live", "partial", "failed", "unconfigured"): err(f, "status.%s: bad state %r" % (s, v.get("state")))
    quads = {"Smart Money Stealth", "Mainstream Trend", "Retail Hype / Bubble", "Dormant / Seed", None}
    for t in M.get("trends", []):
        need(f, t, ["id", "name", "sector", "horizon", "nvs", "capital", "smii", "quadrant", "stage"], "trend: ")
        num01(f, t.get("id", "?") + ".nvs", t.get("nvs")); num01(f, t.get("id", "?") + ".capital", (t.get("capital") or {}).get("score")); num01(f, t.get("id", "?") + ".smii", (t.get("smii") or {}).get("score"))
        if t.get("quadrant") not in quads: err(f, "%s: bad quadrant %r" % (t.get("id"), t.get("quadrant")))
    for s in M.get("signals", []):
        if s.get("strength") not in ("High", "Medium", "Speculative"): err(f, "signal strength %r" % s.get("strength"))
T = load("config/trends.json"); NET = load("config/network.json")
if T and M:
    cfg, got = {t["id"] for t in T["trends"]}, {t["id"] for t in M.get("trends", [])}
    if cfg != got: err("data/macro_data.json", "trend ids differ from config/trends.json: %s" % sorted(cfg ^ got))
if NET:
    for g in NET.get("graphs", []):
        nodes = {n["id"] for n in g["nodes"]}
        for e in g["edges"]:
            if e["from"] not in nodes or e["to"] not in nodes: err("config/network.json", "graph %s: edge %s->%s references an unknown node" % (g["id"], e["from"], e["to"]))
        for n in g["nodes"]:
            if n.get("role") not in ("driver", "core", "enabler", "beneficiary", "bottleneck", "risk"): err("config/network.json", "node %s: bad role %r" % (n["id"], n.get("role")))

# ---- alerts ----
A = load("data/alerts.json", required=False)
if A:
    for e in A.get("events", []):
        need("data/alerts.json", e, ["ts", "kind", "severity", "title", "detail"], "event: ")
        if e.get("severity") not in ("info", "warning", "critical"): err("data/alerts.json", "bad severity %r" % e.get("severity"))
if os.path.exists(os.path.join(ROOT, "data", "feed.xml")):
    try: xml.dom.minidom.parse(os.path.join(ROOT, "data", "feed.xml"))
    except Exception as e: err("data/feed.xml", "not well-formed XML (%s)" % e)

# ---- index.html references only files that exist ----
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
for ref in re.findall(r'(?:href|src)="((?!https?:|#|data:)[^"]+)"', html):
    if not os.path.exists(os.path.join(ROOT, ref.split("?")[0])): err("index.html", "references missing file %s" % ref)

if errs:
    print("DATA VALIDATION FAILED (%d):" % len(errs)); [print("  -", e) for e in errs]; sys.exit(1)
print("data validation ok")
