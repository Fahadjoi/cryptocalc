/* CryptoCalc shared script: live prices, ticker, theme, formatting, small UI helpers */
window.CC = (function () {
  'use strict';

  var API = 'https://api.coingecko.com/api/v3';
  var CACHE_KEY = 'cc_prices_v2';
  var TTL = 60000;            // refresh interval
  var FRESH_ENOUGH = 600000;  // cached prices younger than this may be shown while refreshing

  // id, fallback symbol, fallback name, stablecoin?
  var META = [
    ['bitcoin', 'BTC', 'Bitcoin'], ['ethereum', 'ETH', 'Ethereum'], ['tether', 'USDT', 'Tether', 1],
    ['binancecoin', 'BNB', 'BNB'], ['solana', 'SOL', 'Solana'], ['ripple', 'XRP', 'XRP'],
    ['usd-coin', 'USDC', 'USDC', 1], ['dogecoin', 'DOGE', 'Dogecoin'], ['cardano', 'ADA', 'Cardano'],
    ['tron', 'TRX', 'TRON'], ['avalanche-2', 'AVAX', 'Avalanche'], ['chainlink', 'LINK', 'Chainlink'],
    ['the-open-network', 'TON', 'Toncoin'], ['sui', 'SUI', 'Sui'], ['polkadot', 'DOT', 'Polkadot'],
    ['litecoin', 'LTC', 'Litecoin'], ['uniswap', 'UNI', 'Uniswap'], ['near', 'NEAR', 'NEAR Protocol'],
    ['arbitrum', 'ARB', 'Arbitrum'], ['polygon-ecosystem-token', 'POL', 'Polygon']
  ];
  var FIATS = {
    USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', PKR: 'Pakistani rupee', INR: 'Indian rupee',
    AED: 'UAE dirham', SAR: 'Saudi riyal', JPY: 'Japanese yen', CAD: 'Canadian dollar', AUD: 'Australian dollar',
    CHF: 'Swiss franc', SGD: 'Singapore dollar', TRY: 'Turkish lira', BRL: 'Brazilian real', NGN: 'Nigerian naira'
  };

  var coins = META.map(function (m) { return { id: m[0], sym: m[1], name: m[2], stable: !!m[3] }; });
  var fx = { USD: 1 };
  var state = { ts: 0, live: false, error: false, loaded: false };
  var subs = [];
  var prevPrice = {};
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- Formatting ---------- */
  function digits(a) { return a >= 1 ? 2 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 8; }
  var fmt = {
    price: function (n) {
      if (!isFinite(n)) return '–';
      var a = Math.abs(n), d = digits(a);
      return n.toLocaleString('en-US', { minimumFractionDigits: a >= 1 ? 2 : Math.min(d, 4), maximumFractionDigits: d });
    },
    usd: function (n) { return isFinite(n) ? (n < 0 ? '-$' : '$') + fmt.price(Math.abs(n)) : '–'; },
    money: function (n, signed) {
      if (!isFinite(n)) return '–';
      var s = n < 0 ? '-' : (signed && n > 0 ? '+' : '');
      return s + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    num: function (n, d) { return isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d }) : '–'; },
    amt: function (n) {
      if (!isFinite(n)) return '–';
      var a = Math.abs(n);
      return n.toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.001 ? 6 : 8 });
    },
    pct: function (n, signed) { return isFinite(n) ? (signed && n > 0 ? '+' : '') + n.toFixed(2) + '%' : '–'; },
    compact: function (n) {
      if (!isFinite(n)) return '–';
      var u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
      for (var i = 0; i < u.length; i++) if (Math.abs(n) >= u[i][0]) return '$' + (n / u[i][0]).toFixed(2) + u[i][1];
      return '$' + n.toFixed(0);
    },
    fiat: function (n, code) {
      if (!isFinite(n)) return '–';
      var a = Math.abs(n), d = digits(a);
      try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: a >= 1 ? 2 : Math.min(d, 4), maximumFractionDigits: d }).format(n);
      } catch (e) { return fmt.price(n) + ' ' + code; }
    },
    date: function (ts) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  };
  function round(p) { return Number(Number(p).toPrecision(5)); }

  /* Animated number: counts from the element's previous value to the new one */
  function count(el, to, f, dur) {
    if (!el) return;
    var from = typeof el._v === 'number' ? el._v : 0;
    el._v = to;
    cancelAnimationFrame(el._raf);
    if (reduced || !isFinite(to) || !isFinite(from) || from === to || document.hidden) { el.textContent = f(to); return; }
    var t0 = performance.now(); dur = dur || 480;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur); k = 1 - Math.pow(1 - k, 3);
      el.textContent = f(from + (to - from) * k);
      if (k < 1) el._raf = requestAnimationFrame(step); else el.textContent = f(to);
    })(t0);
  }

  /* ---------- Price feed ---------- */
  function coin(id) { for (var i = 0; i < coins.length; i++) if (coins[i].id === id) return coins[i]; return null; }

  function apply(data) {
    data.coins.forEach(function (d) {
      var c = coin(d.id); if (!c) return;
      if (c.price != null) prevPrice[c.id] = c.price;
      for (var k in d) c[k] = d[k];
    });
    coins.sort(function (a, b) { return (b.mcap || 0) - (a.mcap || 0); });
    fx = data.fx; fx.USD = 1;
    state.ts = data.ts; state.loaded = true;
  }
  function emit() {
    renderTicker(); renderUpdated();
    document.querySelectorAll('.live-btn').forEach(function (b) { b.disabled = !state.loaded; });
    subs.forEach(function (f) { try { f(state); } catch (e) { console.error(e); } });
  }
  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; } }
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  function refresh() {
    var ids = META.map(function (m) { return m[0]; }).join(',');
    return Promise.all([
      getJSON(API + '/coins/markets?vs_currency=usd&ids=' + ids + '&sparkline=true&price_change_percentage=24h,7d'),
      getJSON(API + '/simple/price?ids=bitcoin&vs_currencies=' + Object.keys(FIATS).join(',').toLowerCase())
    ]).then(function (r) {
      var b = r[1].bitcoin, rates = {};
      Object.keys(FIATS).forEach(function (k) { rates[k] = b[k.toLowerCase()] / b.usd; });
      var data = {
        ts: Date.now(), fx: rates,
        coins: r[0].map(function (c) {
          var sp = (c.sparkline_in_7d && c.sparkline_in_7d.price) || [];
          return {
            id: c.id, sym: String(c.symbol).toUpperCase(), name: c.name, img: c.image, price: c.current_price,
            ch24: c.price_change_percentage_24h, ch7: c.price_change_percentage_7d_in_currency,
            mcap: c.market_cap, high: c.high_24h, low: c.low_24h,
            spark: sp.filter(function (_, i) { return i % 4 === 0 || i === sp.length - 1; }).map(function (v) { return Number(v.toPrecision(5)); })
          };
        })
      };
      apply(data); state.live = true; state.error = false;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
      emit();
    }).catch(function () {
      state.live = false; state.error = true;
      if (!state.loaded) { var c = readCache(); if (c) apply(c); }   // fall back to the last prices we saw
      emit();
    });
  }
  function start() {
    var c = readCache(), age = c ? Date.now() - c.ts : Infinity;
    if (c && age < FRESH_ENOUGH) { apply(c); state.live = age < TTL * 2; emit(); }
    if (age > TTL) refresh();
    setInterval(function () { if (!document.hidden && Date.now() - state.ts > TTL) refresh(); }, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - state.ts > TTL) refresh(); });
    setInterval(renderUpdated, 10000);
  }
  function on(f) { subs.push(f); if (state.loaded || state.error) f(state); }

  /* ---------- Ticker ---------- */
  function chCls(n) { return n >= 0 ? 'up' : 'down'; }
  function renderTicker() {
    var el = $('ticker'); if (!el) return;
    if (!state.loaded) {
      el.innerHTML = '<div class="ticker-msg">' + (state.error ? 'Live prices are unavailable right now. The calculators still work with prices you type in.' : 'Loading live prices…') + '</div>';
      return;
    }
    var list = coins.filter(function (c) { return !c.stable && c.price != null; });
    var track = el.querySelector('.ticker-track');
    if (!track || track.children.length !== list.length * 2) {
      var html = list.map(function (c) {
        return '<a class="tick" href="/converter/?from=' + c.id + '" data-id="' + c.id + '"><b>' + esc(c.sym) + '</b><span class="pr"></span><span class="ch"></span></a>';
      }).join('');
      el.innerHTML = '<div class="ticker-track">' + html + html + '</div>';
      track = el.firstChild;
      track.style.animationDuration = (list.length * 4.2) + 's';
    }
    track.querySelectorAll('.tick').forEach(function (t) {
      var c = coin(t.dataset.id), pr = t.querySelector('.pr'), ch = t.querySelector('.ch');
      var txt = '$' + fmt.price(c.price);
      if (pr.textContent && pr.textContent !== txt && prevPrice[c.id] != null) {
        t.classList.remove('flash-up', 'flash-down'); void t.offsetWidth;
        t.classList.add(c.price >= prevPrice[c.id] ? 'flash-up' : 'flash-down');
      }
      pr.textContent = txt;
      ch.textContent = fmt.pct(c.ch24, true); ch.className = 'ch ' + chCls(c.ch24);
    });
  }
  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    return s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago';
  }
  function renderUpdated() {
    document.querySelectorAll('[data-updated]').forEach(function (el) {
      if (!state.loaded) { el.innerHTML = state.error ? '<span class="live-dot off"></span>Live prices unavailable' : 'Loading prices…'; return; }
      var liveNow = !state.error && Date.now() - state.ts < TTL * 3;
      el.innerHTML = '<span class="live-dot' + (liveNow ? '' : ' off') + '"></span>' + (liveNow ? 'Live' : 'Last known prices') + ', updated ' + ago(state.ts);
    });
  }

  /* ---------- Small UI builders ---------- */
  function spark(arr) {
    if (!arr || arr.length < 2) return '';
    var min = Math.min.apply(null, arr), max = Math.max.apply(null, arr), r = max - min || 1, w = 96, h = 30;
    var d = arr.map(function (v, i) { return (i ? 'L' : 'M') + (i / (arr.length - 1) * w).toFixed(1) + ' ' + (h - 3 - (v - min) / r * (h - 6)).toFixed(1); }).join('');
    return '<svg class="spark ' + (arr[arr.length - 1] >= arr[0] ? 'up' : 'down') + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path pathLength="1" d="' + d + '"/></svg>';
  }
  function icon(c) {
    return c.img ? '<img src="' + esc(c.img) + '" alt="" width="24" height="24" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="coin-ico">' + esc(c.sym.slice(0, 3)) + '</span>';
  }
  function fillCoins(sel, opt) {
    if (!sel) return;
    opt = opt || {};
    var keep = sel.value || sel.dataset.want || opt.value || 'bitcoin';
    sel.innerHTML = coins.filter(function (c) { return opt.stables !== false || !c.stable; })
      .map(function (c) { return '<option value="' + c.id + '">' + esc(c.sym) + (opt.short ? '' : ' · ' + esc(c.name)) + '</option>'; }).join('');
    sel.value = keep; if (!sel.value) sel.selectedIndex = 0;
  }
  function marketRows(tbody, opt) {
    if (!tbody) return;
    opt = opt || {};
    var code = opt.fiat || 'USD', rate = fx[code] || 1;
    var list = coins.filter(function (c) { return c.price != null && (opt.stables || !c.stable); }).slice(0, opt.limit || 99);
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">' + (state.error ? 'Live prices are unavailable right now. Try again in a minute.' : 'Loading prices…') + '</td></tr>';
      return;
    }
    var first = !tbody.dataset.done; tbody.dataset.done = 1;
    tbody.innerHTML = list.map(function (c, i) {
      var fl = !first && prevPrice[c.id] != null && prevPrice[c.id] !== c.price ? (c.price > prevPrice[c.id] ? ' flash-up' : ' flash-down') : '';
      return '<tr class="click" data-id="' + c.id + '" tabindex="0"><td class="hide-s">' + (i + 1) + '</td>' +
        '<td><span class="coin-cell">' + icon(c) + '<span><b>' + esc(c.name) + '</b> <small>' + esc(c.sym) + '</small></span></span></td>' +
        '<td class="r' + fl + '"><b>' + fmt.fiat(c.price * rate, code) + '</b></td>' +
        '<td class="r ' + chCls(c.ch24) + '">' + fmt.pct(c.ch24, true) + '</td>' +
        '<td class="r hide-s ' + chCls(c.ch7) + '">' + fmt.pct(c.ch7, true) + '</td>' +
        '<td class="r hide-m">' + fmt.compact(c.mcap) + '</td>' +
        '<td class="hide-s">' + spark(c.spark) + '</td></tr>';
    }).join('');
    if (!first) tbody.querySelectorAll('.spark path').forEach(function (p) { p.style.animation = 'none'; p.style.strokeDashoffset = 0; });
    if (!tbody._bound) {
      tbody._bound = 1;
      var go = function (e) {
        var tr = e.target.closest('tr[data-id]'); if (!tr) return;
        if (e.type === 'keydown' && e.key !== 'Enter') return;
        if (opt.onPick) opt.onPick(tr.dataset.id); else location.href = '/converter/?from=' + tr.dataset.id;
      };
      tbody.addEventListener('click', go); tbody.addEventListener('keydown', go);
    }
  }
  /* Price ladder: rows sorted high to low with distance from entry */
  function ladder(el, rows, entry) {
    if (!el) return;
    rows = rows.filter(function (r) { return isFinite(r.price) && r.price > 0; }).sort(function (a, b) { return b.price - a.price; });
    var sig = rows.map(function (r) { return r.label; }).join('|');
    var animate = el.dataset.sig !== sig; el.dataset.sig = sig;
    el.innerHTML = rows.map(function (r, i) {
      var d = (r.price - entry) / entry * 100;
      return '<div class="k-' + r.kind + '" style="--i:' + (animate ? i : 0) + (animate ? '' : ';animation:none') + '"><span class="tag">' + esc(r.label) + '</span><span class="p">$' + fmt.price(r.price) + '</span><span class="d">' + (r.kind === 'entry' ? 'entry' : fmt.pct(d, true)) + '</span></div>';
    }).join('');
  }
  var toastT;
  function toast(msg) {
    var t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- Form helpers ---------- */
  function n(id) { var el = $(id); return el ? parseFloat(el.value) : NaN; }
  function radio(name) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : null; }
  function getVal(k) {
    var el = $(k); if (el) return el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
    return radio(k);
  }
  function setVal(k, v) {
    var el = $(k);
    if (el) { if (el.type === 'checkbox') el.checked = v === '1'; else if (el.tagName === 'SELECT') { el.dataset.want = v; el.value = v; } else el.value = v; return; }
    var r = document.querySelector('input[name="' + k + '"][value="' + String(v).replace(/"/g, '') + '"]'); if (r) r.checked = true;
  }
  function share(ids) {
    var q = new URLSearchParams();
    ids.forEach(function (k) { var v = getVal(k); if (v != null && v !== '') q.set(k, v); });
    var url = location.origin + location.pathname + '?' + q.toString();
    var done = function () { toast('Link copied. Anyone who opens it sees these numbers.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); });
    else prompt('Copy this link:', url);
    try { history.replaceState(null, '', url); } catch (e) {}
  }

  /* Wires up a calculator page: URL restore, live autofill, recalculation on every change */
  function page(cfg) {
    var ids = cfg.ids || [], q = new URLSearchParams(location.search), restored = false, filled = false;
    var sel = $('coin');
    fillCoins(sel, cfg.coinOpt);
    ids.forEach(function (k) { if (q.has(k)) { setVal(k, q.get(k)); restored = true; } });
    var run = function () { try { cfg.calc(); } catch (e) { console.error(e); } };
    function autofill(force) {
      if (!sel) return; var c = coin(sel.value); if (!c || c.price == null) return;
      document.querySelectorAll('[data-autolive]').forEach(function (el) {
        if (force || (!restored && !el.dataset.touched)) el.value = round(c.price * parseFloat(el.dataset.autolive));
      });
    }
    document.querySelectorAll('.inputs input, .inputs select').forEach(function (el) {
      var h = function (e) {
        if (el === sel) { autofill(true); if (cfg.onCoin) cfg.onCoin(); }
        else if (e.isTrusted) el.dataset.touched = 1;
        run();
      };
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', h);
    });
    document.querySelectorAll('.live-btn').forEach(function (b) {
      b.disabled = !state.loaded;
      b.addEventListener('click', function () {
        var c = sel && coin(sel.value), el = $(b.dataset.live); if (!c || c.price == null || !el) return;
        el.value = round(c.price); el.dataset.touched = 1; run();
      });
    });
    document.querySelectorAll('[data-set]').forEach(function (b) {
      b.addEventListener('click', function () { var p = b.dataset.set.split(':'), el = $(p[0]); el.value = p[1]; el.dataset.touched = 1; run(); });
    });
    var sb = $('shareBtn'); if (sb) sb.addEventListener('click', function () { share(ids); });
    var rb = $('resetBtn'); if (rb) rb.addEventListener('click', function () { location.href = location.pathname; });
    on(function () {
      if (state.loaded) { fillCoins(sel, cfg.coinOpt); if (!filled) { filled = true; autofill(false); } }
      run();
    });
    run();
    return { run: run };
  }

  /* ---------- Boot ---------- */
  function boot() {
    var path = location.pathname;
    document.querySelectorAll('.nav-links a').forEach(function (a) { if (path.indexOf(a.getAttribute('href')) === 0) a.setAttribute('aria-current', 'page'); });
    var tb = $('themeBtn');
    if (tb) tb.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('cc_theme', next); } catch (e) {}
    });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
      document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    } else document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    renderTicker(); renderUpdated();
    start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  return {
    $: $, esc: esc, fmt: fmt, round: round, count: count, on: on, coin: coin, coins: function () { return coins; },
    fx: function (code) { return fx[code]; }, FIATS: FIATS, state: state, n: n, radio: radio, getVal: getVal, setVal: setVal,
    fillCoins: fillCoins, marketRows: marketRows, ladder: ladder, spark: spark, icon: icon, toast: toast, share: share, page: page,
    getJSON: getJSON, API: API, reduced: reduced
  };
})();
