/* =========================================================================
   Safdar & Sons Pharmacy + Mart — signage runtime
   Static, no dependencies, no build step. Runs forever with no interaction.
   ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------ Constants ----------------------------- */
  var PER_PAGE     = 6;      // one row of six, as in the reference board
  var FADE_MS      = 400;    // must match .layer transition in style.css
  var TICKER_SPEED = 6;      // rem per second — resolution independent

  var DEFAULTS = {
    storeName:      'Safdar & Sons',
    pharmacyLabel:  'PHARMACY',
    martLabel:      '+ MART',
    tagline:        'Your Health\nOur Priority',
    address:        '',
    phone:          '',
    promoLines:     [],
    secondsPerPage: 8,
    currency:       'Rs.',
    refreshMinutes: 15,
    reloadHours:    12,

    headerPanel:  { line1: 'Better Care', line2: 'Brighter Lives' },
    trustBadges: [
      { icon: 'shield', line1: 'Genuine',   line2: 'Products'   },
      { icon: 'family', line1: 'Healthy',   line2: 'Families'   },
      { icon: 'cart',   line1: 'Everyday',  line2: 'Essentials' },
      { icon: 'heart',  line1: 'A Healthier', line2: 'Tomorrow' }
    ],

    heroTitleTop:    'EVERYDAY',
    heroTitleBottom: 'ESSENTIALS',
    heroSubline:     'Quality Products | Great Prices | Healthier You',
    heroScript:      'More Than a Pharmacy\nA Part of Your Family',
    heroBadge:       { line1: 'SHOP HEALTHY', line2: 'LIVE BETTER' },
    heroImage:       'images/hero.png',

    dealsTitle:      "TODAY'S DEALS",
    dealsScript:     'Same Care. Better Savings.',
    offersValidTill: '',
    dealsNote:       'While Stocks Last',

    categories: [
      { icon: 'capsule', label: 'Medicines'          },
      { icon: 'bottle',  label: 'Personal Care'      },
      { icon: 'baby',    label: 'Baby Care'          },
      { icon: 'pulse',   label: 'Health & Wellness'  },
      { icon: 'grocery', label: 'Grocery & Household'},
      { icon: 'jar',     label: 'Nutrition'          },
      { icon: 'lotus',   label: 'Beauty'             }
    ],
    categoryPanel: { line1: 'Good Health', line2: 'Brighter Days' },

    footerTag:  'Trusted Products. Happier Lives.',
    footerNote: 'Follow Us for More Offers'
  };

  /* Icon name → sprite symbol id */
  var ICONS = {
    shield: 'i-shield', family: 'i-family', cart: 'i-cart', heart: 'i-heart',
    capsule: 'i-capsule', bottle: 'i-bottle', baby: 'i-baby', pulse: 'i-heart-pulse',
    grocery: 'i-cart-plus', jar: 'i-jar', lotus: 'i-lotus', leaf: 'i-leaf', sun: 'i-sun'
  };

  /* Deterministic soft tints for the missing-image placeholder blocks.
     Kept light so the product name stays readable and the card still reads
     like the white product cards in the reference board. */
  var PH_COLORS = [
    '#D7EADB', '#DDEBCB', '#CFE8DF', '#E4EDC6',
    '#D4E9E9', '#E0EACE', '#CCE6D5', '#E8E9C6'
  ];

  /* ------------------------------ Elements ------------------------------ */
  var $ = function (id) { return document.getElementById(id); };

  var rows     = [$('row-a'), $('row-b')];
  var layers   = [rows[0].parentNode, rows[1].parentNode];
  var elStatus = $('status');
  var elDebug  = $('debug');

  /* ------------------------------- State -------------------------------- */
  var settings    = merge({}, DEFAULTS);
  var products    = [];
  var pages       = [];
  var pageIndex   = 0;
  var front       = 0;
  var flipTimer   = null;
  var nextFlipAt  = 0;
  var pendingData = null;
  var dataStamp   = '';
  var lastError   = '';
  var usingApi    = false;

  var DEBUG = /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);

  /* ------------------------------ Utilities ----------------------------- */
  function merge(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) { continue; }
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) {
          target[k] = src[k];
        }
      }
    }
    return target;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function money(value) {
    if (isNum(value)) { return value.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
    return value == null ? '' : String(value);
  }

  function hashColor(text) {
    var h = 0;
    for (var i = 0; i < text.length; i++) { h = (h * 31 + text.charCodeAt(i)) >>> 0; }
    return PH_COLORS[h % PH_COLORS.length];
  }

  function rootPx() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  function iconHTML(name, cls) {
    var id = ICONS[name] || ICONS.leaf;
    return '<svg class="' + (cls || '') + '"><use href="#' + id + '"/></svg>';
  }

  /* Two lines from a string that may contain a newline or a " / " */
  function twoLines(text) {
    var parts = String(text || '').split(/\n|\s\/\s/);
    return [parts[0] || '', parts.slice(1).join(' ') || ''];
  }

  function setText(id, value) {
    var el = $(id);
    if (el) { el.textContent = value == null ? '' : String(value); }
  }

  /* Cache-busted fetch so redeployed prices are picked up on the TV. */
  function loadJSON(path) {
    var url = path + (path.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) { throw new Error(path + ' → HTTP ' + res.status); }
      return res.json();
    });
  }

  /* Live data comes from the API once a database is attached. Without one —
     previewing locally with `npx serve .`, or before the backend is set up —
     fall back to the bundled JSON file so the board still runs. */
  function loadData(apiPath, filePath) {
    return loadJSON(apiPath)
      .then(function (data) {
        if (data && data.fallback) { throw new Error('api asked for fallback'); }
        usingApi = true;
        return data;
      })
      .catch(function () {
        usingApi = false;
        return loadJSON(filePath);
      });
  }

  /* ------------------------------ Rendering ----------------------------- */
  function placeholderHTML(name) {
    return '<div class="ph" style="--ph-color:' + hashColor(name) + '">' +
             '<span class="ph-text">' + esc(name) + '</span>' +
           '</div>';
  }

  function swapToPlaceholder(img) {
    if (!img.parentNode) { return; }
    img.insertAdjacentHTML('afterend', placeholderHTML(img.getAttribute('data-name') || ''));
    img.remove();
  }

  function attachImageFallbacks(scope) {
    var imgs = scope.querySelectorAll('img[data-name]');
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        img.addEventListener('error', function () { swapToPlaceholder(img); });
        /* an already-failed (cached 404) image never fires 'error' again */
        if (img.complete && img.naturalWidth === 0) { swapToPlaceholder(img); }
      })(imgs[i]);
    }
  }

  /* "Panadol 500mg Tablets" + "20s"  →  "<b>Panadol</b> 500mg Tablets (20s)" */
  function nameHTML(product) {
    var name = product && product.name ? String(product.name) : 'Product';
    var cut = name.indexOf(' ');
    var html = cut === -1
      ? '<b>' + esc(name) + '</b>'
      : '<b>' + esc(name.slice(0, cut)) + '</b> ' + esc(name.slice(cut + 1));
    if (product && product.size) { html += ' (' + esc(product.size) + ')'; }
    return html;
  }

  function cardHTML(product) {
    var name  = product && product.name ? String(product.name) : 'Product';
    var cur   = (product && product.currency) || settings.currency || 'Rs.';
    var image = product && product.image ? String(product.image) : '';

    /* red badge — only when discountPercent is present, as specified */
    var badge = '';
    var pct = product ? product.discountPercent : null;
    if (isNum(pct) && pct > 0) {
      badge = '<div class="badge">' +
                '<span class="badge-num">' + Math.round(pct) + '%</span>' +
                '<span class="badge-off">OFF</span>' +
              '</div>';
    }

    var media = image
      ? '<img src="' + esc(image) + '" alt="" data-name="' + esc(name) + '">'
      : placeholderHTML(name);

    var oldPrice = '';
    if (product && product.oldPrice != null && product.oldPrice !== '') {
      oldPrice = cur + ' ' + money(product.oldPrice);
    }

    return '<article class="card">' +
             badge +
             '<div class="card-media">' + media + '</div>' +
             '<p class="card-name">' + nameHTML(product) + '</p>' +
             '<p class="card-old">' + esc(oldPrice) + '</p>' +
             '<div class="card-price">' +
               '<span class="price-cur">' + esc(cur) + '</span>' +
               '<span class="price-new">' + money(product ? product.newPrice : '') + '</span>' +
             '</div>' +
           '</article>';
  }

  function renderPage(row, index) {
    var items = pages[index] || [];
    var html = '', i;
    for (i = 0; i < items.length; i++) { html += cardHTML(items[i]); }
    for (i = items.length; i < PER_PAGE; i++) { html += '<div class="card is-empty"></div>'; }
    row.innerHTML = html;
    attachImageFallbacks(row);
  }

  function updatePager() {
    setText('page-current', pages.length ? (pageIndex + 1) : 0);
    setText('page-total', pages.length);
  }

  /* Light up the category tile the current page's products belong to */
  function updateCategory() {
    var tiles = $('cats').children;
    var items = pages[pageIndex] || [];
    var tally = {}, best = null, bestN = 0, i;

    for (i = 0; i < items.length; i++) {
      var c = items[i] && items[i].category;
      if (!c) { continue; }
      c = String(c).toLowerCase();
      tally[c] = (tally[c] || 0) + 1;
      if (tally[c] > bestN) { bestN = tally[c]; best = c; }
    }
    for (i = 0; i < tiles.length; i++) {
      var label = (tiles[i].getAttribute('data-cat') || '').toLowerCase();
      tiles[i].classList.toggle('is-active', best !== null && label === best);
    }
  }

  /* ------------------------------- Rotation ----------------------------- */
  function flip() {
    if (pendingData) { applyPending(); return; }
    if (pages.length < 2) { schedule(); return; }

    pageIndex = (pageIndex + 1) % pages.length;

    var back = 1 - front;
    layers[back].classList.add('is-on');     // both transition = true crossfade
    layers[front].classList.remove('is-on');
    front = back;

    updatePager();
    updateCategory();

    /* build the following page once the fade is done, so its images are
       already decoded by the time that page is shown */
    window.setTimeout(function () {
      renderPage(rows[1 - front], (pageIndex + 1) % pages.length);
    }, FADE_MS + 60);

    schedule();
  }

  function schedule() {
    window.clearTimeout(flipTimer);
    var secs = isNum(settings.secondsPerPage) && settings.secondsPerPage > 0
      ? settings.secondsPerPage : DEFAULTS.secondsPerPage;
    nextFlipAt = Date.now() + secs * 1000;
    flipTimer = window.setTimeout(flip, secs * 1000);
  }

  /* --------------------------- Data application ------------------------- */
  function paginate(list) {
    var out = [];
    for (var i = 0; i < list.length; i += PER_PAGE) { out.push(list.slice(i, i + PER_PAGE)); }
    return out;
  }

  function applyData(nextSettings, nextProducts) {
    settings = merge({}, DEFAULTS, nextSettings || {});
    products = Array.isArray(nextProducts) ? nextProducts.filter(Boolean) : [];
    pages = paginate(products);

    paintChrome();
    buildTicker();

    if (!pages.length) {
      showStatus('No products', 'products.json loaded but contains no items.');
      return;
    }
    hideStatus();

    if (pageIndex >= pages.length) { pageIndex = 0; }

    renderPage(rows[front], pageIndex);
    renderPage(rows[1 - front], (pageIndex + 1) % pages.length);
    layers[front].classList.add('is-on');
    layers[1 - front].classList.remove('is-on');

    updatePager();
    updateCategory();
    schedule();
  }

  function applyPending() {
    var data = pendingData;
    pendingData = null;
    applyData(data.settings, data.products);
  }

  /* ------------------------- Static chrome painting --------------------- */
  function paintChrome() {
    var s = settings;

    document.title = s.storeName + ' ' + s.pharmacyLabel + ' ' + s.martLabel + " — Today's Deals";

    /* header lockup — "&" picks up the lighter brand green */
    $('store-name').innerHTML = esc(s.storeName).replace(/&amp;/g, '<span class="amp">&amp;</span>');
    setText('pill-a', s.pharmacyLabel);
    setText('pill-b', s.martLabel);

    var tag = twoLines(s.tagline);
    setText('tagline-1', tag[0]);
    setText('tagline-2', tag[1]);

    /* trust badges */
    var badges = Array.isArray(s.trustBadges) ? s.trustBadges : DEFAULTS.trustBadges;
    var html = '', i;
    for (i = 0; i < badges.length; i++) {
      html += '<li>' + iconHTML(badges[i].icon) +
              '<span>' + esc(badges[i].line1) + '<br>' + esc(badges[i].line2) + '</span></li>';
    }
    $('trust').innerHTML = html;

    setText('hp-1', (s.headerPanel || {}).line1);
    setText('hp-2', (s.headerPanel || {}).line2);

    /* hero */
    setText('hero-t1', s.heroTitleTop);
    setText('hero-t2', s.heroTitleBottom);
    $('hero-sub').innerHTML = esc(s.heroSubline).replace(/\s*\|\s*/g, '<i>|</i>');

    var hs = twoLines(s.heroScript);
    setText('hero-script-1', hs[0]);
    setText('hero-script-2', hs[1]);
    setText('hb-1', (s.heroBadge || {}).line1);
    setText('hb-2', (s.heroBadge || {}).line2);
    paintHeroArt(s.heroImage);

    /* deals bar */
    setText('deals-title', s.dealsTitle);
    setText('deals-script', s.dealsScript);
    var valid = $('deals-valid');
    if (s.offersValidTill) {
      valid.innerHTML = 'Offers Valid Till <b>' + esc(s.offersValidTill) + '</b>';
      valid.style.display = '';
      $('deals-bar').style.display = '';
    } else {
      valid.style.display = 'none';
      $('deals-bar').style.display = 'none';
    }
    setText('deals-note', s.dealsNote);

    /* category strip */
    var cats = Array.isArray(s.categories) ? s.categories : DEFAULTS.categories;
    html = '';
    for (i = 0; i < cats.length; i++) {
      html += '<li data-cat="' + esc(String(cats[i].label).toLowerCase()) + '">' +
              iconHTML(cats[i].icon) + '<span>' + esc(cats[i].label) + '</span></li>';
    }
    $('cats').innerHTML = html;
    setText('cp-1', (s.categoryPanel || {}).line1);
    setText('cp-2', (s.categoryPanel || {}).line2);

    /* footer */
    setText('foot-tag', s.footerTag);
    setText('foot-note', s.footerNote);
  }

  function paintHeroArt(src) {
    var host = $('hero-art');
    var fallback = '<svg class="hero-art-svg"><use href="#i-hero-art"/></svg>';
    if (!src) { host.innerHTML = fallback; return; }

    host.innerHTML = '<img src="' + esc(src) + '" alt="">';
    var img = host.firstChild;
    img.addEventListener('error', function () { host.innerHTML = fallback; });
    if (img.complete && img.naturalWidth === 0) { host.innerHTML = fallback; }
  }

  /* -------------------------------- Ticker ------------------------------ */
  function tickerItems() {
    var items = [];
    if (settings.address) { items.push({ text: settings.address, contact: true }); }
    if (settings.phone)   { items.push({ text: 'Call ' + settings.phone, contact: true }); }

    var lines = Array.isArray(settings.promoLines) ? settings.promoLines : [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i]) { items.push({ text: lines[i], contact: false }); }
    }
    if (!items.length) {
      items.push({ text: twoLines(settings.tagline).join(' '), contact: false });
    }
    return items;
  }

  function buildTicker() {
    var track = $('ticker-track');
    var items = tickerItems();

    var unitHTML = '';
    for (var i = 0; i < items.length; i++) {
      unitHTML += '<span class="t-sep"></span>';
      unitHTML += '<span class="t-item' + (items[i].contact ? ' is-contact' : '') + '">' +
                  esc(items[i].text) + '</span>';
    }

    /* Measure one copy, repeat until a half-track is wider than the screen.
       Two identical halves + a -50% translate = a gapless loop. */
    track.style.animation = 'none';
    track.innerHTML = '<div class="ticker-unit">' + unitHTML + '</div>';

    var unitW = track.firstChild.getBoundingClientRect().width;
    if (!unitW) { window.setTimeout(buildTicker, 250); return; }   // fonts not ready

    var reps = Math.max(1, Math.ceil(window.innerWidth / unitW));
    var half = '';
    for (var r = 0; r < reps; r++) { half += '<div class="ticker-unit">' + unitHTML + '</div>'; }
    track.innerHTML = half + half;

    var pxPerSec = TICKER_SPEED * rootPx();
    document.documentElement.style.setProperty(
      '--ticker-duration', Math.max(8, Math.round(unitW * reps / pxPerSec)) + 's');

    track.style.animation = '';
    void track.offsetWidth;
  }

  /* -------------------------------- Clock ------------------------------- */
  function tickClock() {
    var now = new Date();
    var h = now.getHours(), m = now.getMinutes();
    setText('clock', (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m);
  }

  /* -------------------------------- Status ------------------------------ */
  function showStatus(title, note) {
    setText('status-title', title);
    setText('status-note', note || '');
    elStatus.hidden = false;
  }
  function hideStatus() { elStatus.hidden = true; }

  /* -------------------------------- Debug ------------------------------- */
  function paintDebug() {
    if (!DEBUG) { return; }
    var left = Math.max(0, Math.round((nextFlipAt - Date.now()) / 100) / 10);
    var overflow = document.documentElement.scrollHeight - window.innerHeight;

    elDebug.textContent =
      'page ' + (pages.length ? pageIndex + 1 : 0) + ' / ' + pages.length +
        '   ·   next flip ' + left.toFixed(1) + 's\n' +
      'secondsPerPage ' + settings.secondsPerPage + '   ·   products ' + products.length + '\n' +
      'viewport ' + window.innerWidth + '×' + window.innerHeight +
        '   ·   1rem ' + rootPx().toFixed(2) + 'px\n' +
      'fits ' + (overflow <= 1 ? 'yes' : 'NO (+' + overflow + 'px)') +
        '   ·   source ' + (usingApi ? 'api' : 'static files') +
        '   ·   data ' + (lastError ? 'ERROR ' + lastError : 'ok');
  }

  /* -------------------------------- Boot -------------------------------- */
  function fingerprint(s, p) {
    try { return JSON.stringify(s) + '|' + JSON.stringify(p); } catch (e) { return ''; }
  }

  function load(isInitial, attempt) {
    Promise.all([loadData('/api/settings', 'settings.json'),
                 loadData('/api/products', 'products.json')])
      .then(function (res) {
        lastError = '';
        var stamp = fingerprint(res[0], res[1]);

        if (isInitial) {
          dataStamp = stamp;
          applyData(res[0], res[1]);
        } else if (stamp !== dataStamp) {
          /* New prices were deployed — swap them in at the next page turn so
             nothing changes under a customer's eyes mid-page. */
          dataStamp = stamp;
          pendingData = { settings: res[0], products: res[1] };
        }
      })
      .catch(function (err) {
        lastError = err && err.message ? err.message : String(err);
        if (!isInitial) { return; }      // background refresh: keep the current board

        var tries = attempt || 1;
        showStatus('Loading offers…',
          'Waiting for the product list (attempt ' + tries + ').\n' +
          'If you opened index.html straight from the file system, start a local ' +
          'server instead: npx serve .   —   ' + lastError);

        window.setTimeout(function () { load(true, tries + 1); }, Math.min(15000, 1000 * tries));
      });
  }

  function init() {
    var mark = $('logo-mark');
    mark.addEventListener('error', function () { mark.classList.add('is-missing'); });

    paintChrome();                        // draw defaults immediately
    tickClock();
    window.setInterval(tickClock, 1000);

    if (DEBUG) {
      elDebug.hidden = false;
      window.setInterval(paintDebug, 100);
    }

    load(true, 1);

    /* Rebuild the ticker once webfonts land, and on any resolution change
       (some Android TV browsers resize when entering fullscreen). */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { buildTicker(); });
    }
    var resizeTimer;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(buildTicker, 300);
    });

    /* Background throttling can stall timers; resync when we come back. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && pages.length) { schedule(); }
    });

    /* One slow housekeeping tick drives both the price refresh and the
       long-uptime reload, reading the live values out of settings.json. */
    var bootedAt = Date.now();
    var lastRefresh = Date.now();

    window.setInterval(function () {
      var refreshMin = isNum(settings.refreshMinutes) && settings.refreshMinutes > 0
        ? settings.refreshMinutes : DEFAULTS.refreshMinutes;
      var reloadHrs = isNum(settings.reloadHours) && settings.reloadHours > 0
        ? settings.reloadHours : DEFAULTS.reloadHours;

      if (Date.now() - lastRefresh >= refreshMin * 60000) {
        lastRefresh = Date.now();
        load(false);
      }
      if (Date.now() - bootedAt >= reloadHrs * 3600000) {
        window.location.reload();
      }
    }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
