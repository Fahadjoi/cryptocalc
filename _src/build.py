#!/usr/bin/env python3
"""Builds the static CryptoCalc pages from fragments in pages/ into the repo."""
import re, json, html, sys, pathlib
SRC = pathlib.Path(__file__).parent / 'pages'
OUT = pathlib.Path(sys.argv[1])
SITE = 'https://zesty-haupia-16a953.netlify.app'
TOOLS = [
    ('/profit-calculator/', 'Profit', 'Profit / loss', 'What a trade makes or loses once fees are taken out'),
    ('/position-size-calculator/', 'Position', 'Position size', 'How much to buy for the risk and stop-loss you set'),
    ('/liquidation-calculator/', 'Liquidation', 'Liquidation price', 'Where a leveraged position gets closed by the exchange'),
    ('/average-cost-calculator/', 'Average', 'Average cost', 'Your average entry across several buys, and how to lower it'),
    ('/fee-calculator/', 'Fees', 'Exchange fees', 'What the same order costs on ten exchanges'),
    ('/dca-calculator/', 'DCA', 'DCA backtest', 'What regular buys over the past five years are worth today'),
    ('/staking-calculator/', 'Staking', 'Staking rewards', 'What staking adds up to with compounding'),
    ('/converter/', 'Converter', 'Converter', 'Live rates between 20 coins and 15 currencies'),
]
PCOINS = [('bitcoin', 'BTC', 'Bitcoin'), ('ethereum', 'ETH', 'Ethereum'), ('tether', 'USDT', 'Tether'), ('binancecoin', 'BNB', 'BNB'), ('solana', 'SOL', 'Solana'),
          ('ripple', 'XRP', 'XRP'), ('dogecoin', 'DOGE', 'Dogecoin'), ('cardano', 'ADA', 'Cardano'), ('tron', 'TRX', 'TRON'), ('litecoin', 'LTC', 'Litecoin')]
PFIATS = [('USD', 'US dollar', 'US dollars'), ('PKR', 'Pakistani rupee', 'Pakistani rupees'), ('INR', 'Indian rupee', 'Indian rupees'), ('EUR', 'euro', 'euros'), ('GBP', 'British pound', 'British pounds'), ('AED', 'UAE dirham', 'UAE dirhams')]
def ppath(sym, to): return f'/convert/{sym.lower()}-to-{to.lower()}/'
def plink(sym, to): return f'<a href="{ppath(sym, to)}">{sym} to {to}</a>'
FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='4' y='4' width='24' height='24' fill='%23FFE04A' stroke='%2315211C' stroke-width='4'/%3E%3C/svg%3E"

def field(m):
    p = [x.strip() for x in m.group(1).split('|')]
    fid, label, value, unit = p[0], p[1], p[2], p[3]
    opts = p[4] if len(p) > 4 else ''
    attrs = ''
    a = re.search(r'auto=([\d.]+)', opts)
    if a: attrs += f' data-autolive="{a.group(1)}"'
    mx = re.search(r'max=([\d.]+)', opts)
    if mx: attrs += f' max="{mx.group(1)}"'
    mn = re.search(r'min=([\d.]+)', opts)
    attrs += f' min="{mn.group(1) if mn else 0}"'
    ph = re.search(r'ph=([^ ]+)', opts)
    if ph: attrs += f' placeholder="{ph.group(1)}"'
    cls = 'field full' if 'full' in opts else 'field'
    live = f'<button type="button" class="live-btn" data-live="{fid}" disabled title="Use the live price">Live</button>' if 'live' in opts.split() else ''
    u = f'<span class="unit">{unit}</span>' if unit else ''
    return (f'<div class="{cls}"><label for="{fid}">{label}</label><div class="inp">'
            f'<input id="{fid}" type="number" inputmode="decimal" step="any" value="{value}"{attrs}>{u}{live}</div></div>')

def faq(block):
    qa = re.findall(r'Q:\s*(.+?)\nA:\s*(.+?)(?=\nQ:|\Z)', block.strip(), re.S)
    h = '<section class="faq"><h2>Common questions</h2>' + ''.join(
        f'<details><summary>{q.strip()}</summary><p>{a.strip()}</p></details>' for q, a in qa) + '</section>'
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": re.sub('<[^>]+>', '', q.strip()),
         "acceptedAnswer": {"@type": "Answer", "text": re.sub('<[^>]+>', '', a.strip())}} for q, a in qa]}
    return h, ld

def aside(path):
    items = ''.join(f'<li><a href="{p}"><strong>{name}</strong><span>{d}</span></a></li>' for p, _, name, d in TOOLS if p != path)
    return f'<aside class="aside reveal"><h2>Other calculators</h2><ul class="linklist">{items}</ul></aside>'

