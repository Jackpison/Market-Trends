#!/usr/bin/env python3
"""Compute early-warning indicators, risk heatmap, yield-curve snapshots and stress-test betas.
Inputs: data/macro/*.csv, data/market/*.csv, config/indicators.json. Outputs: data/indicators/*.json. Pure stdlib."""
import bisect, csv, datetime as dt, json, math, os, statistics, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
P = lambda *a: os.path.join(ROOT, *a)
TODAY = dt.date.today()

class Ser:
    def __init__(s, pts):
        s.pts = sorted(pts); s.d = [p[0] for p in s.pts]; s.v = [p[1] for p in s.pts]
    def __len__(s): return len(s.d)
    def at(s, d, max_age=None):
        i = bisect.bisect_right(s.d, d) - 1
        if i < 0: return None
        if max_age is not None and (d - s.d[i]).days > max_age: return None
        return s.v[i]
    def last(s): return (s.d[-1], s.v[-1]) if s.d else (None, None)

_cache = {}
def load(rel):
    if rel in _cache: return _cache[rel]
    pts = []; path = P("data", rel)
    if os.path.exists(path):
        with open(path, newline="") as f:
            rd = csv.reader(f); head = next(rd, []); h = [x.strip().lower() for x in head]
            ci = h.index("close") if "close" in h else 1
            for row in rd:
                try:
                    if len(row) <= ci or row[ci].strip() in ("", ".", "null", "None"): continue
                    pts.append((dt.date.fromisoformat(row[0].strip()[:10]), float(row[ci])))
                except Exception: continue
    _cache[rel] = Ser(pts); return _cache[rel]

def first(cands):
    for c in cands:
        s = load(c)
        if len(s): return s
    return Ser([])

def chg(s, days, pct=True):
    out = []
    for d, v in zip(s.d, s.v):
        p = s.at(d - dt.timedelta(days=days))
        if p is None or (pct and p == 0): continue
        out.append((d, (v / p - 1) * 100 if pct else v - p))
    return Ser(out)

def chg_obs(s, n, pct=True):
    out = []
    for i in range(n, len(s.d)):
        p = s.v[i - n]
        if pct and p == 0: continue
        out.append((s.d[i], (s.v[i] / p - 1) * 100 if pct else s.v[i] - p))
    return Ser(out)

def metric(ind):
    c, I = ind["calc"], ind["inputs"]
    if c == "level": return first(I["main"])
    if c == "pct_chg": return chg(first(I["main"]), ind["days"])
    if c == "yoy_obs": return chg_obs(first(I["main"]), ind.get("n", 12))
    if c == "net_liquidity":
        w, r, t = first(I["walcl"]), first(I["rrp"]), first(I["tga"])
        if not len(w) or not len(t): return Ser([])
        pts = [(d, v / 1000.0 - (r.at(d) or 0.0) - (t.at(d) or 0.0) / 1000.0) for d, v in zip(w.d, w.v)]
        return chg(Ser(pts), ind["window_days"])
    if c == "ratio_chg":
        a, b = first(I["a"]), first(I["b"])
        if not len(a) or not len(b): return Ser([])
        pts = [(d, v / b.at(d)) for d, v in zip(a.d, a.v) if b.at(d)]
        return chg(Ser(pts), ind["days"])
    if c == "drawdown":
        s = first(I["main"]); w = ind.get("window", 252); out = []
        for i in range(len(s.d)):
            hi = max(s.v[max(0, i - w + 1): i + 1]); out.append((s.d[i], (s.v[i] / hi - 1) * 100))
        return Ser(out)
    if c == "sahm":
        s = first(I["main"]); ma = []
        for i in range(2, len(s.d)): ma.append((s.d[i], sum(s.v[i - 2:i + 1]) / 3))
        out = []
        for i in range(12, len(ma)): out.append((ma[i][0], ma[i][1] - min(x[1] for x in ma[i - 12:i])))
        return Ser(out)
    if c == "squeeze_gex":
        path = P("data", I["main"][0]); pts = []
        if os.path.exists(path):
            with open(path, newline="") as f:
                for row in csv.DictReader(f):
                    try: pts.append((dt.date.fromisoformat(row["date"][:10]), float(row["gex"]) / 1e9))
                    except Exception: pass
        return Ser(pts)
    return Ser([])

