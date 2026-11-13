/* CryptoCalc converter (shared by /converter/ and the /convert/x-to-y/ pages) */
(function () {
  var $ = CC.$, f = CC.fmt, F = CC.FIATS, ready = false, lastEdited = 'amount';
  var q = new URLSearchParams(location.search);

  function localFiat() {
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var m = { 'Asia/Karachi': 'PKR', 'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR', 'Asia/Dubai': 'AED', 'Asia/Riyadh': 'SAR', 'Asia/Tokyo': 'JPY', 'Europe/London': 'GBP',
      'Europe/Istanbul': 'TRY', 'Africa/Lagos': 'NGN', 'America/Sao_Paulo': 'BRL', 'Asia/Singapore': 'SGD', 'Europe/Zurich': 'CHF', 'America/Toronto': 'CAD', 'America/Vancouver': 'CAD' };
    if (m[tz]) return m[tz];
    if (tz.indexOf('Australia/') === 0) return 'AUD';
    if (tz.indexOf('Europe/') === 0) return 'EUR';
    return 'USD';
  }
  var CONV = window.CONV || {};
  var want = { from: q.get('from') || CONV.from || 'bitcoin', to: q.get('to') || CONV.to || localFiat() };
  if (q.get('amount') > 0) $('amount').value = q.get('amount');

  function isFiat(k) { return !!F[k]; }
  function code(k) { if (isFiat(k)) return k; var c = CC.coin(k); return c ? c.sym : k; }
  function label(k) { if (isFiat(k)) return F[k]; var c = CC.coin(k); return c ? c.name : k; }
  function usd(k) { if (isFiat(k)) { var r = CC.fx(k); return r ? 1 / r : NaN; } var c = CC.coin(k); return c && c.price != null ? c.price : NaN; }
  function show(n, k) { return isFiat(k) ? f.fiat(n, k) : f.amt(n) + ' ' + code(k); }
  function tidy(x) { return isFinite(x) ? Number(x.toPrecision(8)) : ''; }

  function fill(sel, keep) {
    var coins = CC.coins().map(function (c) { return '<option value="' + c.id + '">' + CC.esc(c.sym) + ' · ' + CC.esc(c.name) + '</option>'; }).join('');
    var fiats = Object.keys(F).map(function (k) { return '<option value="' + k + '">' + k + ' · ' + F[k] + '</option>'; }).join('');
    sel.innerHTML = '<optgroup label="Coins">' + coins + '</optgroup><optgroup label="Currencies">' + fiats + '</optgroup>';
    sel.value = keep; if (!sel.value) sel.selectedIndex = 0;
  }

  function calc() {
    var a = $('from').value, b = $('to').value, ra = usd(a), rb = usd(b);
    if (!ready || !isFinite(ra) || !isFinite(rb)) return;
    var rate = ra / rb;
    if (lastEdited === 'result') { var r = parseFloat($('result').value); $('amount').value = r >= 0 ? tidy(r / rate) : ''; }
    else { var am = parseFloat($('amount').value); $('result').value = am >= 0 ? tidy(am * rate) : ''; }
    var amt = parseFloat($('amount').value);
    $('state').hidden = true; $('out').hidden = false;
    var has = amt > 0;
    $('lead').textContent = has ? show(amt, a) + ' equals' : '1 ' + code(a) + ' equals';
    CC.count($('big'), (has ? amt : 1) * rate, function (v) { return show(v, b); });
    var c = CC.coin(a) || CC.coin(b), ch = c && c.ch24 != null ? ' ' + c.sym + ' is ' + (c.ch24 >= 0 ? 'up ' : 'down ') + Math.abs(c.ch24).toFixed(2) + '% in 24 hours.' : '';
    $('sub').textContent = '1 ' + code(a) + ' = ' + show(rate, b) + '. 1 ' + code(b) + ' = ' + show(1 / rate, a) + '.' + ch;

    var la = isFiat(a) ? [10, 50, 100, 500, 1000, 5000, 10000] : ra > 1000 ? [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5] : ra > 5 ? [0.1, 0.5, 1, 5, 10, 50, 100] : [1, 10, 50, 100, 500, 1000, 10000];
    var lb = isFiat(b) ? [10, 50, 100, 500, 1000, 5000, 10000] : rb > 1000 ? [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5] : rb > 5 ? [0.1, 0.5, 1, 5, 10, 50, 100] : [1, 10, 50, 100, 500, 1000, 10000];
    if ($('refTitle')) $('refTitle').textContent = code(a) + ' and ' + code(b) + ' quick reference';
    $('refA1').textContent = label(a); $('refA2').textContent = label(b); $('refB1').textContent = label(b); $('refB2').textContent = label(a);
    $('refA').innerHTML = la.map(function (x) { return '<tr><td>' + show(x, a) + '</td><td class="r"><b>' + show(x * rate, b) + '</b></td></tr>'; }).join('');
    $('refB').innerHTML = lb.map(function (x) { return '<tr><td>' + show(x, b) + '</td><td class="r"><b>' + show(x / rate, a) + '</b></td></tr>'; }).join('');
    $('quick').innerHTML = la.slice(0, 6).map(function (x) { return '<button type="button" class="chip" data-q="' + x + '">' + f.num(x, 3) + ' ' + code(a) + '</button>'; }).join('');

    var rl = $('rateLine'), cc = CC.coin(a) || CC.coin(b);
    if (rl) rl.textContent = '1 ' + code(a) + ' is worth ' + show(rate, b) + ' right now, and 1 ' + code(b) + ' buys ' + show(1 / rate, a) + '.' + (cc && cc.ch24 != null ? ' Over the past 24 hours ' + cc.name + ' has ' + (cc.ch24 >= 0 ? 'risen ' : 'fallen ') + Math.abs(cc.ch24).toFixed(2) + '% against the US dollar, trading between ' + f.usd(cc.low) + ' and ' + f.usd(cc.high) + '.' : '');
    if (!$('market')) return;
    var fc = isFiat(b) ? b : isFiat(a) ? a : 'USD';
    $('inCode').textContent = ' in ' + fc;
    CC.marketRows($('market'), { stables: true, fiat: fc, onPick: function (id) { $('from').value = id; lastEdited = 'amount'; calc(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  }

  $('amount').addEventListener('input', function () { lastEdited = 'amount'; calc(); });
  $('result').addEventListener('input', function () { lastEdited = 'result'; calc(); });
  $('from').addEventListener('change', function () { lastEdited = 'amount'; calc(); });
  $('to').addEventListener('change', function () { lastEdited = 'amount'; calc(); });
  $('swap').addEventListener('click', function () { var a = $('from').value; $('from').value = $('to').value; $('to').value = a; lastEdited = 'amount'; calc(); });
  $('quick').addEventListener('click', function (e) { var b = e.target.closest('[data-q]'); if (!b) return; $('amount').value = b.dataset.q; lastEdited = 'amount'; calc(); });
  $('shareBtn').addEventListener('click', function () { CC.share(['amount', 'from', 'to']); });

  fill($('from'), want.from); fill($('to'), want.to);
  CC.on(function (s) {
    if (!s.loaded) { $('state').textContent = s.error ? 'Live rates are unavailable right now. Please try again in a minute.' : 'Loading live rates…'; return; }
    fill($('from'), $('from').value || want.from); fill($('to'), $('to').value || want.to);
    ready = true; calc();
  });
})();
