"""Offline regression tests for the source-health fixes. Run: python3 tests/test_pipeline_fixes.py"""
import json, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fetch_trends as F
ROOT = os.path.join(os.path.dirname(__file__), "..")

def gdelt_query_ok(q):
    """GDELT DOC API rejects nested parentheses and AND inside parentheses ('Parentheses may only be used around OR'd statements')."""
    depth = 0
    for m in re.finditer(r"[()]", q):
        depth += 1 if m.group() == "(" else -1
        if depth > 1 or depth < 0: return False
    return all(" AND " not in g for g in re.findall(r"\(([^)]*)\)", q))

def test_news_queries():
    cfg = json.load(open(os.path.join(ROOT, "config", "trends.json")))
    bad = [t["id"] for t in cfg["trends"] if not gdelt_query_ok(t["news_query"])]
    assert not bad, "invalid GDELT queries: %s" % bad
    assert not gdelt_query_ok("(copper AND (shortage OR deficit))")        # the original bug must be detected

def test_source_state():
    assert F.source_state({"ok": 3, "fail": 0, "errors": []}) == "live"
    assert F.source_state({"ok": 3, "fail": 1, "errors": ["x"]}) == "partial"
    assert F.source_state({"ok": 0, "fail": 2, "errors": ["a: HTTP 429"]}) == "failed"
    assert F.source_state({"ok": 0, "fail": 4, "errors": ["ai_infra: no REDDIT_CLIENT_ID/SECRET set (blocked)"]}) == "unconfigured"
    assert F.source_state({"ok": 0, "fail": 2, "errors": ["a: no REDDIT_CLIENT_ID/SECRET set", "b: HTTP 500"]}) == "failed"

def test_gdelt_backoff():
    calls, sleeps = [], []
    body = json.dumps({"timeline": [{"data": [{"date": "20260101T000000Z", "value": 1.5}]}]})
    def fake_get(url, **kw):
        calls.append(url)
        if len(calls) < 3: raise RuntimeError("HTTP Error 429: Too Many Requests")
        return body
    og, os_, ot = F.get, F.time.sleep, {k: v.i for k, v in F.TH.items()}
    F.get, F.time.sleep = fake_get, sleeps.append
    for v in F.TH.values(): v.i = 0
    try: acc = F._gdelt("uranium (price OR supply)", "timelinevol")
    finally: F.get, F.time.sleep = og, os_
    assert len(calls) == 3 and sleeps == [20, 40] and acc, (calls, sleeps)

if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"): f(); print("ok", n)
