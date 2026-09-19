/* =========================================================================
   Board Admin — add / edit / reorder the products the signage board shows.

   Three ways to save, picked automatically:

     * Deployed      — a backend is present, so Save writes to Neon Postgres
                       and uploads photos to Vercel Blob. Changes go live on
                       the TV within about a minute. Requires signing in.
     * Chrome / Edge — no backend: connect the project folder once and Save
                       writes products.json and the photos straight into it.
     * Anywhere else — no backend: Save hands you the files as downloads.
   ========================================================================= */
(function () {
  'use strict';

  var IMG_SIZE = 700;          // saved photos are square, matching the card
  var IMG_MARGIN = 0.07;       // breathing room kept around the product
  var IMG_QUALITY = 0.88;
  var PER_PAGE = 6;            // the board shows six products per page

  /* ------------------------------- state -------------------------------- */
  var products = [];           // working copy of products.json
  var settings = {};
  var pending = {};            // filename -> Blob, photos not yet written
  var dirHandle = null;        // File System Access handle, when connected
  var selected = -1;           // index being edited, -1 = none
  var draft = null;            // the product object currently in the form
  var isNew = false;
  var dirty = false;
  var mode = 'files';           // 'api' when a backend is attached
  var caps = {};                // what /api/session reported

  var $ = function (id) { return document.getElementById(id); };
  var hasFS = typeof window.showDirectoryPicker === 'function';

  /* ------------------------------ utilities ----------------------------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function money(v) {
    return isNum(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
  }

  function slug(name) {
    return String(name || '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'product';
  }

  /* Unique images/<slug>.jpg, avoiding names already used by other products */
  function imagePath(name, ignoreIndex) {
    var base = slug(name), n = 0, path;
    for (;;) {
      path = 'images/' + base + (n ? '-' + n : '') + '.jpg';
      var clash = products.some(function (p, i) {
        return i !== ignoreIndex && p.image === path;
      });
      if (!clash) { return path; }
      n++;
    }
  }

  function discountFrom(oldP, newP) {
    if (!isNum(oldP) || !isNum(newP) || oldP <= 0 || newP >= oldP) { return null; }
    return Math.round((1 - newP / oldP) * 100);
  }

  function toast(msg, bad) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function markDirty(v) {
    dirty = v;
    var el = $('stat-dirty');
    el.textContent = v ? 'Unsaved changes' : 'All changes saved';
    el.className = v ? 'dirty' : 'clean';
    $('btn-save').disabled = !v;
  }

  /* ------------------------------ the API ------------------------------- */
  function api(path, opts) {
    return fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store'
    }, opts || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) {
          var e = new Error(body.error || ('HTTP ' + r.status));
          e.status = r.status;
          throw e;
        }
        return body;
      });
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error('Could not read the processed image')); };
      fr.readAsDataURL(blob);
    });
  }

  /* --------------------------- image processing ------------------------- */
  /* Mirrors prepare-photos.py: straighten, trim the plain border away,
     centre on a white square, export an optimised JPEG. */
  function processImage(file) {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(function () { return createImageBitmap(file); })
      .then(function (bmp) {
        var c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(bmp, 0, 0);

        var box = trimBox(x, bmp.width, bmp.height);

        var out = document.createElement('canvas');
        out.width = out.height = IMG_SIZE;
        var o = out.getContext('2d');
        o.fillStyle = '#FFFFFF';
        o.fillRect(0, 0, IMG_SIZE, IMG_SIZE);

        var inner = IMG_SIZE * (1 - 2 * IMG_MARGIN);
        var bw = box[2] - box[0], bh = box[3] - box[1];
        var k = Math.min(inner / bw, inner / bh);
        var dw = bw * k, dh = bh * k;
        o.imageSmoothingQuality = 'high';
        o.drawImage(bmp, box[0], box[1], bw, bh,
                    (IMG_SIZE - dw) / 2, (IMG_SIZE - dh) / 2, dw, dh);

        return new Promise(function (res) {
          out.toBlob(function (b) { res(b); }, 'image/jpeg', IMG_QUALITY);
        });
      });
  }

  /* Bounding box of the subject, assuming a plain border colour */
  function trimBox(ctx, w, h) {
    var full = [0, 0, w, h];
    var d;
    try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return full; }

    function lum(i) { return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; }
    var corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
    var bg = corners.reduce(function (s, i) { return s + lum(i); }, 0) / 4;

    var tol = 18, step = Math.max(1, Math.floor(Math.min(w, h) / 600));
    var x0 = w, y0 = h, x1 = 0, y1 = 0, found = false;
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        if (Math.abs(lum((y * w + x) * 4) - bg) > tol) {
          found = true;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (!found) { return full; }
    /* refuse a crop so tight it means detection failed */
    if ((x1 - x0) < w * 0.04 || (y1 - y0) < h * 0.04) { return full; }

    var pad = Math.round(Math.min(w, h) * 0.01);
    return [Math.max(0, x0 - pad), Math.max(0, y0 - pad),
            Math.min(w, x1 + pad), Math.min(h, y1 + pad)];
  }

  /* ------------------------------ rendering ----------------------------- */
  function nameHTML(name, size) {
    var n = String(name || 'Product name');
    var cut = n.indexOf(' ');
    var html = cut === -1 ? '<b>' + esc(n) + '</b>'
                          : '<b>' + esc(n.slice(0, cut)) + '</b> ' + esc(n.slice(cut + 1));
    if (size) { html += ' (' + esc(size) + ')'; }
    return html;
  }

  function imgSrc(p) {
    if (p && p.image && pending[p.image]) { return URL.createObjectURL(pending[p.image]); }
    return p && p.image ? p.image + '?v=' + (p._v || 0) : '';
  }

  function renderList() {
    var host = $('list');
    if (!products.length) {
      host.innerHTML = '<div class="empty-list">No products yet. Add the first one.</div>';
      renderStats();
      return;
    }

    var html = '';
    for (var i = 0; i < products.length; i++) {
      if (i % PER_PAGE === 0) {
        var page = products.slice(i, i + PER_PAGE);
        var cats = {};
        page.forEach(function (p) { if (p.category) { cats[p.category] = 1; } });
        var names = Object.keys(cats);
        html += '<div class="page-sep">Page ' + (i / PER_PAGE + 1) +
                (names.length === 1 ? ' · ' + esc(names[0]) : '') +
                (names.length > 1
                  ? ' <span class="mixed">mixed categories — the strip highlights '
                    + esc(names[0]) + '</span>' : '') +
                '</div>';
      }

      var p = products[i];
      var src = imgSrc(p);
      html += '<div class="item' + (i === selected ? ' sel' : '') + '" data-i="' + i + '">' +
        (src ? '<div class="item-img" style="background-image:url(' + esc(src) + ')"></div>'
             : '<div class="item-img none">no<br>photo</div>') +
        '<div class="item-body">' +
          '<div class="item-name">' + nameHTML(p.name, p.size) + '</div>' +
          '<div class="item-meta">' +
            '<span class="item-new">' + esc(p.currency || settings.currency || 'Rs.') +
              ' ' + money(p.newPrice) + '</span>' +
            (isNum(p.oldPrice) ? '<span class="item-old">' + money(p.oldPrice) + '</span>' : '') +
            (isNum(p.discountPercent) && p.discountPercent > 0
              ? '<span class="item-pct">' + Math.round(p.discountPercent) + '%</span>' : '') +
            (p.category ? '<span class="item-cat">' + esc(p.category) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="item-tools">' +
          '<button class="btn-icon" data-act="up" data-i="' + i + '"' +
            (i === 0 ? ' disabled' : '') + ' title="Move up">↑</button>' +
          '<button class="btn-icon" data-act="down" data-i="' + i + '"' +
            (i === products.length - 1 ? ' disabled' : '') + ' title="Move down">↓</button>' +
        '</div>' +
      '</div>';
    }
    host.innerHTML = html;
    renderStats();
  }

  function renderStats() {
    var pages = Math.ceil(products.length / PER_PAGE) || 0;
    var secs = isNum(settings.secondsPerPage) ? settings.secondsPerPage : 8;
    $('stat-counts').textContent =
      products.length + ' product' + (products.length === 1 ? '' : 's') +
      ' · ' + pages + ' page' + (pages === 1 ? '' : 's') +
      ' · full loop ' + (pages * secs) + 's';
  }

  function renderPreview() {
    if (!draft) { return; }
    var cur = draft.currency || settings.currency || 'Rs.';
    $('pv-name').innerHTML = nameHTML(draft.name, draft.size);
    $('pv-cur').textContent = cur;
    $('pv-new').textContent = isNum(draft.newPrice) ? money(draft.newPrice) : '0';
    $('pv-old').textContent = isNum(draft.oldPrice) ? cur + ' ' + money(draft.oldPrice) : '';
    $('cur-1').textContent = cur;
    $('cur-2').textContent = cur;

    var show = isNum(draft.discountPercent) && draft.discountPercent > 0;
    $('pv-badge').hidden = !show;
    if (show) { $('pv-pct').textContent = Math.round(draft.discountPercent) + '%'; }

    var media = $('pv-media');
    var src = imgSrc(draft);
    media.innerHTML = src
      ? '<img src="' + esc(src) + '" alt="" onerror="this.outerHTML=\'<div class=&quot;none&quot;>' +
        esc(draft.name || 'No photo') + '</div>\'">'
      : '<div class="none">' + esc(draft.name || 'No photo yet') + '</div>';
  }

  /* -------------------------------- editor ------------------------------ */
  function openEditor(index) {
    isNew = index < 0;
    selected = index;
    draft = isNew
      ? { name: '', size: '', category: '', newPrice: null, currency: settings.currency || 'Rs.' }
      : JSON.parse(JSON.stringify(products[index]));

    $('edit-title').textContent = isNew ? 'Add product' : 'Edit product';
    $('edit-empty').hidden = true;
    $('form').hidden = false;
    $('btn-delete').hidden = isNew;

    $('f-name').value = draft.name || '';
    $('f-size').value = draft.size || '';
    $('f-cat').value = draft.category || '';
    $('f-new').value = isNum(draft.newPrice) ? draft.newPrice : '';
    $('f-old').value = isNum(draft.oldPrice) ? draft.oldPrice : '';
    $('f-pct').value = isNum(draft.discountPercent) ? draft.discountPercent : '';
    $('drop-text').textContent = draft.image
      ? draft.image.replace('images/', '') + ' — click to replace'
      : 'Drop a photo here, or click to choose';
    $('drop').className = 'drop' + (draft.image ? ' has' : '');

    $('f-name').classList.remove('bad');
    $('f-new').classList.remove('bad');
    renderPreview();
    renderList();
    validate();
  }

  function closeEditor() {
    selected = -1; draft = null;
    $('form').hidden = true;
    $('edit-empty').hidden = false;
    $('edit-title').textContent = 'Add product';
    renderList();
  }

  function readForm() {
    if (!draft) { return; }
    draft.name = $('f-name').value.trim();
    draft.size = $('f-size').value.trim();
    draft.category = $('f-cat').value;

    var n = parseFloat($('f-new').value);
    draft.newPrice = isFinite(n) ? n : null;
    var o = parseFloat($('f-old').value);
    draft.oldPrice = isFinite(o) ? o : null;
    var p = parseFloat($('f-pct').value);
    draft.discountPercent = isFinite(p) ? p : null;
  }

  function validate() {
    var msgs = [];
    if (!draft.name) { msgs.push('A name is required.'); }
    if (!isNum(draft.newPrice)) { msgs.push('A price is required.'); }
    if (isNum(draft.oldPrice) && isNum(draft.newPrice) && draft.oldPrice <= draft.newPrice) {
      msgs.push('“Was” is not higher than the price, so nothing looks discounted.');
    }
    if (isNum(draft.discountPercent) && !isNum(draft.oldPrice)) {
      msgs.push('The badge shows a discount but there is no “was” price to strike through.');
    }
    var w = $('warn');
    w.hidden = !msgs.length;
    w.textContent = msgs.join(' ');

    var ok = !!draft.name && isNum(draft.newPrice);
    $('btn-done').disabled = !ok;
    return ok;
  }

  function commit() {
    readForm();
    if (!validate()) {
      $('f-name').classList.toggle('bad', !draft.name);
      $('f-new').classList.toggle('bad', !isNum(draft.newPrice));
      return;
    }

    /* an unnamed-at-upload photo gets its filename once the name is known */
    if (draft._blob) {
      if (mode === 'api') {
        /* the hosted URL this upload supersedes, for server-side cleanup */
        var prev = isNew ? null : products[selected] && products[selected].image;
        if (prev && /^https?:/.test(prev)) { draft._replaces = prev; }
      }
      var path = mode === 'api'
        ? draft.image                                   /* temp key; replaced on upload */
        : (draft.image && draft.image.indexOf('images/') === 0 && !draft._auto
            ? draft.image
            : imagePath(draft.name, isNew ? -1 : selected));
      if (path !== draft.image) { delete pending[draft.image]; }
      draft.image = path;
      pending[path] = draft._blob;
      draft._v = Date.now();
      delete draft._blob;
      delete draft._auto;
    }

    var clean = {
      name: draft.name,
      size: draft.size || undefined,
      category: draft.category || undefined,
      image: draft.image || undefined,
      oldPrice: isNum(draft.oldPrice) ? draft.oldPrice : undefined,
      newPrice: draft.newPrice,
      discountPercent: isNum(draft.discountPercent) && draft.discountPercent > 0
        ? Math.round(draft.discountPercent) : undefined,
      currency: draft.currency || settings.currency || 'Rs.'
    };
    if (draft._v) { clean._v = draft._v; }
    if (draft._replaces) { clean._replaces = draft._replaces; }

    if (isNew) { products.push(clean); } else { products[selected] = clean; }

    markDirty(true);
    closeEditor();
    toast(isNew ? 'Product added' : 'Product updated');
  }

  function removeCurrent() {
    if (isNew || selected < 0) { closeEditor(); return; }
    var p = products[selected];
    if (!window.confirm('Delete “' + (p.name || 'this product') + '” from the board?')) { return; }
    if (p.image) { delete pending[p.image]; }
    products.splice(selected, 1);
    markDirty(true);
    closeEditor();
    toast('Product deleted');
  }

  function move(i, delta) {
    var j = i + delta;
    if (j < 0 || j >= products.length) { return; }
    var t = products[i]; products[i] = products[j]; products[j] = t;
    if (selected === i) { selected = j; } else if (selected === j) { selected = i; }
    markDirty(true);
    renderList();
  }

  /* -------------------------------- saving ------------------------------ */
  function jsonText() {
    var out = products.map(function (p) {
      var c = {};
      ['name', 'size', 'category', 'image', 'oldPrice', 'newPrice',
       'discountPercent', 'currency'].forEach(function (k) {
        if (p[k] !== undefined && p[k] !== null && p[k] !== '') { c[k] = p[k]; }
      });
      return c;
    });
    return JSON.stringify(out, null, 2) + '\n';
  }

  function connectFolder() {
    if (!hasFS) {
      toast('This browser cannot write files. Use Chrome, or Save to download them.', true);
      return;
    }
    window.showDirectoryPicker({ mode: 'readwrite' }).then(function (h) {
      return h.getFileHandle('products.json').then(function () { return h; });
    }).then(function (h) {
      dirHandle = h;
      $('folder-state').textContent = 'Connected: ' + h.name;
      $('folder-state').className = 'folder ok';
      $('btn-connect').textContent = 'Change folder';
      toast('Folder connected — Save now writes straight into it');
    }).catch(function (err) {
      if (err && err.name === 'AbortError') { return; }
      toast('That folder has no products.json — pick the folder containing index.html', true);
    });
  }

  function save() {
    if (mode === 'api') { saveToApi(); }
    else if (dirHandle) { saveToFolder(); }
    else { saveAsDownloads(); }
  }

  /* Upload any new photos, then replace the product list in one PUT. */
  function saveToApi() {
    var btn = $('btn-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    var names = Object.keys(pending);
    var step = Promise.resolve();

    names.forEach(function (tmpPath) {
      step = step.then(function () {
        var owner = products.filter(function (p) { return p.image === tmpPath; })[0];
        var label = owner ? slug(owner.name) : 'product';
        return blobToDataUrl(pending[tmpPath]).then(function (dataUrl) {
          return api('/api/upload', {
            method: 'POST',
            body: JSON.stringify({
              filename: label,
              dataUrl: dataUrl,
              replace: owner && owner._replaces ? owner._replaces : undefined
            })
          });
        }).then(function (out) {
          /* point every product that used the temp path at the hosted URL */
          products.forEach(function (p) {
            if (p.image === tmpPath) { p.image = out.url; delete p._replaces; }
          });
          delete pending[tmpPath];
        });
      });
    });

    step.then(function () {
      return api('/api/products', { method: 'PUT', body: jsonText() });
    }).then(function (out) {
      markDirty(false);
      renderList();
      toast('Saved — ' + out.count + ' products are live on the board');
    }).catch(function (err) {
      if (err.status === 401) {
        showGate('Your session expired. Sign in again.');
      } else {
        toast('Could not save: ' + err.message, true);
      }
    }).then(function () {
      btn.textContent = 'Save changes';
      btn.disabled = !dirty;
    });
  }

  function saveToFolder() {
    var wrote = [];
    write(dirHandle, 'products.json', new Blob([jsonText()], { type: 'application/json' }))
      .then(function () {
        wrote.push('products.json');
        var names = Object.keys(pending);
        if (!names.length) { return null; }
        return dirHandle.getDirectoryHandle('images', { create: true })
          .then(function (imgDir) {
            return names.reduce(function (chain, n) {
              return chain.then(function () {
                return write(imgDir, n.replace('images/', ''), pending[n])
                  .then(function () { wrote.push(n); });
              });
            }, Promise.resolve());
          });
      })
      .then(function () {
        pending = {};
        markDirty(false);
        sheet('Saved to ' + dirHandle.name,
          '<p>Written straight into your project folder:</p>' +
          '<div class="dl-list">' + wrote.map(function (n) {
            return '<div class="dl-row"><span class="grow">' + esc(n) + '</span>✓</div>';
          }).join('') + '</div>' +
          '<p>Reload the board to see it, then redeploy the folder when you are ready.</p>');
      })
      .catch(function (err) {
        toast('Could not write: ' + (err && err.message ? err.message : err), true);
      });
  }

  function write(dir, name, blob) {
    return dir.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(blob).then(function () { return w.close(); });
      });
    });
  }

  function saveAsDownloads() {
    var files = [{ name: 'products.json',
                   blob: new Blob([jsonText()], { type: 'application/json' }) }];
    Object.keys(pending).forEach(function (n) {
      files.push({ name: n.replace('images/', ''), blob: pending[n], img: true });
    });

    var rows = files.map(function (f, i) {
      return '<div class="dl-row"><span class="grow">' + esc(f.name) + '</span>' +
             '<button class="btn btn-ghost btn-sm" data-dl="' + i + '">Download</button></div>';
    }).join('');

    sheet('Save these ' + files.length + ' file' + (files.length === 1 ? '' : 's'),
      '<p>Your browser cannot write to a folder directly, so download the files and ' +
      'put them in place:</p>' +
      '<ol><li><code>products.json</code> goes in the project folder, replacing the old one.</li>' +
      '<li>The photos go in the <code>images/</code> folder.</li>' +
      '<li>Redeploy by dragging the folder to Netlify.</li></ol>' +
      '<div class="dl-list">' + rows + '</div>' +
      '<p>Tip: in Chrome, “Connect project folder” skips all of this.</p>');

    $('sheet-body').addEventListener('click', function (e) {
      var b = e.target.closest('[data-dl]');
      if (!b) { return; }
      var f = files[+b.getAttribute('data-dl')];
      var a = document.createElement('a');
      a.href = URL.createObjectURL(f.blob);
      a.download = f.name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      b.textContent = 'Downloaded ✓';
      b.disabled = true;
    });

    markDirty(false);
  }

  function sheet(title, html) {
    $('sheet-title').textContent = title;
    $('sheet-body').innerHTML = html;
    $('sheet').hidden = false;
  }

  /* ------------------------------ sign-in gate --------------------------- */
  function showGate(message) {
    $('gate').hidden = false;
    var err = $('gate-err');
    if (message) { err.textContent = message; err.hidden = false; } else { err.hidden = true; }
    setTimeout(function () { $('gate-pw').focus(); }, 50);
  }

  function hideGate() { $('gate').hidden = true; $('gate-pw').value = ''; }

  function bindGate() {
    $('gate-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('gate-btn');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password: $('gate-pw').value })
      }).then(function () {
        hideGate();
        loadFromApi();
      }).catch(function (err) {
        showGate(err.message || 'Could not sign in.');
      }).then(function () {
        btn.disabled = false;
        btn.textContent = 'Sign in';
      });
    });

    $('btn-logout').addEventListener('click', function () {
      if (dirty && !window.confirm('You have unsaved changes. Sign out anyway?')) { return; }
      api('/api/logout', { method: 'POST' }).catch(function () {}).then(function () {
        markDirty(false);
        showGate();
      });
    });
  }

  /* --------------------------------- boot ------------------------------- */
  function bindImagePicker() {
    var drop = $('drop'), file = $('file');

    function take(f) {
      if (!f || !/^image\//.test(f.type)) {
        toast('That is not an image file', true);
        return;
      }
      $('drop-text').textContent = 'Processing…';
      processImage(f).then(function (blob) {
        draft._blob = blob;
        draft._auto = true;
        /* provisional name so the preview can show it before Done */
        var tmp = 'images/__new__' + Date.now() + '.jpg';
        delete pending[draft.image];
        draft.image = tmp;
        pending[tmp] = blob;
        draft._v = Date.now();
        $('drop-text').textContent =
          'Photo ready (' + Math.round(blob.size / 1024) + ' KB) — click to replace';
        drop.classList.add('has');
        renderPreview();
      }).catch(function (err) {
        $('drop-text').textContent = 'Drop a photo here, or click to choose';
        toast('Could not read that image: ' + (err && err.message ? err.message : err), true);
      });
    }

    drop.addEventListener('click', function () { file.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
    });
    file.addEventListener('change', function () { take(file.files[0]); file.value = ''; });

    ['dragenter', 'dragover'].forEach(function (t) {
      drop.addEventListener(t, function (e) {
        e.preventDefault(); drop.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      drop.addEventListener(t, function (e) {
        e.preventDefault(); drop.classList.remove('over');
      });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files.length) { take(e.dataTransfer.files[0]); }
    });
  }

  function bind() {
    $('btn-connect').addEventListener('click', connectFolder);
    $('btn-save').addEventListener('click', save);
    $('btn-add').addEventListener('click', function () { openEditor(-1); });
    $('btn-cancel').addEventListener('click', closeEditor);
    $('btn-delete').addEventListener('click', removeCurrent);
    $('sheet-close').addEventListener('click', function () { $('sheet').hidden = true; });

    $('form').addEventListener('submit', function (e) { e.preventDefault(); commit(); });

    $('list').addEventListener('click', function (e) {
      var tool = e.target.closest('[data-act]');
      if (tool) {
        e.stopPropagation();
        move(+tool.getAttribute('data-i'), tool.getAttribute('data-act') === 'up' ? -1 : 1);
        return;
      }
      var row = e.target.closest('.item');
      if (row) { openEditor(+row.getAttribute('data-i')); }
    });

    ['f-name', 'f-size', 'f-cat', 'f-new', 'f-old', 'f-pct'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        readForm();
        /* keep the badge in step with the prices unless it was typed by hand */
        if (id === 'f-new' || id === 'f-old') {
          var auto = discountFrom(draft.oldPrice, draft.newPrice);
          if (auto !== null) { $('f-pct').value = auto; draft.discountPercent = auto; }
          else if (!isNum(draft.oldPrice)) { $('f-pct').value = ''; draft.discountPercent = null; }
        }
        renderPreview();
        validate();
      });
    });

    $('btn-autopct').addEventListener('click', function () {
      readForm();
      var auto = discountFrom(draft.oldPrice, draft.newPrice);
      $('f-pct').value = auto === null ? '' : auto;
      draft.discountPercent = auto;
      renderPreview();
      validate();
      if (auto === null) { toast('Needs a “was” price higher than the price', true); }
    });

    bindImagePicker();

    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function loadFromApi() {
    Promise.all([
      api('/api/settings').catch(function () { return {}; }),
      api('/api/products')
    ]).then(function (res) {
      settings = res[0] && !res[0].error ? res[0] : settings;
      products = Array.isArray(res[1]) ? res[1] : [];
      fillCategories();
      renderList();
      markDirty(false);
      closeEditor();
    }).catch(function (err) {
      if (err.status === 401) { showGate(); return; }
      $('list').innerHTML = '<div class="empty-list">Could not load products.<br>' +
        esc(err.message) + '</div>';
    });
  }

  function loadFromFiles() {
    Promise.all([
      fetch('settings.json?t=' + Date.now()).then(function (r) { return r.json(); }),
      fetch('products.json?t=' + Date.now()).then(function (r) { return r.json(); })
    ]).then(function (res) {
      settings = res[0] || {};
      products = Array.isArray(res[1]) ? res[1] : [];
      fillCategories();
      renderList();
      markDirty(false);
    }).catch(function (err) {
      $('list').innerHTML = '<div class="empty-list">Could not load products.json.<br>' +
        'Run this through a local server: <code>npx serve .</code><br><br>' +
        esc(err && err.message ? err.message : err) + '</div>';
    });
  }

  function fillCategories() {
    var cats = (settings.categories || []).map(function (c) { return c.label; });
    var cur = $('f-cat').value;
    $('f-cat').innerHTML = '<option value="">— none —</option>' +
      cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    if (cur) { $('f-cat').value = cur; }
  }

  function applyMode() {
    var isApi = mode === 'api';
    /* the folder/download plumbing is only meaningful without a backend */
    $('btn-connect').hidden = isApi;
    $('btn-logout').hidden = !isApi;

    if (isApi) {
      $('folder-state').textContent = caps.blob
        ? 'Live — saves publish straight to the board'
        : 'Live — no image store yet, photos cannot be uploaded';
      $('folder-state').className = 'folder ok';
    } else if (!hasFS) {
      $('folder-state').textContent = 'Downloads mode (this browser cannot write files)';
      $('btn-connect').disabled = true;
    }
  }

  function boot() {
    bind();
    bindGate();

    /* Is there a backend behind this page? */
    fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (info) {
        if (info && info.api && info.configured && info.database) {
          mode = 'api';
          caps = info;
          applyMode();
          if (info.authed) { loadFromApi(); } else { showGate(); }
          return;
        }
        /* No backend (or not configured yet) — edit the local files instead. */
        mode = 'files';
        caps = info || {};
        applyMode();
        loadFromFiles();

        if (info && info.api && !info.database) {
          toast('Backend is deployed but has no database yet — editing local files', true);
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
