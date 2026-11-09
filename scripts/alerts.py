#!/usr/bin/env python3
"""Detect meaningful changes between runs and publish them. Stdlib only.

Reads : data/indicators/latest.json (regime, per-indicator status), data/macro_data.json (trend quadrants, strong signals), data/alerts_state.json (previous run)
Writes: data/alerts.json (event log, newest first, max 200), data/feed.xml (Atom feed), data/alerts_state.json, and an issue body file when something
        worth a notification happened (env ALERTS_ISSUE_BODY=path; sets `notify=true` in $GITHUB_OUTPUT).
The first run only records state (no events), so enabling this never floods anyone. Events:
  regime     composite regime changed (Calm/Watch/Elevated/Critical); rising into Elevated or Critical is a notification-worthy event
  indicator  an indicator turned red, or recovered from red
  quadrant   a trend moved into / out of 'Smart Money Stealth' or 'Retail Hype / Bubble'"""
import datetime as dt, json, os, sys
from xml.sax.saxutils import escape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
P = lambda *a: os.path.join(ROOT, *a)
SITE = "https://jackpison.github.io/Market-Trends/"
ORDER = ["Calm", "Watch", "Elevated", "Critical"]
WATCHED_QUADS = {"Smart Money Stealth", "Retail Hype / Bubble"}

def load(path, default=None):
    try: return json.load(open(path))
    except Exception: return default

def snapshot(latest, macro):
    s = {}
    if latest: s["regime"] = latest.get("regime"); s["composite"] = latest.get("composite"); s["red"] = sorted(i["id"] for i in latest["indicators"] if i.get("status") == "red")
    if macro: s["quads"] = {t["id"]: t.get("quadrant") for t in macro.get("trends", [])}
    return s

def diff(prev, cur, latest, macro, now):
    ev = []
    ts = now.strftime("%Y-%m-%dT%H:%MZ")
    if "regime" in prev and cur.get("regime") and prev["regime"] != cur["regime"]:
        a, b = prev["regime"], cur["regime"]; up = ORDER.index(b) > ORDER.index(a) if a in ORDER and b in ORDER else False
        sev = "critical" if b == "Critical" else "warning" if up and b == "Elevated" else "info"
        ev.append({"ts": ts, "kind": "regime", "severity": sev, "title": "Risk regime %s: %s -> %s" % ("rose" if up else "eased", a, b),
                   "detail": "Composite risk score %s (was %s). Open the Radar tab for the indicator breakdown." % (cur.get("composite"), prev.get("composite"))})
    if "red" in prev and "red" in cur:
        names = {i["id"]: i["name"] for i in (latest or {}).get("indicators", [])}
        for i in sorted(set(cur["red"]) - set(prev["red"])): ev.append({"ts": ts, "kind": "indicator", "severity": "warning", "title": "%s turned RED" % names.get(i, i), "detail": "Crossed its critical threshold."})
        for i in sorted(set(prev["red"]) - set(cur["red"])): ev.append({"ts": ts, "kind": "indicator", "severity": "info", "title": "%s recovered from red" % names.get(i, i), "detail": "Back below its critical threshold."})
    if "quads" in prev and "quads" in cur:
        tn = {t["id"]: t["name"] for t in (macro or {}).get("trends", [])}
        for k, q in cur["quads"].items():
            p = prev["quads"].get(k)
            if p is None or p == q or not ({p, q} & WATCHED_QUADS): continue
            ev.append({"ts": ts, "kind": "quadrant", "severity": "warning" if q in WATCHED_QUADS else "info", "title": "%s: %s -> %s" % (tn.get(k, k), p or "n/a", q or "n/a"),
                       "detail": "Narrative velocity vs capital score moved the trend between quadrants."})
    return ev

def atom(events, now):
    ents = "".join("<entry><id>%s</id><title>%s</title><updated>%s</updated><link href=\"%s\"/><category term=\"%s\"/><summary>%s</summary></entry>" % (
        escape("tag:market-trends,%s:%d" % (e["ts"], i)), escape("[%s] %s" % (e["severity"].upper(), e["title"])), escape(e["ts"]), SITE, escape(e["kind"]), escape(e["detail"])) for i, e in enumerate(events[:50]))
    upd = events[0]["ts"] if events else now.strftime("%Y-%m-%dT%H:%MZ")
    return ('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Market Trends alerts</title><id>tag:market-trends,alerts</id>'
            '<link href="%s"/><link rel="self" href="%sdata/feed.xml"/><updated>%s</updated>%s</feed>\n') % (SITE, SITE, escape(upd), ents)

def main(now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    latest, macro = load(P("data", "indicators", "latest.json")), load(P("data", "macro_data.json"))
    prev = load(P("data", "alerts_state.json"), None); cur = snapshot(latest, macro)
    state = dict(prev or {}); state.update(cur)
    log = load(P("data", "alerts.json"), {"events": []})["events"]
    new = diff(prev, cur, latest, macro, now) if prev is not None else []
    log = (new + log)[:200]
    json.dump({"generated": now.strftime("%Y-%m-%dT%H:%MZ"), "events": log}, open(P("data", "alerts.json"), "w"), indent=1)
    json.dump(state, open(P("data", "alerts_state.json"), "w"), indent=1)
    open(P("data", "feed.xml"), "w", encoding="utf-8").write(atom(log, now))
    notify = [e for e in new if e["severity"] in ("warning", "critical")]
    body = os.environ.get("ALERTS_ISSUE_BODY")
    if notify and body:
        lines = ["Automated alert from the scheduled data run (%s).\n" % now.strftime("%Y-%m-%d %H:%M UTC")] + ["- **%s**: %s. %s" % (e["severity"].upper(), e["title"], e["detail"]) for e in notify] + ["\nDashboard: " + SITE]
        open(body, "w").write("\n".join(lines))
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as f: f.write("notify=%s\ntitle=%s\n" % ("true" if notify and body else "false", (notify[0]["title"] if notify else "")[:120]))
    print("alerts: %d new (%d notify-worthy), log size %d%s" % (len(new), len(notify), len(log), " [first run: state recorded]" if prev is None else ""))
    return new

if __name__ == "__main__": main()
