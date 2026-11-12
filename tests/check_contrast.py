#!/usr/bin/env python3
"""WCAG contrast gate for the design tokens in css/theme.css (both themes). Run: python3 tests/check_contrast.py
Text-bearing token pairs must reach AA (4.5:1). Parses the hex tokens straight from the stylesheet so a palette edit cannot silently drop below AA."""
import os, re, sys
CSS = open(os.path.join(os.path.dirname(__file__), "..", "css", "theme.css"), encoding="utf-8").read()

def block(selector_start):
    i = CSS.index(selector_start); j = CSS.index("}", i); return CSS[i:j]
def tokens(b): return {k: v for k, v in re.findall(r"--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b", b)}
def lum(h):
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def ratio(a, b):
    hi, lo = sorted([lum(a), lum(b)], reverse=True); return (hi + 0.05) / (lo + 0.05)

THEMES = {"dark": tokens(block(":root,:root[data-theme=dark]")), "light": tokens(block(":root[data-theme=light]"))}
FG, BG = ["ink", "ink2", "muted", "acc", "ok", "warn", "bad"], ["bg", "card", "card2"]
bad = 0
for name, t in THEMES.items():
    for k in FG + BG:
        if k not in t: print("missing token --%s in %s theme" % (k, name)); bad += 1
    if bad: continue
    for fg in FG:
        for bg in BG:
            r = ratio(t[fg], t[bg])
            if r < 4.5: print("FAIL %s: --%s on --%s = %.2f (< 4.5)" % (name, fg, bg, r)); bad += 1
    r = ratio(t.get("on-acc", t["bg"]), t["acc"])      # text on filled accent buttons / active chips / skip link
    if r < 4.5: print("FAIL %s: text on --acc = %.2f" % (name, r)); bad += 1
    print("%s theme: lowest text pair %.2f:1" % (name, min(ratio(t[f], t[b]) for f in FG for b in BG)))
sys.exit(1 if bad else 0)
