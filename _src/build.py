#!/usr/bin/env python3
"""Builds the static site pages from fragments in pages/ into the repo."""
import re, json, html, sys, pathlib
SRC = pathlib.Path(__file__).parent / 'pages'
OUT = pathlib.Path(sys.argv[1])
# ---------- Launch settings: everything that changes when the domain is bought ----------
SITE = 'https://coinabacus.com'   # the address visitors use, without a trailing slash
BRAND = 'CoinAbacus'                               # site name shown in the header, footer, titles and share images
GA_ID = 'G-500GG6QE6W'                                         # Google Analytics 4 measurement ID, e.g. G-XXXXXXXXXX. Empty = no analytics
ADSENSE_ID = 'ca-pub-1958806552639352'                                    # AdSense publisher ID, e.g. pub-1234567890123456. Empty = no adverts
UPDATED = '14 November 2026'                       # date shown on the privacy page
# -----------------------------------------------------------------------------------------
TOOLS = [
    ('/profit-calculator/', 'Profit', 'Profit / loss', 'What a trade makes or loses once fees are taken out'),
    ('/position-size-calculator/', 'Position', 'Position size', 'How much to buy for the risk and stop-loss you set'),
    ('/liquidation-calculator/', 'Liquidation', 'Liquidation price', 'Where a leveraged position gets closed by the exchange'),
    ('/average-cost-calculator/', 'Average', 'Average cost', 'Your average entry across several buys, and how to lower it'),
    ('/fee-calculator/', 'Fees', 'Exchange fees', 'What the same order costs on ten exchanges'),
    ('/dca-calculator/', 'DCA', 'DCA backtest', 'What regular buys over the past five years are worth today'),
    ('/staking-calculator/', 'Staking', 'Staking rewards', 'What staking adds up to with compounding'),
    ('/converter/', 'Converter', 'Converter', 'Live rates between 20 coins and 40 currencies'),
    ('/portfolio/', 'Portfolio', 'Portfolio tracker', 'Your holdings valued at live prices, saved in your browser'),
]
def _ico(d): return f'<svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>'
ICONS = {
    '/profit-calculator/': _ico('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    '/position-size-calculator/': _ico('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>'),
    '/liquidation-calculator/': _ico('<path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4.5"/><path d="M12 17.2v.1"/>'),
    '/average-cost-calculator/': _ico('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
    '/fee-calculator/': _ico('<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/>'),
    '/dca-calculator/': _ico('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>'),
    '/staking-calculator/': _ico('<path d="M12 21V11"/><path d="M12 11c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 15c0-3-2-5-6-5 0 3 2 5 6 5z"/>'),
    '/converter/': _ico('<path d="M4 8h15"/><path d="M15 4l4 4-4 4"/><path d="M20 16H5"/><path d="M9 12l-4 4 4 4"/>'),
    '/portfolio/': _ico('<path d="M11 4a8.5 8.5 0 1 0 9 9h-9z"/><path d="M15 3.6A8.5 8.5 0 0 1 20.4 9H15z"/>'),
}
CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
PCOINS = [('bitcoin', 'BTC', 'Bitcoin'), ('ethereum', 'ETH', 'Ethereum'), ('tether', 'USDT', 'Tether'), ('binancecoin', 'BNB', 'BNB'), ('solana', 'SOL', 'Solana'),
          ('ripple', 'XRP', 'XRP'), ('dogecoin', 'DOGE', 'Dogecoin'), ('cardano', 'ADA', 'Cardano'), ('tron', 'TRX', 'TRON'), ('litecoin', 'LTC', 'Litecoin')]
PFIATS = [('USD', 'US dollar', 'US dollars'), ('EUR', 'euro', 'euros'), ('GBP', 'British pound', 'British pounds'), ('INR', 'Indian rupee', 'Indian rupees'),
          ('PKR', 'Pakistani rupee', 'Pakistani rupees'), ('AED', 'UAE dirham', 'UAE dirhams'), ('SAR', 'Saudi riyal', 'Saudi riyals'), ('TRY', 'Turkish lira', 'Turkish lira'),
          ('NGN', 'Nigerian naira', 'Nigerian naira'), ('BRL', 'Brazilian real', 'Brazilian reais'), ('IDR', 'Indonesian rupiah', 'Indonesian rupiah'), ('PHP', 'Philippine peso', 'Philippine pesos'),
          ('MXN', 'Mexican peso', 'Mexican pesos'), ('CAD', 'Canadian dollar', 'Canadian dollars'), ('AUD', 'Australian dollar', 'Australian dollars'), ('JPY', 'Japanese yen', 'Japanese yen')]
P2P_FIATS = {'INR', 'PKR', 'AED', 'SAR', 'TRY', 'NGN', 'BRL', 'IDR', 'PHP', 'MXN'}   # currencies with busy peer-to-peer markets
GUIDES = []   # filled from pages/guides before anything is rendered
def ppath(sym, to): return f'/convert/{sym.lower()}-to-{to.lower()}/'
def plink(sym, to): return f'<a href="{ppath(sym, to)}">{sym} to {to}</a>'

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
    if unit == 'USD' and 'fixed' not in opts.split():   # a money field that follows the visitor's currency
        attrs += ' data-money'
        u = '<span class="unit" data-cur>USD</span>'
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

def guide_items(gs):
    return ''.join(f'<li><a href="{g["path"]}"><strong>{g["h1"]}</strong><span>{g["lede"]}</span></a></li>' for g in gs)

def aside(path):
    items = ''.join(f'<li><a href="{p}"><strong>{name}</strong><span>{d}</span></a></li>' for p, _, name, d in TOOLS if p != path)
    related = [g for g in GUIDES if g.get('tool') == path and g['path'] != path]
    if path.startswith('/guides/'):   # on a guide: other guides first, then the calculators
        more = [g for g in GUIDES if g['path'] != path][:5]
        return (f'<aside class="aside reveal"><h2>More guides</h2><ul class="linklist">{guide_items(more)}</ul>'
                f'<h2 style="margin-top:32px">Calculators</h2><ul class="linklist">{items}</ul></aside>')
    extra = f'<h2 style="margin-top:32px">Guides for this calculator</h2><ul class="linklist">{guide_items(related)}</ul>' if related else ''
    return f'<aside class="aside reveal"><h2>Other calculators</h2><ul class="linklist">{items}</ul>{extra}</aside>'

def ad_policy():
    if not GA_ID and not ADSENSE_ID:
        return ('<p>The site does not currently run adverts or visitor analytics. If that changes, this page will be updated before they are switched on, '
                'and any consent required in your country will be asked for.</p>')
    out = ''
    if GA_ID:
        out += ('<p><strong>Analytics.</strong> The site uses Google Analytics to count visits and see which calculators are used. Google sets cookies and receives your IP address, '
                'the pages you open and basic device details. It does not receive the numbers you type into a calculator.</p>')
    if ADSENSE_ID:
        out += ('<p><strong>Advertising.</strong> Adverts are served by Google AdSense. Google and its partners use cookies to show adverts based on your visits to this and other sites. '
                'You can turn off personalised advertising in <a href="https://adssettings.google.com" rel="noopener">Google Ads Settings</a>, and read how Google uses this data at '
                '<a href="https://policies.google.com/technologies/partner-sites" rel="noopener">policies.google.com/technologies/partner-sites</a>. '
                'Where the law requires consent, you are asked before these cookies are set.</p>')
    return out

def parse(raw):
    head, body = raw.replace('CryptoCalc', BRAND).split('\n---\n', 1)
    return dict(l.split(': ', 1) for l in head.strip().splitlines()), body

def render(raw):
    meta, body = parse(raw)
    path = meta['path']
    lds = []
    if meta.get('kind') == 'guide':
        tool = next((t for t in TOOLS if t[0] == meta.get('tool')), None)
        cta = f'<p class="cta"><a class="btn solid" href="{tool[0]}">Open the {tool[2].lower()} calculator</a></p>' if tool else ''
        if tool and tool[0] in ('/converter/', '/portfolio/'): cta = f'<p class="cta"><a class="btn solid" href="{tool[0]}">Open the {tool[2].lower()}</a></p>'
        body = (f'<main class="wrap">\n<header class="tool-head"><p class="crumb rise"><a href="/guides/">Guides</a></p><h1 class="rise">{meta["h1"]}</h1>'
                f'<p class="rise" style="--d:1">{meta["lede"]}</p></header>\n<div class="guide" style="margin-top:8px">\n<article class="prose rise" style="--d:2">\n'
                f'{body.strip()}\n{cta}\n<p class="fine">Updated {meta["date"]}. For information only, not financial advice.</p>\n</article>\n{{{{aside}}}}\n</div>\n</main>')
        iso = meta['iso']
        lds.append({"@context": "https://schema.org", "@type": "Article", "headline": meta['h1'], "description": meta['desc'], "datePublished": iso, "dateModified": iso,
                    "author": {"@type": "Organization", "name": BRAND, "url": SITE + '/'}, "publisher": {"@type": "Organization", "name": BRAND, "url": SITE + '/'},
                    "mainEntityOfPage": SITE + path, "image": SITE + '/og.png'})
        lds.append({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Guides", "item": SITE + '/guides/'}, {"@type": "ListItem", "position": 2, "name": meta['h1'], "item": SITE + path}]})
    def faq_sub(m):
        h, ld = faq(m.group(1)); lds.append(ld); return h
    body = re.sub(r'@faq\n(.*?)\n@end', faq_sub, body, flags=re.S)
    body = re.sub(r'\{\{f (.+?)\}\}', field, body)
    body = body.replace('{{aside}}', aside(path))
    body = body.replace('{{pairlinks}}', ''.join(plink(c[1], f[0]) for f in PFIATS[:4] for c in PCOINS[:6]))
    body = body.replace('{{guidelist}}', guide_items(GUIDES[:6])).replace('{{allguides}}', guide_items(GUIDES)).replace('{{adpolicy}}', ad_policy())
    body = body.replace('{{toollist}}', ''.join(
        f'<li><a class="tool" href="{p}"><i class="tico">{ICONS[p]}</i><span class="ttxt"><strong>{name}</strong><span>{d}</span></span>{CHEV}</a></li>' for p, _, name, d in TOOLS))
    if meta.get('kind') == 'tool':
        lds.append({"@context": "https://schema.org", "@type": "WebApplication", "name": meta['title'].split(' | ')[0],
                    "url": SITE + path, "applicationCategory": "FinanceApplication", "operatingSystem": "Any",
                    "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "description": meta['desc']})
    elif path == '/':
        lds.append({"@context": "https://schema.org", "@type": "WebSite", "name": BRAND, "url": SITE + '/', "description": meta['desc']})
    ld = ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in lds)
    nav = ''.join(f'<a href="{p}">{short}</a>' for p, short, _, _ in TOOLS) + '<a href="/guides/">Guides</a>'
    track = ''
    if GA_ID:
        track += (f'<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>\n'
                  f"<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','{GA_ID}');</script>\n")
    if ADSENSE_ID:
        track += f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={ADSENSE_ID}" crossorigin="anonymous"></script>\n'
    ogtype = 'article' if meta.get('kind') == 'guide' else 'website'
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
<meta property="og:type" content="{ogtype}">
<meta property="og:site_name" content="{BRAND}">
<meta property="og:url" content="{SITE}{path}">
<meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FFE04A">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<script>(function(){{try{{var t=localStorage.getItem('cc_theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}}catch(e){{}}document.documentElement.classList.add('js');setTimeout(function(){{if(!window.CC)document.documentElement.classList.remove('js')}},3000)}})()</script>
<link rel="preload" href="/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://api.coingecko.com" crossorigin>
<link rel="stylesheet" href="/css/style.css?v=17">
{track}{ld}</head>
<body>
<header class="nav"><div class="nav-in">
<a class="logo" href="/" aria-label="{BRAND} home"><i></i><span>{BRAND}</span></a>
<nav class="nav-links" id="navLinks" aria-label="Calculators">{nav}</nav>
<select class="ccy" id="ccySel" aria-label="Currency" disabled><option>USD</option></select>
<button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="navLinks">Tools</button>
<button class="theme-btn" id="themeBtn" type="button" aria-label="Switch between light and dark"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg></button>
</div></header>
<div class="ticker" id="ticker" aria-label="Live coin prices"></div>
{body.strip()}
<footer><div class="foot">
<div><a class="logo" href="/"><i></i>{BRAND}</a><p>Free calculators for crypto traders. Everything runs in your browser and nothing you type is sent anywhere. For information only, not financial advice.</p><p>Price data from <a href="https://www.coingecko.com" rel="noopener">CoinGecko</a>.</p></div>
<div><h2>Calculators</h2><ul>{''.join(f'<li><a href="{p}">{name}</a></li>' for p, _, name, _ in TOOLS)}</ul></div>
<div><h2>Site</h2><ul><li><a href="/guides/">Guides</a></li><li><a href="/about.html">About</a></li><li><a href="/contact.html">Contact</a></li><li><a href="/privacy.html">Privacy</a></li><li><a href="/terms.html">Terms</a></li></ul></div>
</div></footer>
<script src="/js/app.js?v=17"></script>
'''
    m = re.search(r'@script\n(.*)\Z', page, re.S)
    scripts = ''
    if '@script\n' in body:
        pre, js = body.split('@script\n', 1)
        page = page.replace(body.strip(), pre.strip())
        scripts = f'<script>\n{js.strip()}\n</script>\n'
    page += scripts + ''.join(f'<script src="{x}?v=17"></script>\n' for x in meta.get('scripts', '').split()) + '</body>\n</html>\n'
    out = OUT / (path.strip('/') + '/index.html' if path.endswith('/') else path.strip('/'))
    if path == '/': out = OUT / 'index.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page)
    return path, meta

guide_raw = [f.read_text() for f in sorted((SRC / 'guides').glob('*.html'))]
GUIDES.extend(sorted((parse(r)[0] for r in guide_raw), key=lambda m: int(m.get('order', 99))))
paths = [render(f.read_text()) for f in sorted(SRC.glob('*.html')) if not f.name.startswith('_')]
paths += [render(r) for r in guide_raw]
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
        if to in P2P_FIATS:
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
# Icons, web app manifest and ads.txt
svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='4' y='4' width='24' height='24' fill='#FFE04A' stroke='#15211C' stroke-width='4'/></svg>"
(OUT / 'favicon.svg').write_text(svg)
try:
    from PIL import Image, ImageDraw
    for name, size in (('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)):
        im = Image.new('RGB', (size, size), '#F1F3EE'); d = ImageDraw.Draw(im); m = size * 0.2; w = max(4, round(size * 0.09))
        d.rectangle([m, m, size - m, size - m], fill='#FFE04A', outline='#15211C', width=w); im.save(OUT / name)
except ImportError:
    print('Pillow missing: PNG icons not rebuilt')
(OUT / 'site.webmanifest').write_text(json.dumps({
    "name": BRAND, "short_name": BRAND, "description": "Free crypto calculators with live prices", "start_url": "/", "display": "standalone",
    "background_color": "#F1F3EE", "theme_color": "#FFE04A",
    "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}]}, indent=1))
ads = OUT / 'ads.txt'
if ADSENSE_ID: ads.write_text(f'google.com, {ADSENSE_ID}, DIRECT, f08c47fec0942fa0\n')
elif ads.exists(): ads.unlink()
if '--og' in sys.argv:   # redraw the social preview image (needs Chrome); run after changing BRAND
    import subprocess, tempfile, shutil
    chrome = shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    page = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: Archivo; font-weight: 100 900; font-stretch: 62% 125%; src: url(file://{OUT.resolve()}/fonts/archivo-latin.woff2); }}
* {{ margin: 0; box-sizing: border-box; }} body {{ width: 1200px; height: 630px; background: #F1F3EE; color: #15211C; font-family: Archivo, sans-serif; padding: 64px 72px; display: grid; grid-template-columns: 1fr 400px; gap: 56px; align-items: center; }}
.logo {{ display: flex; align-items: center; gap: 14px; font-size: 34px; font-weight: 800; font-stretch: 118%; position: absolute; top: 56px; left: 72px; }}
.logo i {{ width: 26px; height: 26px; background: #FFE04A; border: 4px solid #15211C; }}
h1 {{ font-size: 68px; line-height: 1.02; font-weight: 800; font-stretch: 112%; letter-spacing: -0.02em; margin-top: 40px; }}
p {{ font-size: 27px; color: #5E6B65; margin-top: 22px; line-height: 1.35; }}
.card {{ background: #fff; border: 3px solid #15211C; box-shadow: 10px 10px 0 #15211C; padding: 30px 32px; }}
.card small {{ font-size: 22px; font-weight: 700; color: #0A7F52; display: block; }}
.card b {{ font-size: 70px; font-weight: 800; display: inline-block; margin-top: 6px; background: linear-gradient(transparent 58%, #FFE04A 58%, #FFE04A 94%, transparent 94%); padding: 0 6px; margin-left: -6px; }}
.row {{ display: flex; justify-content: space-between; font-size: 21px; color: #5E6B65; border-top: 1px solid #D4DAD3; padding: 13px 0; }} .row:first-of-type {{ margin-top: 22px; }} .row span + span {{ color: #15211C; font-weight: 700; }}
</style></head><body><div class="logo"><i></i>{BRAND}</div>
<div><h1>Work out the trade before you place it.</h1><p>Free crypto calculators with live prices, in your own currency. Fees counted on both sides.</p></div>
<div class="card"><small>Net profit</small><b>+$97.90</b><div class="row"><span>Return</span><span>+9.79%</span></div><div class="row"><span>Fees, both trades</span><span>$2.10</span></div><div class="row"><span>Break-even</span><span>$60,120</span></div></div>
</body></html>'''
    if chrome:
        with tempfile.TemporaryDirectory() as td:
            f = pathlib.Path(td) / 'og.html'; f.write_text(page)
            subprocess.run([chrome, '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1200,630',
                            '--virtual-time-budget=3000', f'--screenshot={OUT.resolve()}/og.png', f'file://{f}'], check=False, capture_output=True)
        print('og.png redrawn')
    else: print('Chrome not found: og.png left as it was')
print('built', len(paths), 'pages')
