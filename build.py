"""Builds app.html (the MHUB app for the website) from src/hub-body.html + src/local-runtime.js.
src/hub-body.html is the same Hub page published on claude.ai; this swaps its Claude data layer
for browser storage and adjusts a few site-only bits. Run: python3 build.py"""
import re, pathlib
root = pathlib.Path(__file__).parent
body = (root / 'src/hub-body.html').read_text()
runtime = (root / 'src/local-runtime.js').read_text()
CLAUDE_HUB = 'https://claude.ai/artifact/XnXFUXoPTjgZAcDm5YoZfx'
swaps = {
    '<title>MHUB</title>': '',
    '<h1>MHUB<span class="dot">.</span></h1>': '<h1><a href="./" style="text-decoration:none;color:inherit" title="MHUB home">MHUB<span class="dot">.</span></a></h1>',
    '<p class="hint" id="t-unavail" hidden>The tutor needs Claude access in this view. Open the Hub on claude.ai while signed in.</p>':
        f'<div class="card" id="t-unavail" hidden><p class="h2" style="margin-bottom:6px">The AI tutor runs inside Claude</p><p class="hint" style="margin-bottom:12px">Everything else in MHUB works right here. To chat with the tutor that knows your mistakes and topics, open MHUB in Claude with a free account.</p><a class="btn" href="{CLAUDE_HUB}" target="_blank" rel="noopener">Open the AI tutor</a></div>',
    'Saved. The AI parts need Claude access in this view.': 'Saved. Open MHUB in Claude to have the AI rate your topics and write your plan.',
    'Open this page on claude.ai to load your saved data.': 'Loading…',
}
for a, b in swaps.items():
    if a not in body: raise SystemExit('missing: ' + a[:60])
    body = body.replace(a, b)
# hide chat composer bits when AI isn't available
body = body.replace("$('t-unavail').hidden = !unavailable;", "$('t-unavail').hidden = !unavailable; document.querySelector('.chat').hidden = unavailable;")
head = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>MHUB App · Your MCAT study hub</title>
<meta name="description" content="Your MHUB: trap log, spaced-repetition flashcards, topic map, score trend and study plan for the MCAT.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2312151C'/%3E%3Ctext x='32' y='44' font-family='Arial Black,Arial' font-size='34' font-weight='900' text-anchor='middle' fill='%23fff'%3EM%3C/text%3E%3Ccircle cx='50' cy='42' r='4' fill='%232F5BEA'/%3E%3C/svg%3E">
<style>[hidden]{{display:none!important}}body{{margin:0}}img{{max-width:100%}}:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}</style>
<script>
{runtime}
</script>
</head>
<body>
'''
(root / 'app.html').write_text(head + body + '\n</body>\n</html>\n')
print('built app.html', len(head + body))
