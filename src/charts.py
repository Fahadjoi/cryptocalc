"""Small static SVG line charts for the guides. Used as {{chart:name}} in a guide body."""
import math

def _nice(hi):
    if hi <= 0: return 1
    e = 10 ** math.floor(math.log10(hi)); f = hi / e
    return (1 if f <= 1 else 2 if f <= 2 else 2.5 if f <= 2.5 else 5 if f <= 5 else 10) * e

def line_chart(title, caption, xs, series, xlab, ylab, yfmt=lambda v: f'{v:g}', xfmt=lambda v: f'{v:g}', ymax=None, xticks=None, yticks=5):
    W, H, L, R, T, B = 640, 340, 64, 20, 18, 52
    pw, ph = W - L - R, H - T - B
    x0, x1 = min(xs), max(xs)
    top = ymax or _nice(max(max(s[1]) for s in series))
    X = lambda v: L + (v - x0) / (x1 - x0) * pw
    Y = lambda v: T + ph - min(v, top) / top * ph
    g = []
    for i in range(yticks + 1):
        v = top * i / yticks; y = Y(v)
        g.append(f'<line x1="{L}" x2="{W - R}" y1="{y:.1f}" y2="{y:.1f}" class="cg"/><text x="{L - 8}" y="{y + 4:.1f}" text-anchor="end">{yfmt(v)}</text>')
    for v in (xticks or [x0 + (x1 - x0) * i / 5 for i in range(6)]):
        g.append(f'<text x="{X(v):.1f}" y="{T + ph + 20}" text-anchor="middle">{xfmt(v)}</text>')
    lines, legend = [], []
    for k, (name, ys) in enumerate(series):
        pts = ' '.join(f'{X(x):.1f},{Y(y):.1f}' for x, y in zip(xs, ys))
        lines.append(f'<polyline points="{pts}" class="cl c{k}"/>')
        if len(series) > 1:
            legend.append(f'<span><i class="c{k}"></i>{name}</span>')
    svg = (f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{title}">'
           + ''.join(g) + f'<line x1="{L}" x2="{W - R}" y1="{T + ph}" y2="{T + ph}" class="ca"/>' + ''.join(lines)
           + f'<text x="{L + pw / 2}" y="{H - 8}" text-anchor="middle" class="cx">{xlab}</text>'
           + f'<text x="14" y="{T + ph / 2}" text-anchor="middle" class="cx" transform="rotate(-90 14 {T + ph / 2})">{ylab}</text></svg>')
    leg = f'<div class="legend">{"".join(legend)}</div>' if legend else ''
    return f'<figure class="chart"><figcaption><b>{title}</b></figcaption>{leg}{svg}<p class="fine">{caption}</p></figure>'

pct = lambda v: f'{v:g}%'

def _loss():
    xs = list(range(0, 91, 5))
    return line_chart('Gain needed to recover from a loss', 'Gain needed = loss ÷ (1 − loss). The curve bends upward fast past a 50% loss.',
                      xs, [('Gain needed', [x / (100 - x) * 100 for x in xs])], 'Loss (%)', 'Gain needed (%)', pct, pct, ymax=1000, xticks=[0, 15, 30, 45, 60, 75, 90])

def _leverage():
    xs = list(range(2, 101))
    return line_chart('How far price can move against you before liquidation', 'Approximate move to liquidation = 1 ÷ leverage − maintenance margin (0.5% here). Exchanges differ slightly.',
                      xs, [('Distance', [max(100 / x - 0.5, 0) for x in xs])], 'Leverage (×)', 'Price move to liquidation (%)', pct, lambda v: f'{v:g}×', ymax=50, xticks=[2, 20, 40, 60, 80, 100])

def _rr():
    xs = [x / 10 for x in range(5, 51)]
    return line_chart('Win rate needed to break even at each risk/reward ratio', 'Break-even win rate = 1 ÷ (1 + reward/risk), before fees.',
                      xs, [('Win rate', [100 / (1 + x) for x in xs])], 'Reward ÷ risk', 'Break-even win rate (%)', pct, lambda v: f'1:{v:g}', ymax=70, xticks=[0.5, 1, 2, 3, 4, 5], yticks=7)

def _apy():
    xs = [m / 12 for m in range(0, 61)]
    return line_chart('$1,000 at 10% APR: restaked vs withdrawn', 'Restaking monthly turns 10% APR into about 10.47% APY. After 5 years: $1,645 restaked vs $1,500 withdrawn.',
                      xs, [('Rewards restaked monthly', [1000 * (1 + 0.1 / 12) ** (x * 12) for x in xs]), ('Rewards withdrawn', [1000 + 100 * x for x in xs])],
                      'Years', 'Value ($)', lambda v: f'${v:,.0f}', ymax=1800, xticks=[0, 1, 2, 3, 4, 5], yticks=6)

def _ruin():
    xs = list(range(0, 21))
    return line_chart('What a losing streak does to an account', 'Each loss takes the stated % of what is left: balance = (1 − risk)^losses.',
                      xs, [(f'{r}% risk per trade', [100 * (1 - r / 100) ** x for x in xs]) for r in (1, 2, 5, 10)],
                      'Losses in a row', 'Account left (%)', pct, xticks=[0, 5, 10, 15, 20], ymax=100)

def _funding():
    xs = list(range(0, 366, 5))
    return line_chart('Funding paid on a position held for a year', 'Three funding payments a day. Paid on the position size, not your margin.',
                      xs, [(f'{r}% every 8h', [r * 3 * x for x in xs]) for r in (0.01, 0.03, 0.05)],
                      'Days held', 'Funding paid (% of position)', pct, xticks=[0, 60, 120, 180, 240, 300, 365], ymax=60, yticks=6)

def _supply():
    # Issued BTC by year: 50 BTC/block halving every 210,000 blocks, ~52,560 blocks a year.
    xs, ys, total, reward, blocks = [], [], 0.0, 50.0, 0
    for year in range(2009, 2041):
        for _ in range(52560):
            total += reward; blocks += 1
            if blocks % 210000 == 0: reward /= 2
        xs.append(year); ys.append(total / 1e6)
    return line_chart('Bitcoin in circulation over time', 'Approximate, at one block every ten minutes. The total approaches 21 million and stops around 2140.',
                      xs, [('Supply', ys)], 'Year', 'Million BTC', lambda v: f'{v:g}M', xticks=[2009, 2016, 2024, 2032, 2040], ymax=21, yticks=7)

CHARTS = {'loss': _loss, 'leverage': _leverage, 'rr': _rr, 'apy': _apy, 'ruin': _ruin, 'funding': _funding, 'supply': _supply}
