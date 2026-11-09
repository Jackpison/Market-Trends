#!/usr/bin/env python3
"""Backtest the early-warning indicators and the composite against two targets, writing data/indicators/backtest.json.

Targets (month-end resolution, 1990 onward):
  recession : a new NBER recession starts within the next 12 months (data/market/recession_flag.csv)
  drawdown  : a S&P 500 bear market (>=20% fall from a monthly-close peak) begins within the next 12 months
Per indicator and alert threshold: AUC (rank-based, 0.5 = no skill), hit rate and median lead time over covered events, and the share of
alert episodes NOT followed by an event within 18 months (false alarms). Reuses scripts/build_indicators.py for metrics and scoring, so
results use exactly the live scoring rules.

Limits (also written into the output): only a handful of independent events (4 recessions, 4-5 bear markets), overlapping 12-month labels,
revised/vintage-free data, and in-sample thresholds. Treat as a sanity check on each signal, not as proof of forecasting skill."""
import bisect, datetime as dt, json, os, statistics, sys
sys.path.insert(0, os.path.dirname(__file__))
import build_indicators as B

START = dt.date(1990, 1, 1); HORIZON = 12; EP_WINDOW = 18; LEAD_WINDOW = 24; MIN_POS = 6; MIN_NEG = 24
mi = lambda d: d.year * 12 + d.month - 1                     # month index
ym = lambda i: "%04d-%02d" % (i // 12, i % 12 + 1)

def auc(pos, neg):
    """Mann-Whitney U / (n_pos*n_neg); ties count half."""
    if len(pos) < MIN_POS or len(neg) < MIN_NEG: return None
    s = sorted(neg); tot = 0.0
    for p in pos:
        lo, hi = bisect.bisect_left(s, p), bisect.bisect_right(s, p)
        tot += lo + 0.5 * (hi - lo)
    return tot / (len(pos) * len(neg))

def recession_events():
    f = B.load("market/recession_flag.csv"); flag = {mi(d): int(v) for d, v in zip(f.d, f.v)}
    starts = [m for m in sorted(flag) if flag[m] == 1 and flag.get(m - 1, 0) == 0 and m >= mi(START)]
    return starts, {m for m, v in flag.items() if v == 1}

def bear_events():
    s = B.load("market/sp500.csv"); px = {mi(d): v for d, v in zip(s.d, s.v)}
    ms = sorted(px); starts, in_dd = [], set(); peak_m, peak = ms[0], px[ms[0]]; pending = None
    for m in ms:
        v = px[m]
        if v >= peak:
            peak_m, peak, pending = m, v, None
        else:
            if pending is None and v <= peak * 0.8: pending = peak_m; starts.append(peak_m)
            if v <= peak * 0.8 or pending is not None: in_dd.add(m)
    return [m for m in starts if m >= mi(START)], in_dd

def evaluate(score_by_m, events, excluded, thresholds):
    """score_by_m: {month_idx: score}. Returns per-threshold stats."""
    months = sorted(score_by_m); res = {}
    pos = [score_by_m[m] for m in months if m not in excluded and any(m < e <= m + HORIZON for e in events)]
    neg = [score_by_m[m] for m in months if m not in excluded and not any(m < e <= m + HORIZON for e in events)]
    out = {"auc": None if auc(pos, neg) is None else round(auc(pos, neg), 3), "months_scored": len(months), "first_month": ym(months[0]) if months else None,
           "positive_months": len(pos), "events_total": len(events)}
    for th in thresholds:
        covered = [e for e in events if any(e - LEAD_WINDOW <= m < e for m in months)]
        hits, leads = 0, []
        for e in covered:
            al = [m for m in months if e - LEAD_WINDOW <= m < e and score_by_m[m] >= th]
            if any(e - EP_WINDOW <= m < e for m in al): hits += 1
            if al: leads.append(e - al[0])
        eps, cur = [], None                                    # alert episodes = runs of consecutive alert months outside the excluded set
        for m in months:
            on = score_by_m[m] >= th and m not in excluded
            if on and cur is None: cur = m
            if (not on) and cur is not None: eps.append(cur); cur = None
        if cur is not None: eps.append(cur)
        mature = [x for x in eps if x + EP_WINDOW <= max(months)]  # only judge episodes old enough to have had time to be followed
        false = [x for x in mature if not any(x < e <= x + EP_WINDOW for e in events)]
        out["t%g" % th] = {"threshold": th, "events_covered": len(covered), "hits": hits, "hit_rate": None if not covered else round(hits / len(covered), 2),
                           "median_lead_months": None if not leads else statistics.median(leads), "episodes": len(mature),
                           "false_alarm_share": None if not mature else round(len(false) / len(mature), 2)}
    return out

def main():
    cfg = json.load(open(B.P("config", "indicators.json")))
    MEs = [m for m in B.month_ends(12 * 37) if m >= START]
    rec_starts, rec_months = recession_events(); bear_starts, bear_months = bear_events()
    targets = {"recession": (rec_starts, rec_months), "drawdown": (bear_starts, bear_months)}
    per_ind, by_month = {}, {mi(m): {} for m in MEs}
    for ind in cfg["indicators"]:
        s = B.metric(ind); stale = cfg["stale_days"][ind["freq"]]; sc = {}
        for me in MEs:
            v = s.at(me, max_age=stale + 45); x = B.score(ind, v)
            if x is not None: sc[mi(me)] = x; by_month[mi(me)][ind["id"]] = x
        per_ind[ind["id"]] = sc
    comp = {}
    for m, d in by_month.items():
        c, _ = B.composite(cfg, d)
        if c is not None: comp[m] = c
    rows = []
    for ind in cfg["indicators"]:
        sc = per_ind[ind["id"]]
        if not sc: rows.append({"id": ind["id"], "name": ind["name"], "cat": ind["cat"], "note": "no history"}); continue
        r = {"id": ind["id"], "name": ind["name"], "cat": ind["cat"], "coverage_from": ym(min(sc))}
        for name, (ev, ex) in targets.items(): r[name] = evaluate(sc, ev, ex, (50, 100))
        rows.append(r)
    c = {"id": "composite", "name": "Composite risk score", "cat": "all", "coverage_from": ym(min(comp))}
    for name, (ev, ex) in targets.items(): c[name] = evaluate(comp, ev, ex, (25, 45, 65))
    out = {"generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "sample": "%s to %s, month-end" % (ym(min(by_month)), ym(max(by_month))),
           "targets": {"recession": {"events": [ym(e) for e in rec_starts], "def": "NBER recession start within next %d months" % HORIZON},
                       "drawdown": {"events": [ym(e) for e in bear_starts], "def": "S&P 500 bear-market (-20%% from monthly-close peak) peak within next %d months" % HORIZON}},
           "method": "AUC = P(score in a pre-event month > score in a non-event month), 0.5 = no skill. Hit = alert (score >= threshold) in the %d months before an event; "
                     "lead = months from first alert in the %d months before to the event; false alarm = alert episode with no event in the following %d months. "
                     "Months already in a recession / bear market are excluded." % (EP_WINDOW, LEAD_WINDOW, EP_WINDOW),
           "caveats": ["Only %d recessions and %d bear markets in sample: every rate below rests on very few independent events." % (len(rec_starts), len(bear_starts)),
                       "12-month labels overlap, so AUC confidence intervals are wider than the sample size suggests.",
                       "Current data vintages (revised), thresholds chosen with hindsight: results are optimistic compared with real-time use.",
                       "Indicators with short history cover fewer events: compare events_covered, not just rates."],
           "composite": c, "composite_series": [[ym(m), round(v, 1)] for m, v in sorted(comp.items())], "indicators": rows}
    json.dump(out, open(B.P("data", "indicators", "backtest.json"), "w"), separators=(",", ":"))
    print("recession events:", out["targets"]["recession"]["events"], "| bear events:", out["targets"]["drawdown"]["events"])
    fmt = lambda x: "  -  " if x is None else "%5.2f" % x
    print("%-28s %-8s | recession AUC  hit  lead  FA | drawdown AUC  hit  lead  FA" % ("indicator", "from"))
    for r in rows + [c]:
        if "recession" not in r: print("%-28s %s" % (r["name"][:28], r.get("note"))); continue
        a, b = r["recession"], r["drawdown"]; k = "t50" if "t50" in a else "t45"
        print("%-28s %-8s | %s  %s %5s %s | %s %s %5s %s" % (r["name"][:28], r["coverage_from"], fmt(a["auc"]), fmt(a[k]["hit_rate"]), a[k]["median_lead_months"], fmt(a[k]["false_alarm_share"]),
              fmt(b["auc"]), fmt(b[k]["hit_rate"]), b[k]["median_lead_months"], fmt(b[k]["false_alarm_share"])))
if __name__ == "__main__": main()