def render(raw):
    head, body = raw.split('\n---\n', 1)
    meta = dict(l.split(': ', 1) for l in head.strip().splitlines())
    path = meta['path']
    lds = []
    def faq_sub(m):
        h, ld = faq(m.group(1)); lds.append(ld); return h
    body = re.sub(r'@faq\n(.*?)\n@end', faq_sub, body, flags=re.S)
    body = re.sub(r'\{\{f (.+?)\}\}', field, body)
    body = body.replace('{{aside}}', aside(path))
    body = body.replace('{{pairlinks}}', ''.join(plink(c[1], f[0]) for f in PFIATS[:4] for c in PCOINS[:6]))
    body = body.replace('{{toollist}}', ''.join(
        f'<li><a href="{p}"><strong>{name}</strong><span>{d}</span></a></li>' for p, _, name, d in TOOLS))
    if meta.get('kind') == 'tool':
        lds.append({"@context": "https://schema.org", "@type": "WebApplication", "name": meta['title'].split(' | ')[0],
                    "url": SITE + path, "applicationCategory": "FinanceApplication", "operatingSystem": "Any",
                    "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "description": meta['desc']})
    elif path == '/':
        lds.append({"@context": "https://schema.org", "@type": "WebSite", "name": "CryptoCalc", "url": SITE + '/', "description": meta['desc']})
    ld = ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in lds)
    nav = ''.join(f'<a href="{p}">{short}</a>' for p, short, _, _ in TOOLS)
    robots = '<meta name="robots" content="noindex">\n' if meta.get('noindex') else ''
    t, d = html.escape(meta['title'], quote=True), html.escape(meta['desc'], quote=True)
    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t}</title>
<meta name="description" content="{d}">
{robots}<link rel="canonical" href="{SITE}{path}">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:type" content="website">
<meta property="og:url" content="{SITE}{path}">
<meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FFE04A">
<link rel="icon" href="{FAVICON}">
<script>(function(){{try{{var t=localStorage.getItem('cc_theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}}catch(e){{}}}})()</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css?v=5">
{ld}</head>
<body>
<header class="nav"><div class="nav-in">
<a class="logo" href="/" aria-label="CryptoCalc home"><i></i><span>CryptoCalc</span></a>
<nav class="nav-links" aria-label="Calculators">{nav}</nav>
<button class="theme-btn" id="themeBtn" type="button" aria-label="Switch between light and dark"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg></button>
</div></header>
<div class="ticker" id="ticker" aria-label="Live coin prices"></div>
{body.strip()}
<footer><div class="foot">
<div><a class="logo" href="/"><i></i>CryptoCalc</a><p>Free calculators for crypto traders. Everything runs in your browser and nothing you type is sent anywhere. For information only, not financial advice.</p><p>Price data from <a href="https://www.coingecko.com" rel="noopener">CoinGecko</a>.</p></div>
<div><h2>Calculators</h2><ul>{''.join(f'<li><a href="{p}">{name}</a></li>' for p, _, name, _ in TOOLS)}</ul></div>
<div><h2>Site</h2><ul><li><a href="/about.html">About</a></li><li><a href="/contact.html">Contact</a></li><li><a href="/privacy.html">Privacy</a></li><li><a href="/terms.html">Terms</a></li></ul></div>
</div></footer>
<script src="/js/app.js?v=5"></script>
'''
    m = re.search(r'@script\n(.*)\Z', page, re.S)
    scripts = ''
    if '@script\n' in body:
        pre, js = body.split('@script\n', 1)
        page = page.replace(body.strip(), pre.strip())
        scripts = f'<script>\n{js.strip()}\n</script>\n'
    page += scripts + ''.join(f'<script src="{x}?v=5"></script>\n' for x in meta.get('scripts', '').split()) + '</body>\n</html>\n'
    out = OUT / (path.strip('/') + '/index.html' if path.endswith('/') else path.strip('/'))
    if path == '/': out = OUT / 'index.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page)
    return path, meta

paths = [render(f.read_text()) for f in sorted(SRC.glob('*.html')) if not f.name.startswith('_')]
tpl = (SRC / '_pair.html').read_text()
for cid, sym, name in PCOINS:
    for to, toname, toplural in PFIATS:
        if to == 'USD':
            how = f'For {sym} to USD that price is the answer, so the converter simply multiplies it by your amount.'
            formula = ''
        else:
            how = f'To show a value in {toplural}, the converter takes that dollar price and multiplies it by the live exchange rate between the dollar and the {toname}.'
            formula = f' × {to} per USD'
        local = ''
        if to in ('PKR', 'INR', 'AED'):
            local = (f'<p>Prices on local peer-to-peer markets, where people trade {sym} directly for {toplural} by bank transfer, are set by local supply and demand. '
                     f'They can sit a few percent above or below the rate shown here, which is based on the official {toname} exchange rate.</p>')
        body = (tpl.replace('{SAMECOIN}', ''.join(plink(sym, f[0]) for f in PFIATS if f[0] != to))
                .replace('{SAMEFIAT}', ''.join(plink(c[1], to) for c in PCOINS if c[1] != sym))
                .replace('{HOW}', how).replace('{FORMULA}', formula).replace('{LOCAL}', local)
                .replace('{TOPLURAL}', toplural).replace('{SYM}', sym).replace('{NAME}', name).replace('{TONAME}', toname).replace('{TO}', to).replace('{ID}', cid))
        hdr = (f'title: {sym} to {to} | Live {name} to {toname} converter\n'
               f'desc: Convert {name} ({sym}) to {toplural} ({to}) at the live market rate. Includes a {sym} to {to} table for common amounts and the reverse conversion.\n'
               f'path: {ppath(sym, to)}\nkind: tool\nscripts: /js/converter.js\n---\n')
        paths.append(render(hdr + body))
urls = ''.join(f'<url><loc>{SITE}{p}</loc></url>\n' for p, m in paths if not m.get('noindex'))
(OUT / 'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
(OUT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n')
print('built', len(paths), 'pages')
