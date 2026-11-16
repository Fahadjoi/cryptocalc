/* CoinAbacus shared script: live prices, ticker, theme, formatting, small UI helpers */
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
    ['the-open-network', 'GRAM', 'Gram'], ['sui', 'SUI', 'Sui'], ['polkadot', 'DOT', 'Polkadot'],
    ['litecoin', 'LTC', 'Litecoin'], ['uniswap', 'UNI', 'Uniswap'], ['near', 'NEAR', 'NEAR Protocol'],
    ['arbitrum', 'ARB', 'Arbitrum'], ['polygon-ecosystem-token', 'POL', 'Polygon']
  ];
  var FIATS = {
    USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', PKR: 'Pakistani rupee', INR: 'Indian rupee',
    AED: 'UAE dirham', SAR: 'Saudi riyal', JPY: 'Japanese yen', CAD: 'Canadian dollar', AUD: 'Australian dollar',
    CHF: 'Swiss franc', SGD: 'Singapore dollar', TRY: 'Turkish lira', BRL: 'Brazilian real', NGN: 'Nigerian naira',
    IDR: 'Indonesian rupiah', PHP: 'Philippine peso', VND: 'Vietnamese dong', THB: 'Thai baht', MYR: 'Malaysian ringgit',
    KRW: 'South Korean won', CNY: 'Chinese yuan', HKD: 'Hong Kong dollar', TWD: 'Taiwan dollar', BDT: 'Bangladeshi taka',
    LKR: 'Sri Lankan rupee', MXN: 'Mexican peso', ARS: 'Argentine peso', CLP: 'Chilean peso', ZAR: 'South African rand',
    PLN: 'Polish zloty', SEK: 'Swedish krona', NOK: 'Norwegian krone', DKK: 'Danish krone', CZK: 'Czech koruna',
    HUF: 'Hungarian forint', ILS: 'Israeli shekel', NZD: 'New Zealand dollar', UAH: 'Ukrainian hryvnia', RUB: 'Russian rouble'
  };
  // Currencies normally written without decimals
  var ZERO = { JPY: 1, KRW: 1, VND: 1, IDR: 1, CLP: 1, HUF: 1 };
  // Time zone to currency, used once to pick a sensible starting currency
  var TZ = {
    'Asia/Karachi': 'PKR', 'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR', 'Asia/Dubai': 'AED', 'Asia/Riyadh': 'SAR', 'Asia/Tokyo': 'JPY',
    'Europe/London': 'GBP', 'Europe/Istanbul': 'TRY', 'Africa/Lagos': 'NGN', 'America/Sao_Paulo': 'BRL', 'Asia/Singapore': 'SGD',
    'Europe/Zurich': 'CHF', 'America/Toronto': 'CAD', 'America/Vancouver': 'CAD', 'America/Edmonton': 'CAD', 'America/Winnipeg': 'CAD',
    'Asia/Jakarta': 'IDR', 'Asia/Makassar': 'IDR', 'Asia/Manila': 'PHP', 'Asia/Ho_Chi_Minh': 'VND', 'Asia/Saigon': 'VND', 'Asia/Bangkok': 'THB',
    'Asia/Kuala_Lumpur': 'MYR', 'Asia/Seoul': 'KRW', 'Asia/Shanghai': 'CNY', 'Asia/Hong_Kong': 'HKD', 'Asia/Taipei': 'TWD', 'Asia/Dhaka': 'BDT',
    'Asia/Colombo': 'LKR', 'America/Mexico_City': 'MXN', 'America/Argentina/Buenos_Aires': 'ARS', 'America/Buenos_Aires': 'ARS',
    'America/Santiago': 'CLP', 'Africa/Johannesburg': 'ZAR', 'Europe/Warsaw': 'PLN', 'Europe/Stockholm': 'SEK', 'Europe/Oslo': 'NOK',
    'Europe/Copenhagen': 'DKK', 'Europe/Prague': 'CZK', 'Europe/Budapest': 'HUF', 'Asia/Jerusalem': 'ILS', 'Asia/Tel_Aviv': 'ILS',
    'Pacific/Auckland': 'NZD', 'Europe/Kyiv': 'UAH', 'Europe/Kiev': 'UAH', 'Europe/Moscow': 'RUB'
  };
  var EURO = ['Berlin', 'Paris', 'Madrid', 'Rome', 'Amsterdam', 'Brussels', 'Vienna', 'Dublin', 'Lisbon', 'Athens', 'Helsinki', 'Luxembourg', 'Malta', 'Riga', 'Tallinn', 'Vilnius', 'Bratislava', 'Ljubljana', 'Zagreb', 'Nicosia'];

  // Binance spot symbols (against USDT) used for the backup price feed and price history
  var BN = { bitcoin: 'BTC', ethereum: 'ETH', binancecoin: 'BNB', solana: 'SOL', ripple: 'XRP', dogecoin: 'DOGE', cardano: 'ADA', tron: 'TRX', 'avalanche-2': 'AVAX', chainlink: 'LINK',
    'the-open-network': 'GRAM', sui: 'SUI', polkadot: 'DOT', litecoin: 'LTC', uniswap: 'UNI', near: 'NEAR', arbitrum: 'ARB', 'polygon-ecosystem-token': 'POL', 'usd-coin': 'USDC' };
  var BHOST = 'https://data-api.binance.vision/api/v3';
  var lastTry = 0;

  var coins = META.map(function (m) { return { id: m[0], sym: m[1], name: m[2], stable: !!m[3] }; });
  var fx = { USD: 1 };
  var cur = 'USD', wantCur = null, curLock = null;   // cur only becomes wantCur once its exchange rate has loaded
  function detectCur() {
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    if (TZ[tz]) return TZ[tz];
    if (tz.indexOf('Australia/') === 0) return 'AUD';
    if (tz.indexOf('Europe/') === 0 && EURO.indexOf(tz.slice(7)) >= 0) return 'EUR';
    return 'USD';
  }
  function resolveCur() { var w = curLock || wantCur; cur = w && fx[w] ? w : 'USD'; }
  function rate() { return fx[cur] || 1; }
  function px(c) { return c && c.price != null ? c.price * rate() : null; }
  function setCur(code) {
    if (!FIATS[code] || curLock) return;
    wantCur = code; try { localStorage.setItem('cc_ccy', code); } catch (e) {}
    resolveCur(); emit();
  }
  function lockCur(code) { curLock = code; resolveCur(); }
  var state = { ts: 0, live: false, error: false, loaded: false };
  var subs = [];
  var prevPrice = {};
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- Formatting ---------- */
  function digits(a) { return a >= 1 ? 2 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 8; }
  var symMode = {};
  // Currency text. Several currencies share a bare "$", so those keep their longer symbol (CA$, A$, MX$).
  function cfmt(n, code, minD, maxD) {
    try {
      var mode = symMode[code];
      if (!mode) {
        mode = 'narrowSymbol';
        if (code !== 'USD' && new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: mode, maximumFractionDigits: 0 }).format(1).replace(/[\d\s.,]/g, '') === '$') mode = 'symbol';
        symMode[code] = mode;
      }
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: mode, minimumFractionDigits: minD, maximumFractionDigits: maxD }).format(n);
    } catch (e) {
      var t = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: minD, maximumFractionDigits: maxD });
      return (n < 0 ? '-' : '') + (code === 'USD' ? '$' + t : t + ' ' + code);
    }
  }
  function pd(a, code) { if (a >= 100000 || (ZERO[code] && a >= 100)) return [0, 0]; var d = digits(a); return [a >= 1 ? 2 : Math.min(d, 4), d]; }
  function csym(code) { return cfmt(0, code, 0, 0).replace(/[\d.,]/g, '').trim(); }
  var fmt = {
    price: function (n) {
      if (!isFinite(n)) return '–';
      var a = Math.abs(n), d = digits(a);
      return n.toLocaleString('en-US', { minimumFractionDigits: a >= 1 ? 2 : Math.min(d, 4), maximumFractionDigits: d });
    },
    // A price in the visitor's currency (the name is kept from when the site was dollars only)
    usd: function (n) { if (!isFinite(n)) return '–'; var d = pd(Math.abs(n), cur); return cfmt(n, cur, d[0], d[1]); },
    money: function (n, signed) {
      if (!isFinite(n)) return '–';
      var s = n < 0 ? '-' : (signed && n > 0 ? '+' : ''), d = ZERO[cur] || Math.abs(n) >= 100000 ? 0 : 2;
      return s + cfmt(Math.abs(n), cur, d, d);
    },
    sym: function (code) { return csym(code || cur); },
    num: function (n, d) { return isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d }) : '–'; },
    amt: function (n) {
      if (!isFinite(n)) return '–';
      var a = Math.abs(n);
      return n.toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.001 ? 6 : 8 });
    },
    pct: function (n, signed) { return isFinite(n) ? (signed && n > 0 ? '+' : '') + n.toFixed(2) + '%' : '–'; },
    compact: function (n, code) {
      if (!isFinite(n)) return '–';
      var sy = csym(code || cur); if (/[A-Za-z]$/.test(sy)) sy += ' ';
      var u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
      for (var i = 0; i < u.length; i++) if (Math.abs(n) >= u[i][0]) return sy + (n / u[i][0]).toFixed(2) + u[i][1];
      return sy + n.toFixed(0);
    },
    fiat: function (n, code) { if (!isFinite(n)) return '–'; var d = pd(Math.abs(n), code); return cfmt(n, code, d[0], d[1]); },
    date: function (ts) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  };
  // Isolated-margin liquidation estimate for USDT-margined contracts
  function liq(entry, lev, isLong, mmr) {
    mmr = mmr == null ? 0.005 : mmr;
    return Math.max(0, isLong ? entry * (1 - 1 / lev + mmr) : entry * (1 + 1 / lev - mmr));
  }
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
    if (data.fx) { fx = data.fx; fx.USD = 1; }
    resolveCur();
    state.ts = data.ts; state.loaded = true;
  }
  function emit() {
    renderTicker(); renderUpdated(); renderCur();
    document.querySelectorAll('.live-btn').forEach(function (b) { b.disabled = !state.loaded; });
    subs.forEach(function (f) { try { f(state); } catch (e) { console.error(e); } });
  }
  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; } }
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  // Backup: coin prices straight from Binance when the main feed fails. Currency rates come from the last saved set.
  function backup() {
    var syms = Object.keys(BN).map(function (k) { return '"' + BN[k] + 'USDT"'; }).join(',');
    return getJSON(BHOST + '/ticker/24hr?symbols=' + encodeURIComponent('[' + syms + ']')).then(function (list) {
      var by = {}; list.forEach(function (t) { by[t.symbol] = t; });
      var out = [{ id: 'tether', price: 1, ch24: 0 }];
      Object.keys(BN).forEach(function (id) {
        var t = by[BN[id] + 'USDT']; if (!t) return;
        out.push({ id: id, price: parseFloat(t.lastPrice), ch24: parseFloat(t.priceChangePercent), high: parseFloat(t.highPrice), low: parseFloat(t.lowPrice) });
      });
      if (out.length < 5) throw new Error('thin');
      var savedFx = null; try { savedFx = JSON.parse(localStorage.getItem('cc_fx')); } catch (e) {}
      apply({ ts: Date.now(), coins: out, fx: savedFx || undefined });
      state.live = true; state.error = false; state.backup = true;
    });
  }
  function refresh() {
    lastTry = Date.now();
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
      apply(data); state.live = true; state.error = false; state.backup = false;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); localStorage.setItem('cc_fx', JSON.stringify(rates)); } catch (e) {}
      emit();
    }).catch(function () {
      if (!state.loaded) { var c = readCache(); if (c) apply(c); }   // names, icons and the last prices we saw
      return backup().catch(function () { state.live = false; state.error = true; }).then(emit);
    });
  }
  function start() {
    var c = readCache(), age = c ? Date.now() - c.ts : Infinity;
    if (c && age < FRESH_ENOUGH) { apply(c); state.live = age < TTL * 2; emit(); }
    if (age > TTL) refresh();
    var due = function () { return !document.hidden && Date.now() - state.ts > TTL && Date.now() - lastTry > (state.error || state.backup ? TTL * 2 : TTL); };
    setInterval(function () { if (due()) refresh(); }, 15000);
    document.addEventListener('visibilitychange', function () { if (due()) refresh(); });
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
      var txt = fmt.usd(px(c));
      if (pr.textContent && pr.textContent !== txt && prevPrice[c.id] != null && prevPrice[c.id] !== c.price) {
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
  function renderCur() {
    var sel = $('ccySel');
    if (sel) {
      if (sel.options.length < 2) sel.innerHTML = Object.keys(FIATS).map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('');
      sel.value = cur; sel.disabled = !!curLock || !state.loaded;
      sel.title = curLock ? 'This page works in US dollars' : 'Currency: ' + FIATS[cur];
    }
    document.querySelectorAll('[data-cur]').forEach(function (el) { if (el.textContent !== cur) el.textContent = cur; });
  }
  function renderUpdated() {
    document.querySelectorAll('[data-updated]').forEach(function (el) {
      if (!state.loaded) { el.innerHTML = state.error ? '<span class="live-dot off"></span>Live prices unavailable' : 'Loading prices…'; return; }
      var liveNow = !state.error && Date.now() - state.ts < TTL * 3;
      el.innerHTML = '<span class="live-dot' + (liveNow ? '' : ' off') + '"></span>' + (liveNow ? (state.backup ? 'Live, backup feed' : 'Live') : 'Last known prices') + ', updated ' + ago(state.ts);
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
    var code = opt.fiat || cur, rate = fx[code] || 1; if (!fx[code]) code = 'USD';
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
        '<td class="r hide-m">' + fmt.compact(c.mcap * rate, code) + '</td>' +
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
      return '<div class="k-' + r.kind + '" style="--i:' + (animate ? i : 0) + (animate ? '' : ';animation:none') + '"><span class="tag">' + esc(r.label) + '</span><span class="p">' + fmt.usd(r.price) + '</span><span class="d">' + (r.kind === 'entry' ? 'entry' : fmt.pct(d, true)) + '</span></div>';
    }).join('');
  }

  /* Line chart with two series (val solid, inv dashed), hover tooltip. series: [{t, val, inv}] */
  function lineChart(el, series, o) {
    o = o || {};
    var W = Math.max(640, Math.min(1100, el.clientWidth || 640)), H = W > 800 ? 300 : 250, padT = 14, padB = 22, n = series.length;
    var max = 0, min = Infinity; var two = series[0].inv != null;
    series.forEach(function (s) { max = Math.max(max, s.val, two ? s.inv : s.val); min = Math.min(min, s.val, two ? s.inv : s.val); });
    if (o.zoom && max > min) { var pad = (max - min) * 0.12; min = Math.max(0, min - pad); max += pad; } else { min = 0; max = max * 1.08 || 1; }
    var X = function (i) { return n > 1 ? i / (n - 1) * W : 0; }, Y = function (v) { return padT + (1 - (v - min) / (max - min)) * (H - padT - padB); };
    var val = '', inv = '';
    series.forEach(function (s, i) { val += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(s.val).toFixed(1); if (two) inv += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(s.inv).toFixed(1); });
    var grid = '', axis = '';
    for (var g = 0; g <= 3; g++) { var v = o.zoom ? min + (max - min) * g / 3.4 : max / 1.08 * g / 3, y = Y(v).toFixed(1); grid += '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/>'; axis += '<text x="' + (W - 2) + '" y="' + (y - 4) + '" text-anchor="end">' + (o.axisFmt ? o.axisFmt(v) : o.zoom && max < 1e5 ? fmt.usd(Math.round(v)).replace(/\.00$/, '') : fmt.compact(v)) + '</text>'; }
    var mid = Math.floor((n - 1) / 2);
    axis += '<text x="0" y="' + (H - 4) + '">' + (o.startLabel || fmt.date(series[0].t)) + '</text><text x="' + W / 2 + '" y="' + (H - 4) + '" text-anchor="middle">' + fmt.date(series[mid].t) + '</text><text x="' + W + '" y="' + (H - 4) + '" text-anchor="end">' + (o.endLabel || fmt.date(series[n - 1].t)) + '</text>';
    var neg = o.gain === false ? ' neg' : '', st = o.still ? ' style="animation:none;stroke-dashoffset:0"' : '', sa = o.still ? ' style="animation:none;opacity:.1"' : '';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || 'Chart') + '"><g class="grid">' + grid + '</g><g class="axis">' + axis + '</g>' +
      '<path class="a-val' + neg + '"' + sa + ' d="' + val + 'L' + W + ' ' + Y(min) + 'L0 ' + Y(min) + 'Z"/>' + (two ? '<path class="l-inv" d="' + inv + '"/>' : '') + '<path class="l-val' + neg + '" pathLength="1"' + st + ' d="' + val + '"/>' +
      '<g style="display:none"><line class="cross" y1="' + padT + '" y2="' + (H - padB) + '"/><circle class="dot" r="4.5"/><circle class="dot" r="3.5"/></g></svg><div class="chart-tip"></div>';
    var svg = el.firstChild, hov = svg.lastChild, tip = el.lastChild;
    function move(e) {
      var r = svg.getBoundingClientRect(), cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      var i = Math.max(0, Math.min(n - 1, Math.round(cx / r.width * (n - 1)))), s = series[i], x = X(i);
      hov.style.display = ''; var c = hov.children;
      c[0].setAttribute('x1', x); c[0].setAttribute('x2', x);
      c[1].setAttribute('cx', x); c[1].setAttribute('cy', Y(s.val)); c[2].setAttribute('cx', x); c[2].setAttribute('cy', Y(two ? s.inv : s.val));
      var tf = o.tipFmt || fmt.money;
      tip.innerHTML = '<b>' + fmt.date(s.t) + '</b><br>' + (o.valLabel || 'Value') + ' ' + tf(s.val) + (two ? '<br>' + (o.invLabel || 'Put in') + ' ' + tf(s.inv) : '');
      tip.style.left = Math.max(14, Math.min(86, x / W * 100)) + '%'; tip.style.opacity = 1;
    }
    function leave() { hov.style.display = 'none'; tip.style.opacity = 0; }
    svg.addEventListener('mousemove', move); svg.addEventListener('touchstart', move, { passive: true }); svg.addEventListener('touchmove', move, { passive: true });
    svg.addEventListener('mouseleave', leave); svg.addEventListener('touchend', leave);
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
    if (cur !== 'USD') q.set('ccy', cur);
    var url = location.origin + location.pathname + '?' + q.toString();
    var done = function () { toast('Link copied. Anyone who opens it sees these numbers.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); });
    else prompt('Copy this link:', url);
    try { history.replaceState(null, '', url); } catch (e) {}
  }

  /* Result card: draws the headline result as a square image to save or share */
  function shareCard() {
    var res = document.querySelector('.result'), big = res && res.querySelector('.big'), out = res && res.querySelector('#out');
    if (!big || !big.textContent.trim() || (out && out.hidden)) { toast('Fill in the calculator first.'); return; }
    var vEl = res.querySelector('.verdict'), verdict = vEl ? vEl.textContent.trim() : '';
    var tone = vEl && /\bdown\b/.test(vEl.className) ? '#C4362C' : vEl && /\bup\b/.test(vEl.className) ? '#0A7F52' : '#15211C';
    var subEl = res.querySelector('.sub'), sub = subEl ? subEl.textContent.trim() : '';
    var rows = [];
    res.querySelectorAll('dl.rows > div').forEach(function (d) {
      var dt = d.querySelector('dt'), dd = d.querySelector('dd');
      if (!d.hidden && rows.length < 5 && dt && dd && dd.textContent.trim()) rows.push([dt.textContent.trim(), dd.textContent.trim()]);
    });
    var brandEl = document.querySelector('.logo span'), brand = brandEl ? brandEl.textContent : location.hostname;
    var h1 = document.querySelector('h1'), title = h1 ? h1.textContent.trim() : document.title;
    function draw() {
      var W = 1080, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var g = cv.getContext('2d'), F = function (w, px) { g.font = w + ' ' + px + 'px Archivo, system-ui, sans-serif'; };
      var fit = function (text, w, px, max, min) { do { F(w, px); if (g.measureText(text).width <= max) break; px -= 2; } while (px > min); return px; };
      g.fillStyle = '#F1F3EE'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#FFE04A'; g.fillRect(72, 62, 36, 36); g.lineWidth = 6; g.strokeStyle = '#15211C'; g.strokeRect(72, 62, 36, 36);
      g.fillStyle = '#15211C'; g.textBaseline = 'alphabetic'; F(800, 42); g.fillText(brand, 126, 95);
      var top = 150, ch = 496 + rows.length * 68;
      g.fillStyle = '#15211C'; g.fillRect(84, top + 12, 936, ch);
      g.fillStyle = '#FFFFFF'; g.fillRect(72, top, 936, ch); g.lineWidth = 4; g.strokeRect(72, top, 936, ch);
      var x = 124, maxW = 832, y = top + 84;
      g.fillStyle = '#5E6B65'; fit(title, 600, 34, maxW, 22); g.fillText(title, x, y);
      y += 76; g.fillStyle = tone; fit(verdict, 700, 38, maxW, 22); g.fillText(verdict, x, y);
      var bt = big.textContent.trim(), bp = fit(bt, 800, 132, maxW, 48), bw = g.measureText(bt).width;
      y += bp + 34; g.fillStyle = '#FFE04A'; g.fillRect(x - 10, y - bp * 0.34, bw + 20, bp * 0.4);
      g.fillStyle = '#15211C'; g.fillText(bt, x, y);
      y += 64; g.fillStyle = '#5E6B65'; F(500, 30);
      var words = sub.split(' '), line = '', lines = [];
      words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
      if (line) lines.push(line);
      lines.slice(0, 2).forEach(function (l) { g.fillText(l, x, y); y += 40; });
      y = top + 516;
      rows.forEach(function (r) {
        g.strokeStyle = '#D4DAD3'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 44); g.lineTo(x + maxW, y - 44); g.stroke();
        g.fillStyle = '#15211C'; g.textAlign = 'right'; fit(r[1], 700, 28, maxW * 0.56, 18); g.fillText(r[1], x + maxW, y);
        g.textAlign = 'left'; g.fillStyle = '#5E6B65'; fit(r[0], 500, 28, maxW * 0.42, 18); g.fillText(r[0], x, y);
        y += 68;
      });
      g.fillStyle = '#15211C'; F(700, 28); g.fillText(location.host, 72, H - 44);
      g.fillStyle = '#5E6B65'; F(500, 24); g.textAlign = 'right'; g.fillText('An estimate, not financial advice', W - 72, H - 44);
      cv.toBlob(function (blob) {
        if (!blob) { toast('Could not make the image.'); return; }
        var name = (location.pathname.replace(/\//g, '') || 'result') + '.png', file;
        try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: title }).catch(function () {}); return; }
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); toast('Image saved.');
      }, 'image/png');
    }
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(draw, draw);
  }

  /* Wires up a calculator page: URL restore, live autofill, recalculation on every change */
  function page(cfg) {
    var ids = cfg.ids || [], q = new URLSearchParams(location.search), restored = false, filled = false;
    var sel = $('coin');
    fillCoins(sel, cfg.coinOpt);
    // Every money field remembers which currency its number is in (el._cur); sync() converts when that differs from the page currency.
    var qc = (q.get('ccy') || '').toUpperCase(); if (!FIATS[qc]) qc = 'USD';
    var mark = function (k, code) { var el = $(k); if (el && el.hasAttribute('data-money')) { el._cur = code; el._exact = true; } };
    ids.forEach(function (k) { if (q.has(k)) { setVal(k, q.get(k)); mark(k, qc); restored = true; } });
    if (cfg.usdOnly) lockCur('USD'); else if (restored && qc !== 'USD') { wantCur = qc; resolveCur(); }
    var pageCur = restored ? qc : 'USD';
    var keep = cfg.keep || [], kept = {};
    try { kept = JSON.parse(localStorage.getItem('cc_keep')) || {}; } catch (e) {}
    keep.forEach(function (k) { if (!q.has(k) && kept[k] != null && kept[k] !== '') { setVal(k, kept[k]); mark(k, kept._c && FIATS[kept._c[k]] ? kept._c[k] : 'USD'); } });
    function saveKept() { kept._c = kept._c || {}; keep.forEach(function (k) { kept[k] = getVal(k); kept._c[k] = cur; }); try { localStorage.setItem('cc_keep', JSON.stringify(kept)); } catch (e) {} }
    var run = function () { try { cfg.calc(); } catch (e) { console.error(e); } };
    function autofill(force) {
      if (!sel) return; var c = coin(sel.value); if (!c || c.price == null) return;
      document.querySelectorAll('[data-autolive]').forEach(function (el) {
        if (force || (!restored && !el.dataset.touched)) { el.value = round(px(c) * parseFloat(el.dataset.autolive)); el._cur = cur; }
      });
    }
    function sync() {
      if (!state.loaded) return;
      document.querySelectorAll('.inputs input[data-money]').forEach(function (el) {
        var from = el._cur || 'USD'; if (from === cur) return;
        el._cur = cur;
        if (el.dataset.autolive && !restored && !el.dataset.touched) return;   // refilled from the live price below
        var v = parseFloat(el.value); if (!(v > 0) || !fx[from]) return;
        var x = v * rate() / fx[from];
        el.value = el._exact || el.dataset.touched ? round(x) : Number(x.toPrecision(1));
      });
      if (pageCur === cur) return;
      if (cfg.onCur) cfg.onCur(rate() / (fx[pageCur] || 1), cur);
      pageCur = cur;
      chips.forEach(function (f) { f(); });
      if (filled) autofill(false);
      if (keep.length) saveKept();
    }
    document.querySelectorAll('.inputs input, .inputs select').forEach(function (el) {
      var h = function (e) {
        if (el === sel) { autofill(true); if (cfg.onCoin) cfg.onCoin(); }
        else if (e.isTrusted) { el.dataset.touched = 1; if (keep.length) saveKept(); }
        run();
      };
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', h);
    });
    document.querySelectorAll('.live-btn').forEach(function (b) {
      b.disabled = !state.loaded;
      b.addEventListener('click', function () {
        var c = sel && coin(sel.value), el = $(b.dataset.live); if (!c || c.price == null || !el) return;
        el.value = round(el.hasAttribute('data-money') ? px(c) : c.price); el._cur = cur; el.dataset.touched = 1; run();
      });
    });
    var chips = [];
    document.querySelectorAll('[data-set]').forEach(function (b) {
      var p = b.dataset.set.split(':'), el = $(p[0]), isMoney = el && el.hasAttribute('data-money');
      // Money presets are written in dollars and shown as a round figure in the page currency
      var val = function () { return isMoney ? Number((parseFloat(p[1]) * rate()).toPrecision(1)) : p[1]; };
      if (isMoney) chips.push(function () { b.textContent = fmt.money(val()).replace(/\.00$/, ''); });
      b.addEventListener('click', function () { el.value = val(); el._cur = cur; el.dataset.touched = 1; if (keep.length) saveKept(); run(); });
    });
    var sb = $('shareBtn'); if (sb) sb.addEventListener('click', function () { share(ids); });
    if (sb && document.querySelector('.result .big')) {
      var ib = document.createElement('button'); ib.type = 'button'; ib.className = 'btn'; ib.id = 'imgBtn'; ib.textContent = 'Save result as image';
      sb.parentNode.insertBefore(ib, sb.nextSibling); ib.addEventListener('click', shareCard);
    }
    var rb = $('resetBtn'); if (rb) rb.addEventListener('click', function () { keep.forEach(function (k) { delete kept[k]; }); try { localStorage.setItem('cc_keep', JSON.stringify(kept)); } catch (e) {} location.href = location.pathname; });
    on(function () {
      if (state.loaded) { fillCoins(sel, cfg.coinOpt); sync(); if (!filled) { filled = true; autofill(false); } }
      run();
    });
    run();
    return { run: run, autofill: autofill };
  }

  /* ---------- Boot ---------- */
  function boot() {
    var path = location.pathname;
    document.querySelectorAll('.nav-links a').forEach(function (a) { if (path.indexOf(a.getAttribute('href')) === 0) a.setAttribute('aria-current', 'page'); });
    var mb = $('menuBtn'), hd = document.querySelector('.nav');
    if (mb && hd) {
      var setMenu = function (open) { hd.classList.toggle('open', open); mb.setAttribute('aria-expanded', open ? 'true' : 'false'); };
      mb.addEventListener('click', function () { setMenu(!hd.classList.contains('open')); });
      document.addEventListener('click', function (e) { if (!hd.contains(e.target)) setMenu(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
    }
    if (!wantCur) {   // a shared link may already have set the currency for this view
      try { wantCur = localStorage.getItem('cc_ccy'); } catch (e) {}
      if (!FIATS[wantCur]) wantCur = 'USD';   // dollars for everyone until they pick another currency
    }
    var cs = $('ccySel');
    if (cs) cs.addEventListener('change', function () { setCur(cs.value); });
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
    fx: function (code) { return fx[code]; }, FIATS: FIATS, cur: function () { return cur; }, px: px, rate: rate, setCur: setCur, lockCur: lockCur, detectCur: detectCur, state: state, n: n, radio: radio, getVal: getVal, setVal: setVal,
    fillCoins: fillCoins, marketRows: marketRows, ladder: ladder, spark: spark, icon: icon, toast: toast, share: share, shareCard: shareCard, page: page,
    getJSON: getJSON, API: API, lineChart: lineChart, liq: liq, BN: BN, BHOST: BHOST, reduced: reduced
  };
})();
