"""Offline tests for scripts/alerts.py. Run: python3 tests/test_alerts.py"""
import datetime as dt, json, os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import alerts as A
NOW = dt.datetime(2026, 11, 9, 12, 0, tzinfo=dt.timezone.utc)
LATEST = lambda regime, comp, red: {"regime": regime, "composite": comp, "indicators": [{"id": i, "name": "Ind " + i, "status": "red" if i in red else "green"} for i in "abc"]}
MACRO = lambda q: {"trends": [{"id": "t1", "name": "Trend One", "quadrant": q}]}

def test_regime_rise_is_notifiable():
    prev = A.snapshot(LATEST("Watch", 30, []), None); l = LATEST("Elevated", 50, [])
    ev = A.diff(prev, A.snapshot(l, None), l, None, NOW)
    assert len(ev) == 1 and ev[0]["severity"] == "warning" and "rose" in ev[0]["title"], ev
def test_critical_and_easing():
    p = A.snapshot(LATEST("Elevated", 50, []), None); l = LATEST("Critical", 70, [])
    assert A.diff(p, A.snapshot(l, None), l, None, NOW)[0]["severity"] == "critical"
    p2 = A.snapshot(l, None); l2 = LATEST("Watch", 30, [])
    e = A.diff(p2, A.snapshot(l2, None), l2, None, NOW)[0]; assert e["severity"] == "info" and "eased" in e["title"]
def test_indicator_red_transitions():
    p = A.snapshot(LATEST("Watch", 30, ["a"]), None); l = LATEST("Watch", 30, ["b"])
    t = [e["title"] for e in A.diff(p, A.snapshot(l, None), l, None, NOW)]
    assert "Ind b turned RED" in t and "Ind a recovered from red" in t, t
def test_quadrant_only_watched_moves():
    m1, m2, m3 = MACRO("Dormant / Seed"), MACRO("Smart Money Stealth"), MACRO("Mainstream Trend")
    p = A.snapshot(None, m1)
    assert A.diff(p, A.snapshot(None, m2), None, m2, NOW)[0]["severity"] == "warning"
    assert A.diff(A.snapshot(None, m1), A.snapshot(None, m3), None, m3, NOW) == []        # neither side is a watched quadrant
def test_no_change_no_events():
    l = LATEST("Watch", 30, ["a"]); s = A.snapshot(l, MACRO("Dormant / Seed"))
    assert A.diff(s, s, l, MACRO("Dormant / Seed"), NOW) == []
def test_main_end_to_end_and_feed():
    d = tempfile.mkdtemp(); os.makedirs(os.path.join(d, "data", "indicators"))
    A.ROOT = d; A.P = lambda *a: os.path.join(d, *a)
    w = lambda p, o: json.dump(o, open(os.path.join(d, p), "w"))
    w("data/indicators/latest.json", LATEST("Watch", 30, [])); out = os.path.join(d, "out.txt"); body = os.path.join(d, "body.md")
    os.environ["GITHUB_OUTPUT"] = out; os.environ["ALERTS_ISSUE_BODY"] = body
    assert A.main(NOW) == []                                          # first run: state only
    w("data/indicators/latest.json", LATEST("Elevated", 55, ["a"]))
    new = A.main(NOW); assert len(new) == 2
    assert "notify=true" in open(out).read() and os.path.exists(body)
    assert A.main(NOW) == []                                          # unchanged: no repeat alert
    import xml.dom.minidom as md; feed = md.parse(os.path.join(d, "data", "feed.xml")); assert len(feed.getElementsByTagName("entry")) == 2
if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"): f(); print("ok", n)
