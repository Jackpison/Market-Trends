import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from _years import Y
rows = [dict(year=y, headline=h, regime=r, impact=i, tags=t, confidence=c,
             metrics=None) for (y,h,r,i,t,c) in Y]
out = os.path.join(os.path.dirname(__file__), "..", "data", "yearly", "overview.json")
json.dump(rows, open(out,"w"), indent=1, ensure_ascii=False)
print(len(rows), "years written")
