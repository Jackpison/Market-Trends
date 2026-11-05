import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from _months_1996_2005 import M
base = os.path.join(os.path.dirname(__file__), "..", "data", "monthly")
for y, rows in M.items():
    assert len(rows) == 12, y
    out = [dict(month=f"{y}-{i+1:02d}", event=e, market_effect=m, metrics=None,
                confidence=("high" if e else "context-only")) for i,(e,m) in enumerate(rows)]
    json.dump(out, open(os.path.join(base, f"{y}.json"), "w"), indent=1, ensure_ascii=False)
import glob
yrs = sorted(int(os.path.basename(f)[:4]) for f in glob.glob(os.path.join(base, "[0-9][0-9][0-9][0-9].json")))
json.dump({"years": yrs}, open(os.path.join(base, "index.json"), "w"))
print(len(M), "years of monthly data; index has", len(yrs))