def score(ind, v):
    if v is None: return None
    x = abs(v - ind["center"]) if "center" in ind else (abs(v) if ind.get("two_sided") else v)
    w, c = ind["warn"], ind["crit"]
    return max(0.0, min(100.0, 50 + 50 * (x - w) / (c - w)))
status_of = lambda sc: None if sc is None else ("green" if sc < 50 else "yellow" if sc < 100 else "red")

def month_ends(n_months):
    y, m = TODAY.year, TODAY.month; out = []
    for _ in range(n_months):
        nxt = dt.date(y + (m == 12), (m % 12) + 1, 1)
        out.append(min(nxt - dt.timedelta(days=1), TODAY)); m -= 1
        if m == 0: m, y = 12, y - 1
    return out[::-1]

def composite(cfg, scores_by_ind):
    num = den = 0.0; cats = {}
    for c in cfg["categories"]:
        vals = [(scores_by_ind[i["id"]], i.get("weight", 1.0)) for i in cfg["indicators"] if i["cat"] == c["id"] and scores_by_ind.get(i["id"]) is not None and i.get("weight", 1.0) > 0]
        if vals:
            sc = sum(a * w for a, w in vals) / sum(w for _, w in vals); cats[c["id"]] = sc; num += sc * c["weight"]; den += c["weight"]
    return (num / den if len(cats) >= 2 and den else None), cats

def regime(cfg, v):
    if v is None: return None
    for r in cfg["regimes"]:
        if v < r["max"]: return r["label"]

# ---------- OLS ----------
def inv(M):
    n = len(M); A = [r[:] + [1.0 if i == j else 0.0 for j in range(n)] for i, r in enumerate(M)]
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(A[r][i]))
        if abs(A[p][i]) < 1e-12: return None
        A[i], A[p] = A[p], A[i]; d = A[i][i]; A[i] = [x / d for x in A[i]]
        for r in range(n):
            if r != i:
                f = A[r][i]; A[r] = [a - f * b for a, b in zip(A[r], A[i])]
    return [r[n:] for r in A]

def ols(X, y):
    n, k = len(X), len(X[0]) + 1; Z = [[1.0] + r for r in X]
    XtX = [[sum(Z[t][i] * Z[t][j] for t in range(n)) for j in range(k)] for i in range(k)]
    Xty = [sum(Z[t][i] * y[t] for t in range(n)) for i in range(k)]
    Inv = inv(XtX)
    if Inv is None or n <= k: return None
    b = [sum(Inv[i][j] * Xty[j] for j in range(k)) for i in range(k)]
    res = [y[t] - sum(Z[t][i] * b[i] for i in range(k)) for t in range(n)]
    s2 = sum(r * r for r in res) / (n - k); my = sum(y) / n; sst = sum((v - my) ** 2 for v in y)
    return {"b": b, "t": [b[i] / math.sqrt(s2 * Inv[i][i]) if s2 * Inv[i][i] > 0 else 0 for i in range(k)], "r2": 1 - sum(r * r for r in res) / sst if sst else 0, "n": n, "Inv": Inv, "s2": s2, "se": [math.sqrt(s2 * Inv[i][i]) if s2 * Inv[i][i] > 0 else 0 for i in range(k)]}

def monthend(s):
    out = {}
    for d, v in zip(s.d, s.v): out[d.strftime("%Y-%m")] = v
    return out
def prevkey(k):
    y, m = int(k[:4]), int(k[5:]); return "%04d-%02d" % ((y, m - 1) if m > 1 else (y - 1, 12))

def monthly_pairs(target, factors, since="1986-01", until=None):
    """target: dict ym->level (returns), factors: list of (dict, mode) mode 'diff' or 'pct'."""
    ys, Xs, keys = [], [], []
    for k in sorted(target):
        pk = prevkey(k)
        if k < since or (until and k > until) or pk not in target: continue
        row = []; ok = True
        for f, mode in factors:
            if k not in f or pk not in f: ok = False; break
            row.append(f[k] - f[pk] if mode == "diff" else (f[k] / f[pk] - 1) * 100 if f[pk] else 0)
        if ok: ys.append((target[k] / target[pk] - 1) * 100); Xs.append(row); keys.append(k)
    return Xs, ys, keys

