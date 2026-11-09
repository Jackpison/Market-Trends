#!/usr/bin/env python3
"""Build dist/market-trends.html: the whole site (HTML, CSS, JS, fonts, vendor libs and current data) in ONE file that works
offline and from file://. A tiny fetch() shim serves the embedded data, so the app code runs unchanged.

Needs Node (only at build time) for esbuild:  python3 scripts/build_single.py
Output is generated; it is git-ignored. Re-run after each data refresh to publish a fresh snapshot."""
import base64, json, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
P = lambda *a: os.path.join(ROOT, *a)
read = lambda *a: open(P(*a), encoding="utf-8").read()
safe_script = lambda s: s.replace("</script", "<\\/script").replace("<!--", "<\\!--")

def esbuild(args):
    cmd = ["npx", "--yes", "esbuild@0.28.2"] + args
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode: sys.exit("esbuild failed:\n" + r.stderr)
    return r.stdout

def inline_css(path):
    css, base = read(path), os.path.dirname(path)
    def font(m):
        f = os.path.normpath(os.path.join(P(base), m.group(1)))
        return "url(data:font/woff2;base64,%s)" % base64.b64encode(open(f, "rb").read()).decode()
    return re.sub(r"url\(\s*['\"]?([^)'\"]+\.woff2)['\"]?\s*\)", font, css)

def embedded_files():
    """Every file the app fetch()es at runtime, keyed by the exact relative URL it requests."""
    out = {}
    for d, exts in (("data", (".json", ".csv", ".xml")), ("docs", (".md",)), ("config", (".json",))):
        for dp, dirs, fs in os.walk(P(d)):
            dirs[:] = [x for x in dirs if not (d == "data" and x == "macro")]     # raw series CSVs are build inputs; the app never fetches them
            for f in sorted(fs):
                if f.endswith(exts) and not f.startswith("."):
                    out[os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, "/")] = open(os.path.join(dp, f), encoding="utf-8").read()
    return out

def main():
    html = read("index.html")
    css = "\n".join(inline_css(os.path.join("css" if "css/" in h else "assets", os.path.basename(h)))
                    for h in re.findall(r'<link rel="stylesheet" href="([^"]+)"', html))
    legacy = esbuild([P("assets", "app.js"), "--minify"])
    bundle = esbuild([P("js", "main.js"), "--bundle", "--format=iife", "--minify"])
    vendor = "\n".join("<script>%s</script>" % safe_script(read("vendor", v)) for v in ("chart.umd.js", "vis-network.min.js"))
    files = embedded_files()
    shim = ("window.__MT_INLINE=true;window.__MT_FILES=%s;(function(){var o=window.fetch.bind(window);window.fetch=function(u,i){"
            "var k=String(u).replace(/^\\.\\//,'').split('?')[0];if(Object.prototype.hasOwnProperty.call(window.__MT_FILES,k)){"
            "var t=window.__MT_FILES[k];return Promise.resolve(new Response(t,{status:200,headers:{'Content-Type':k.slice(-4)==='.csv'?'text/csv':k.slice(-3)==='.md'?'text/markdown':k.slice(-4)==='.xml'?'application/atom+xml':'application/json'}}))}"
            "return location.protocol==='file:'?Promise.resolve(new Response('',{status:404})):o(u,i)}})();") % json.dumps(files, separators=(",", ":")).replace("<", "\\u003c")
    html = re.sub(r'<link rel="(?:stylesheet|preload)"[^>]*>\s*', "", html)
    html = re.sub(r'<script src="assets/app\.js"></script>\s*<script type="module" src="js/main\.js"></script>', "", html)
    html = html.replace("</head>", "<style>%s</style>\n</head>" % css)
    html = html.replace("</body>", "<script>%s</script>\n<script>%s</script>\n%s\n<script>%s</script>\n</body>" % (safe_script(shim), safe_script(legacy), vendor, safe_script(bundle)))
    os.makedirs(P("dist"), exist_ok=True)
    out = P("dist", "market-trends.html"); open(out, "w", encoding="utf-8").write(html)
    print("wrote %s (%.2f MB, %d embedded files)" % (os.path.relpath(out, ROOT), os.path.getsize(out) / 1e6, len(files)))

if __name__ == "__main__": main()
