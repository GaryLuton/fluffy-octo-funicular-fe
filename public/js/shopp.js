// Stuflover Printify storefront (/shopp) — guest cart + buy now.
(function () {
  var S = window.SLShop || {};
  var fmt = S.fmtPrice || function (c, cur) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: (cur || 'USD').toUpperCase() }).format((c || 0) / 100);
  };
  var esc = S.escapeHtml || function (s) { return String(s == null ? '' : s); };
  var toast = S.toast || function (m) { alert(m); };

  var CART_KEY = 'stuflover_printify_cart';
  var products = [];
  // Store-wide currency, supplied by the API and used for cart totals where no
  // single line item is in scope. Falls back to USD until products load.
  var storeCurrency = 'USD';

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    // Served from the Vercel frontend (stuflover.com) but the API lives on the
    // Railway backend — route through STUFLOVER_API_URL when present.
    var base = window.STUFLOVER_API_URL || '';
    return fetch(base + '/api/printify' + path, Object.assign({}, opts, { headers: headers }))
      .then(function (r) {
        return r.text().then(function (t) {
          var j = {};
          try { j = t ? JSON.parse(t) : {}; } catch (e) { throw new Error('Unexpected response — try again'); }
          if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
          return j;
        });
      });
  }

  // ── Cart storage ──────────────────────────────────────
  function loadCart() {
    try { var v = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function cartCount() { return loadCart().reduce(function (a, it) { return a + (it.quantity || 1); }, 0); }
  function cartTotal() { return loadCart().reduce(function (a, it) { return a + it.priceCents * it.quantity; }, 0); }

  function addToCart(item) {
    var cart = loadCart();
    var found = cart.find(function (c) { return c.id === item.id && c.variantId === item.variantId; });
    if (found) found.quantity = Math.min(99, found.quantity + 1);
    else cart.push(Object.assign({ quantity: 1 }, item));
    saveCart(cart);
    renderCart();
  }
  function setQty(id, variantId, delta) {
    var cart = loadCart();
    var it = cart.find(function (c) { return c.id === id && c.variantId === variantId; });
    if (!it) return;
    it.quantity += delta;
    if (it.quantity < 1) cart = cart.filter(function (c) { return c !== it; });
    saveCart(cart);
    renderCart();
  }
  function removeItem(id, variantId) {
    saveCart(loadCart().filter(function (c) { return !(c.id === id && c.variantId === variantId); }));
    renderCart();
  }

  // ── Product grid ──────────────────────────────────────
  function selectedVariant(prod, variantId) {
    return prod.variants.find(function (v) { return v.id === variantId; }) || prod.variants[0];
  }

  function renderGrid() {
    var grid = document.getElementById('grid');
    if (!products.length) {
      grid.innerHTML = '<div class="empty"><div class="bc">No products yet</div><p>Check back soon.</p></div>';
      return;
    }
    grid.innerHTML = products.map(function (p) {
      var imgs = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
      var imgHtml;
      if (imgs.length > 1) {
        imgHtml =
          '<div class="card-carousel">' +
            imgs.map(function (src) {
              return '<img src="' + esc(src) + '" alt="' + esc(p.title) + '" loading="lazy"/>';
            }).join('') +
          '</div>' +
          '<button type="button" class="carousel-nav prev" data-dir="-1" aria-label="Previous image">‹</button>' +
          '<button type="button" class="carousel-nav next" data-dir="1" aria-label="Next image">›</button>' +
          '<div class="carousel-dots">' +
            imgs.map(function (_, i) { return '<span class="dot' + (i === 0 ? ' active' : '') + '"></span>'; }).join('') +
          '</div>';
      } else if (imgs.length === 1) {
        imgHtml = '<img src="' + esc(imgs[0]) + '" alt="' + esc(p.title) + '" loading="lazy"/>';
      } else {
        imgHtml = '<span class="card-img-empty">No image</span>';
      }
      var variantSelect = p.variants.length > 1
        ? '<select class="variant" data-id="' + esc(p.id) + '">' +
            p.variants.map(function (v) {
              return '<option value="' + esc(v.id) + '">' + esc(v.title) + ' — ' + fmt(v.priceCents, p.currency) + '</option>';
            }).join('') +
          '</select>'
        : '';
      var descHtml = p.description
        ? '<div class="card-desc">' + esc(p.description) + '</div>'
        : '';
      return '<div class="card" data-id="' + esc(p.id) + '">' +
        '<div class="card-img">' + imgHtml + '</div>' +
        '<div class="card-body">' +
          '<div class="card-title">' + esc(p.title) + '</div>' +
          descHtml +
          '<div class="card-price">' + fmt(p.priceCents, p.currency) + '</div>' +
          '<div class="card-actions">' +
            variantSelect +
            '<button class="btn btn-sm add" data-id="' + esc(p.id) + '">Add to cart</button>' +
            '<button class="btn btn-primary btn-sm buy" data-id="' + esc(p.id) + '">Buy now</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    wireCarousels();
  }

  // Keep the dot indicators in sync as each card's image strip is scrolled
  // or swiped through.
  function wireCarousels() {
    var wraps = document.querySelectorAll('#grid .card-img');
    Array.prototype.forEach.call(wraps, function (wrap) {
      var track = wrap.querySelector('.card-carousel');
      var dots = wrap.querySelectorAll('.carousel-dots .dot');
      if (!track || !dots.length) return;
      track.addEventListener('scroll', function () {
        var idx = Math.round(track.scrollLeft / track.clientWidth);
        Array.prototype.forEach.call(dots, function (d, i) {
          d.classList.toggle('active', i === idx);
        });
      }, { passive: true });
    });
  }

  function variantChoiceFor(id) {
    var prod = products.find(function (p) { return p.id === id; });
    if (!prod) return null;
    var sel = document.querySelector('.variant[data-id="' + cssEsc(id) + '"]');
    var variant = selectedVariant(prod, sel ? sel.value : null);
    return {
      id: prod.id, title: prod.title, image: prod.image,
      variantId: variant.id, variantTitle: variant.title, priceCents: variant.priceCents,
      currency: prod.currency || storeCurrency,
    };
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  // ── Cart drawer ───────────────────────────────────────
  function renderCart() {
    var cart = loadCart();
    var count = cartCount();
    var badge = document.getElementById('cartCount');
    if (badge) badge.textContent = count ? '(' + count + ')' : '';

    var body = document.getElementById('drawerBody');
    if (!cart.length) {
      body.innerHTML = '<div class="drawer-empty">Your cart is empty.</div>';
    } else {
      body.innerHTML = cart.map(function (it) {
        var img = it.image
          ? '<img src="' + esc(it.image) + '" alt=""/>'
          : '<img alt=""/>';
        return '<div class="di">' + img +
          '<div>' +
            '<div class="t">' + esc(it.title) + '</div>' +
            (it.variantTitle ? '<div class="v">' + esc(it.variantTitle) + '</div>' : '') +
            '<div class="qty-row">' +
              '<button class="qbtn dec" data-id="' + esc(it.id) + '" data-v="' + esc(it.variantId) + '">−</button>' +
              '<span>' + it.quantity + '</span>' +
              '<button class="qbtn inc" data-id="' + esc(it.id) + '" data-v="' + esc(it.variantId) + '">+</button>' +
              '<button class="rm" data-id="' + esc(it.id) + '" data-v="' + esc(it.variantId) + '">remove</button>' +
            '</div>' +
          '</div>' +
          '<div class="p">' + fmt(it.priceCents * it.quantity, it.currency || storeCurrency) + '</div>' +
        '</div>';
      }).join('');
    }
    document.getElementById('drawerTotal').textContent = fmt(cartTotal(), (cart[0] && cart[0].currency) || storeCurrency);
    document.getElementById('checkoutBtn').disabled = !cart.length;
  }

  function openDrawer() {
    document.getElementById('drawer').classList.add('show');
    document.getElementById('drawerBackdrop').classList.add('show');
  }
  function closeDrawer() {
    document.getElementById('drawer').classList.remove('show');
    document.getElementById('drawerBackdrop').classList.remove('show');
  }

  // ── Checkout ──────────────────────────────────────────
  function checkout(items, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Redirecting…'; }
    api('/checkout', { method: 'POST', body: { items: items } })
      .then(function (r) {
        if (r.url) { window.location.href = r.url; return; }
        throw new Error('No checkout URL');
      })
      .catch(function (e) {
        toast(e.message || 'Checkout failed');
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Checkout'; }
      });
  }

  // ── Events ────────────────────────────────────────────
  function wire() {
    document.getElementById('grid').addEventListener('click', function (e) {
      var nav = e.target.closest('.carousel-nav');
      if (nav) {
        var track = nav.parentElement.querySelector('.card-carousel');
        if (track) track.scrollBy({ left: Number(nav.dataset.dir) * track.clientWidth, behavior: 'smooth' });
        return;
      }
      var add = e.target.closest('.add');
      var buy = e.target.closest('.buy');
      if (add) {
        var choice = variantChoiceFor(add.dataset.id);
        if (choice) { addToCart(choice); toast('Added to cart'); }
      } else if (buy) {
        var c = variantChoiceFor(buy.dataset.id);
        if (c) checkout([{ id: c.id, variantId: c.variantId, quantity: 1 }], buy);
      }
    });

    document.getElementById('drawerBody').addEventListener('click', function (e) {
      var t = e.target;
      if (t.classList.contains('inc')) setQty(t.dataset.id, t.dataset.v, 1);
      else if (t.classList.contains('dec')) setQty(t.dataset.id, t.dataset.v, -1);
      else if (t.classList.contains('rm')) removeItem(t.dataset.id, t.dataset.v);
    });

    document.getElementById('cartFab').addEventListener('click', openDrawer);
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('drawerBackdrop').addEventListener('click', closeDrawer);

    var checkoutBtn = document.getElementById('checkoutBtn');
    checkoutBtn.dataset.label = 'Checkout';
    checkoutBtn.addEventListener('click', function () {
      var items = loadCart().map(function (it) {
        return { id: it.id, variantId: it.variantId, quantity: it.quantity };
      });
      if (!items.length) return;
      checkout(items, checkoutBtn);
    });
  }

  function handleReturn() {
    var params = new URLSearchParams(location.search);
    if (params.get('success') === '1') {
      saveCart([]);
      toast('Thank you! Your order is confirmed.');
      history.replaceState({}, '', '/shopp');
    } else if (params.get('canceled') === '1') {
      toast('Checkout canceled');
      history.replaceState({}, '', '/shopp');
    }
  }

  // ── Init ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    wire();
    renderCart();
    handleReturn();
    api('/products')
      .then(function (r) {
        products = r.products || [];
        if (products[0] && products[0].currency) storeCurrency = products[0].currency;
        if (r.demo) document.getElementById('demoBanner').style.display = '';
        renderGrid();
        renderCart();
      })
      .catch(function (e) {
        document.getElementById('grid').innerHTML =
          '<div class="empty"><div class="bc">Could not load products</div><p>' + esc(e.message) + '</p></div>';
      });
  });
})();