def fit(name, X, y, names, period, extra=None):
    if len(y) < 36: return None
    r = ols(X, y)
    if not r: return None
    out = {"target": name, "factors": names, "coef": [round(x, 4) for x in r["b"][1:]], "t": [round(x, 2) for x in r["t"][1:]], "alpha_monthly": round(r["b"][0], 4), "se": [round(x, 4) for x in r["se"][1:]], "resid_sd": round(math.sqrt(r["s2"]), 3), "r2": round(r["r2"], 4), "n": r["n"], "period": period, "source": "estimated"}
    if extra: out.update(extra)
    return out

def main():
    cfg = json.load(open(P("config", "indicators.json")))
    os.makedirs(P("data", "indicators"), exist_ok=True)
    mets = {i["id"]: metric(i) for i in cfg["indicators"]}
    MEs = month_ends(180); out_ind = []; hm_rows = []
    scores_latest = {}
    for ind in cfg["indicators"]:
        s = mets[ind["id"]]
        gaps = [(b - a).days for a, b in zip(s.d[-60:], s.d[-59:])]
        med = statistics.median(gaps) if gaps else 1
        eff = "monthly" if med > 20 else ("weekly" if med > 3 else ind["freq"])
        stale = cfg["stale_days"][eff if ind["freq"] == "daily" and eff != "daily" else ind["freq"]]
        row = {k: ind[k] for k in ("id", "name", "cat", "unit", "freq", "direction", "warn", "crit", "logic", "why", "history", "sources", "track") if k in ind}
        row.update({"weight": ind.get("weight", 1.0), "two_sided": bool(ind.get("two_sided")), "center": ind.get("center")})
        hm = []
        for me in MEs:
            v = s.at(me, max_age=stale + 45); sc = score(ind, v)
            hm.append(None if sc is None else round(sc, 1))
        hm_rows.append({"id": ind["id"], "name": ind["name"], "cat": ind["cat"], "scores": hm})
        if not len(s):
            row.update({"status": "nodata", "value": None, "score": None}); out_ind.append(row); continue
        d, v = s.last(); age = (TODAY - d).days; sc = score(ind, v)
        flags = []
        if age > stale: flags.append("stale (last data %s)" % d.isoformat())
        if ind["id"] in ("t10y3m", "t10y2y"):
            past = [x for dd, x in zip(s.d, s.v) if (d - dd).days <= 548]
            p90 = s.at(d - dt.timedelta(days=90))
            if v < 0: flags.append("INVERTED (%.2fpp)" % v)
            elif past and min(past) < 0 and p90 is not None and v > p90: flags.append("re-steepening after inversion (historically a late-cycle phase)")
        v1 = s.at(d - dt.timedelta(days=30)); v3 = s.at(d - dt.timedelta(days=91))
        win = [x for dd, x in zip(s.d, s.v) if (d - dd).days <= 3650]
        pct = round(100.0 * sum(1 for x in win if x <= v) / len(win), 1) if win else None
        hist = []; seen = set()
        for me in month_ends(240):
            x = s.at(me, max_age=stale + 45)
            if x is not None: hist.append([me.strftime("%Y-%m"), round(x, 3)])
        row.update({"value": round(v, 3), "asof": d.isoformat(), "age_days": age, "score": None if sc is None else round(sc, 1), "status": status_of(sc) if age <= stale * 3 else "stale",
                    "chg_1m": None if v1 is None else round(v - v1, 3), "chg_3m": None if v3 is None else round(v - v3, 3), "pctile_10y": pct, "flags": flags, "hist": hist})
        scores_latest[ind["id"]] = sc if age <= stale * 3 else None
        out_ind.append(row)
    comp, cats = composite(cfg, scores_latest)
    # composite history
    comp_hist = []
    for k, me in enumerate(MEs):
        c, _ = composite(cfg, {r["id"]: r["scores"][k] for r in hm_rows})
        comp_hist.append(None if c is None else round(c, 1))
    cat_out = [{"id": c["id"], "name": c["name"], "weight": c["weight"], "score": None if c["id"] not in cats else round(cats[c["id"]], 1)} for c in cfg["categories"]]
    latest = {"generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "composite": None if comp is None else round(comp, 1), "regime": regime(cfg, comp),
              "regimes": cfg["regimes"], "categories": cat_out, "indicators": out_ind, "coverage": {"with_data": sum(1 for r in out_ind if r["status"] not in ("nodata", "stale")), "total": len(out_ind)}}
    json.dump(latest, open(P("data", "indicators", "latest.json"), "w"), separators=(",", ":"))
    json.dump({"months": [m.strftime("%Y-%m") for m in MEs], "rows": hm_rows, "composite": comp_hist}, open(P("data", "indicators", "heatmap.json"), "w"), separators=(",", ":"))

    # yield curve snapshots
    labels = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"]
    ids = ["DGS1MO", "DGS3MO", "DGS6MO", "DGS1", "DGS2", "DGS3", "DGS5", "DGS7", "DGS10", "DGS20", "DGS30"]
    ser = [load("macro/%s.csv" % i) for i in ids]
    months, curves = [], []
    if any(len(s) for s in ser):
        for me in month_ends(12 * 37):
            if me < dt.date(1990, 1, 31): continue
            row = [None if s.at(me, 10) is None else round(s.at(me, 10), 3) for s in ser]
            if sum(1 for x in row if x is not None) >= 4: months.append(me.isoformat()); curves.append(row)
    json.dump({"maturities": labels, "dates": months, "curves": curves}, open(P("data", "indicators", "yield_curve.json"), "w"), separators=(",", ":"))

    # stress-test calibration
    spx = load("market/sp500.csv"); cur = TODAY.strftime("%Y-%m")
    spx_m = {k: v for k, v in monthend(spx).items() if k != cur}
    y10 = monthend(first(["macro/DGS10.csv", "market/treasury_10y.csv"])); oil = monthend(first(["macro/DCOILWTICO.csv", "market/wti_oil.csv"]))
    betas = []
    X, y, keys = monthly_pairs(spx_m, [(y10, "diff"), (oil, "pct")])
    b = fit("S&P 500", X, y, ["d10y_pp", "oil_pct"], "%s to %s" % (keys[0], keys[-1]) if keys else "", None) if keys else None
    if b:
        betas.append(b)
        for lab, a, z in (("1986-2021", "1986-01", "2021-12"), ("2022-now", "2022-01", None)):
            X2, y2, k2 = monthly_pairs(spx_m, [(y10, "diff"), (oil, "pct")], since=a, until=z)
            sub = fit("S&P 500 (%s)" % lab, X2, y2, ["d10y_pp", "oil_pct"], lab)
            if sub: betas.append(sub)
    for tgt, rel in (("Regional banks (KRE)", "macro/kre.csv"), ("REITs (VNQ)", "macro/vnq.csv")):
        s = load(rel)
        if len(s):
            m = {k: v for k, v in monthend(s).items() if k != cur}
            X, y, keys = monthly_pairs(m, [(y10, "diff"), (oil, "pct")], since="2004-01")
            f = fit(tgt, X, y, ["d10y_pp", "oil_pct"], "%s to %s" % (keys[0], keys[-1]) if keys else "")
            if f: betas.append(f)
    cpi = monthend(load("market/cpi_all_items.csv")); oil_avg = monthend(load("market/wti_oil.csv"))
    ys, Xs = [], []
    for k in sorted(cpi):
        ks = [k, prevkey(k), prevkey(prevkey(k))]
        if k < "1986-01" or prevkey(k) not in cpi or any(x not in oil_avg or prevkey(x) not in oil_avg for x in ks): continue
        ys.append((cpi[k] / cpi[prevkey(k)] - 1) * 100); Xs.append([(oil_avg[x] / oil_avg[prevkey(x)] - 1) * 100 for x in ks])
    pas = None
    if len(ys) > 60:
        r = ols(Xs, ys)
        if r:
            c = [1, 1, 1]; Ic = [[r["Inv"][i + 1][j + 1] for j in range(3)] for i in range(3)]
            var = r["s2"] * sum(c[i] * Ic[i][j] * c[j] for i in range(3) for j in range(3)); tot = sum(r["b"][1:])
            pas = {"target": "CPI pass-through (pp CPI level per 1% oil, cumulative 3 months)", "coef": round(tot, 4), "t": round(tot / math.sqrt(var), 2) if var > 0 else None, "r2": round(r["r2"], 4), "n": r["n"], "source": "estimated"}
    mort_beta = None; mort = load("macro/MORTGAGE30US.csv"); y10d = load("macro/DGS10.csv")
    if len(mort) and len(y10d):
        Xm, ym_, km = monthly_pairs({k: v for k, v in monthend(mort).items() if k != cur}, [(monthend(y10d), "diff")], since="1990-01")
        # level diffs: regress d(mortgage) on d(10y)
        mm = monthend(mort); pairs = [(mm[k] - mm[prevkey(k)], monthend(y10d)[k] - monthend(y10d)[prevkey(k)]) for k in sorted(mm) if k >= "1990-01" and k != cur and prevkey(k) in mm and k in monthend(y10d) and prevkey(k) in monthend(y10d)]
        if len(pairs) > 60:
            r = ols([[p[1]] for p in pairs], [p[0] for p in pairs])
            if r: mort_beta = {"coef": round(r["b"][1], 3), "r2": round(r["r2"], 3), "n": r["n"], "source": "estimated"}
    def last_of(rel, default=None):
        s = load(rel); return (s.last()[1], s.last()[0].isoformat()) if len(s) else (default, None)
    cpi_s = load("market/cpi_all_items.csv"); cpi_yoy = round((cpi_s.v[-1] / cpi_s.v[-13] - 1) * 100, 2) if len(cpi_s) > 13 else None
    wage_s = load("macro/CES0500000003.csv"); wage_yoy = round((wage_s.v[-1] / wage_s.v[-13] - 1) * 100, 2) if len(wage_s) > 13 else None
    ff = last_of("market/fed_funds_rate.csv")[0]; t10 = (last_of("macro/DGS10.csv")[0] if len(load("macro/DGS10.csv")) else last_of("market/treasury_10y.csv")[0])
    mort_last = last_of("macro/MORTGAGE30US.csv")[0]; hy = last_of("macro/BAMLH0A0HYM2.csv")[0]; un = last_of("market/unemployment_rate.csv")[0]
    stress = {"generated": latest["generated"], "baseline": {"cpi_yoy": cpi_yoy, "wage_yoy": wage_yoy, "fed_funds": ff, "y10": t10, "mortgage30": mort_last, "hy_oas": hy, "unemployment": un},
              "betas": betas, "cpi_passthrough": pas, "mortgage_beta": mort_beta,
              "priors": {"spx": {"d10y_pp": -2.5, "oil_pct": -0.02, "hy_per_100bp": -4.0}, "banks": {"d10y_pp": -1.0, "oil_pct": -0.02, "hy_per_100bp": -6.0}, "reits": {"d10y_pp": -6.0, "oil_pct": 0.0, "hy_per_100bp": -4.5}, "cpi_passthrough": 0.035, "mortgage_beta": 0.9},
              "transmission": {"fed_to_10y": 0.35, "infl_to_10y": 0.5, "wage_stickiness": 0.4, "bank_securities_duration": 5.0, "loan": 400000}}
    json.dump(stress, open(P("data", "indicators", "stress.json"), "w"), indent=1)
    print("indicators with data: %d/%d | composite: %s (%s)" % (latest["coverage"]["with_data"], latest["coverage"]["total"], latest["composite"], latest["regime"]))
    for r in out_ind: print("  %-9s %-8s val=%s score=%s" % (r["id"], r["status"], r.get("value"), r.get("score")))
    print("betas:", [(b["target"], b["coef"], b["r2"]) for b in betas], "| passthrough:", pas and pas["coef"], "| mortgage beta:", mort_beta)
if __name__ == "__main__": main()
