// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', confidence: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The category multiple comes from DATA.comps, the calibration main.ts computed from the snapshot's
  // own live-token protocols; breadth follows the row's chain count.
  function catMultipleOf(category, model, comps) {
    var key = category || 'Other';
    for (var i = 0; i < comps.rows.length; i++) if (comps.rows[i].category === key) return comps.rows[i].multiple;
    return Math.min(model.multiple_cap, Math.max(model.multiple_floor, comps.global_median));
  }
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = Math.round((1 + model.breadth_step * Math.max(0, Math.min((row.chains ? row.chains.length : 1) - 1, 5))) * 10000) / 10000;
    return Math.max(1, Math.round(row.tvl_usd * catMultipleOf(row.category, model, DATA.comps) * breadth * growthMult * maturity));
  }

  // The sensitivity band, recomputed in the page from the same figures: the low case cuts the
  // category multiple by a quarter and halves a positive growth (or deepens a negative one), the
  // high case does the opposite. Breadth and maturity stay as the model states them, so the band
  // isolates the two market-driven inputs.
  function bandOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthLow = growth >= 0 ? growth * 0.5 : growth * 1.5;
    var growthHigh = growth >= 0 ? growth * 1.5 : growth * 0.5;
    growthLow = Math.min(model.growth_cap, Math.max(model.growth_floor, growthLow));
    growthHigh = Math.min(model.growth_cap, Math.max(model.growth_floor, growthHigh));
    var mult = catMultipleOf(row.category, model, DATA.comps);
    var multLow = Math.min(model.multiple_cap, Math.max(model.multiple_floor, mult * 0.75));
    var multHigh = Math.min(model.multiple_cap, Math.max(model.multiple_floor, mult * 1.25));
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = Math.round((1 + model.breadth_step * Math.max(0, Math.min((row.chains ? row.chains.length : 1) - 1, 5))) * 10000) / 10000;
    var low = Math.max(1, Math.round(row.tvl_usd * multLow * breadth * (1 + (growthLow / 100) * model.growth_weight) * maturity));
    var high = Math.max(1, Math.round(row.tvl_usd * multHigh * breadth * (1 + (growthHigh / 100) * model.growth_weight) * maturity));
    return {
      low: low, high: high, growth: growth,
      multLow: multLow, multHigh: multHigh,
      growthLow: growthLow, growthHigh: growthHigh,
      growthMultLow: Math.round((1 + (growthLow / 100) * model.growth_weight) * 10000) / 10000,
      growthMultHigh: Math.round((1 + (growthHigh / 100) * model.growth_weight) * 10000) / 10000
    };
  }
  function confidenceLabel(conf) {
    if (conf === null || conf === undefined || !isFinite(conf)) return 'n/a';
    if (conf >= 0.8) return 'High';
    if (conf >= 0.6) return 'Medium';
    return 'Low';
  }
  function rangeText(r) {
    if (r.implied_low_usd === undefined || r.implied_high_usd === undefined) return 'n/a';
    return fmtUsd(r.implied_low_usd) + '–' + fmtUsd(r.implied_high_usd);
  }
  function scenarioRow(label, multiple, growthPct, growthMult, implied) {
    var multText = (multiple === undefined || multiple === null || !isFinite(multiple)) ? 'n/a' : multiple.toFixed(4);
    var growthText = fmtPct(growthPct) + ' (×' + ((growthMult === undefined || growthMult === null || !isFinite(growthMult)) ? 'n/a' : growthMult.toFixed(2)) + ')';
    return el('tr', null,
      el('td', { text: label }),
      el('td', { class: 'num', text: multText }),
      el('td', { class: 'num', text: growthText }),
      el('td', { class: 'num', text: fmtUsd(implied) })
    );
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyActionFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Each week, adjust the supply or borrow once on ' + name + ', so the position shows fresh activity.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Each week, swap once through " + name + "'s pool or add a little liquidity, so the position shows fresh activity.";
    if (c.indexOf('bridge') >= 0) return 'Each week, bridge a small amount through ' + name + ' and use it in its app, so the position shows fresh activity.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Each week, check the stake through ' + name + ' and claim or restake any rewards it shows, so the position shows fresh activity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Each week, open or close one small hedge on ' + name + ', so the position shows fresh activity.';
    if (c.indexOf('prediction') >= 0) return 'Each week, place one small market position on ' + name + ', so the position shows fresh activity.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Each week, check the ' + name + " vault's allocation and top it up a little, so the position shows fresh activity.";
    if (c.indexOf('stable') >= 0) return 'Each week, mint, redeem or move a little of the stable asset through ' + name + ', so the position shows fresh activity.';
    if (c.indexOf('rwa') >= 0) return 'Each week, check the yield asset\'s accrual on ' + name + ' and add a little, so the position shows fresh activity.';
    if (c.indexOf('insurance') >= 0) return 'Each week, check the ' + name + ' policy and renew or top it up if it asks, so the position shows fresh activity.';
    return 'Each week, make one qualifying action on ' + name + ', such as a deposit, a borrow, a swap or a vote.';
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('confidence')) state.confidence = params.get('confidence');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.confidence !== 'all') params.set('confidence', state.confidence);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.confidence !== 'all' && confidenceLabel(r.confidence).toLowerCase() !== state.confidence) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'range') { av = a.implied_low_usd || 0; bv = b.implied_low_usd || 0; }
      else if (key === 'width') { av = (a.implied_high_usd || 0) - (a.implied_low_usd || 0); bv = (b.implied_high_usd || 0) - (b.implied_low_usd || 0); }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function modelStrip() {
    var m = DATA.model;
    var comps = DATA.comps;
    var liveComps = 0;
    comps.rows.forEach(function (c) { liveComps += c.n; });
    return el('div', { class: 'model-strip' },
      el('b', { text: 'Model ' + DATA.model_version + ': ' }),
      el('span', { text: 'implied = TVL × category multiple × breadth × growth × maturity. ' }),
      el('span', { text: 'The multiple is the median market-cap/TVL of the category\u2019s live-token protocols, shrunk to the global median ' + comps.global_median.toFixed(4) + ' (' + comps.rows.length + ' categories, ' + liveComps + ' live-token protocols). No name is special-cased.' }),
      el('span', { text: ' The median sensitivity band is ' + (DATA.median_width_pct === undefined ? 'n/a' : DATA.median_width_pct.toFixed(1) + '%') + ' wide.' })
    );
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'High-confidence rows' }), el('b', { text: DATA.sensitivity_summary ? String(DATA.sensitivity_summary.high) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var conf = el('select', { id: 'confidence', 'aria-label': 'Filter by confidence' },
      el('option', { value: 'all', text: 'Any confidence' }),
      ['high', 'medium', 'low'].map(function (c) { return el('option', { value: c, text: c.charAt(0).toUpperCase() + c.slice(1) + ' confidence', selected: c === state.confidence ? 'selected' : null }); })
    );
    conf.addEventListener('change', function () { state.confidence = conf.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'confidence', text: 'Confidence' }), conf),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('div', { class: 'range' },
          el('span', { class: 'num', text: rangeText(r) }),
          el('span', { class: 'sub', text: confidenceLabel(r.confidence) + ' confidence' })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('range', 'Range'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var comps = DATA.comps;
    var rows = comps.rows.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: c.median.toFixed(4) }),
        el('td', { class: 'num', text: c.multiple.toFixed(4) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x breadth x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is the market\'s own pricing, read from this same snapshot: the median market-cap-to-TVL ratio of the live-token protocols in the category, shrunk halfway toward the global median (' + comps.global_median.toFixed(4) + ') and clamped to ' + m.multiple_floor + '–' + m.multiple_cap + '. A category with fewer than ' + m.comps_min_n + ' live comps takes the global median. Breadth is 1 + ' + m.breadth_step + ' per extra chain, at most ' + m.breadth_max + '. TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown. Implied value is a model, not a price, and no token here is guaranteed to launch.' }),
      el('p', { class: 'sub', text: 'Every row also carries a sensitivity band: the low case cuts the category multiple by a quarter and halves a positive seven-day growth (or deepens a negative one); the high case lifts the multiple by a quarter and does the opposite with growth. Breadth and maturity stay as the model states them, so the band isolates the two market-driven inputs. Confidence follows the calibration behind the row: more live comps in the category and more chains under the protocol mean a tighter, better-supported estimate. The board shows each row\u2019s range, and the detail view shows where its rank would land in the low and high cases.' }),
      el('h3', { text: 'Comps: what the market pays per dollar of TVL' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'comps' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Live comps' }),
            el('th', { scope: 'col', text: 'Median mcap / TVL' }),
            el('th', { scope: 'col', text: 'Multiple used' })
          )),
          el('tbody', null, rows)
        )
      ),
      el('p', { class: 'sub', text: 'Read from the snapshot at run time, never typed in: change the snapshot and the multiples move with it.' }),
      el('h3', { text: 'Sensitivity by category: which shapes the market has priced' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'comps' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Rows' }),
            el('th', { scope: 'col', text: 'Median band width' }),
            el('th', { scope: 'col', text: 'Median confidence' })
          )),
          el('tbody', null, (DATA.sensitivity_by_category || []).map(function (c) {
            return el('tr', null,
              el('td', { text: c.category }),
              el('td', { class: 'num', text: String(c.rows) }),
              el('td', { class: 'num', text: c.median_width_pct.toFixed(1) + '%' }),
              el('td', { class: 'num', text: confidenceLabel(c.median_confidence) + ' (' + c.median_confidence.toFixed(2) + ')' })
            );
          }))
        )
      ),
      el('p', { class: 'sub', text: 'A category with a wide median band and low median confidence is one the market has not priced yet; a narrow, confident category is one whose shape the market already knows.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: String(row.category_multiple) })),
        el('div', null, el('span', { text: 'Chain breadth' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    var band = bandOf(row, DATA.model);
    var bandMatches = row.implied_low_usd !== undefined && row.implied_high_usd !== undefined && band.low === row.implied_low_usd && band.high === row.implied_high_usd;
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Sensitivity: how much the estimate can move' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Low case' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) })),
        el('div', null, el('span', { text: 'High case' }), el('b', { class: 'num', text: fmtUsd(row.implied_high_usd) })),
        el('div', null, el('span', { text: 'Confidence' }), el('b', { class: 'num', text: confidenceLabel(row.confidence) + (row.confidence !== undefined ? ' (' + row.confidence.toFixed(2) + ')' : '') })),
        el('div', null, el('span', { text: 'Rank in the low case' }), el('b', { class: 'num', text: row.rank_low === undefined ? 'n/a' : String(row.rank_low) })),
        el('div', null, el('span', { text: 'Rank in the high case' }), el('b', { class: 'num', text: row.rank_high === undefined ? 'n/a' : String(row.rank_high) }))
      ),
      el('p', { class: 'sub', text: 'The low case cuts the category multiple by a quarter and halves a positive growth (or deepens a negative one); the high case does the opposite. The page recomputes this band as ' + fmtUsd(band.low) + '–' + fmtUsd(band.high) + (bandMatches ? ', the same range data.js carries.' : ', which differs from the board: the data would be stale.') + ' A rank that barely moves between the two cases is a rank the band barely threatens.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'scenarios' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Scenario' }),
            el('th', { scope: 'col', text: 'Multiple' }),
            el('th', { scope: 'col', text: 'Growth' }),
            el('th', { scope: 'col', text: 'Implied value' })
          )),
          el('tbody', null,
            scenarioRow('Low', band.multLow, band.growthLow, band.growthMultLow, row.implied_low_usd),
            scenarioRow('Base', row.category_multiple, band.growth, row.growth_multiplier, row.implied_value_usd),
            scenarioRow('High', band.multHigh, band.growthHigh, band.growthMultHigh, row.implied_high_usd)
          )
        )
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(modelStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
