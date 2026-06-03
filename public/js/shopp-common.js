// Shared storefront logic for the Printify shop (/shopp grid + /shopp-product
// detail). Owns the guest cart (localStorage), the slide-in cart drawer, the
// Printify API helper, and Stripe checkout — so both pages behave identically
// and there's a single source of truth for the cart.
(function () {
  var S = window.SLShop || {};
  var fmt = S.fmtPrice || function (c, cur) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: (cur || 'USD').toUpperCase() }).format((c || 0) / 100);
  };
  var esc = S.escapeHtml || function (s) { return String(s == null ? '' : s); };
  var toast = S.toast || function (m) { alert(m); };

  var CART_KEY = 'stuflover_printify_cart';
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

  // ── Cart drawer ───────────────────────────────────────
  function renderCart() {
    var count = cartCount();
    var badge = document.getElementById('cartCount');
    if (badge) badge.textContent = count ? '(' + count + ')' : '';

    var body = document.getElementById('drawerBody');
    if (!body) return; // page without the drawer markup (shouldn't happen)
    var cart = loadCart();
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
    var total = document.getElementById('drawerTotal');
    if (total) total.textContent = fmt(cartTotal(), (cart[0] && cart[0].currency) || storeCurrency);
    var checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.disabled = !cart.length;
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

  // Wire the cart fab + drawer controls. Safe to call once per page that
  // includes the drawer markup.
  function wireDrawer() {
    var drawerBody = document.getElementById('drawerBody');
    if (drawerBody) {
      drawerBody.addEventListener('click', function (e) {
        var t = e.target;
        if (t.classList.contains('inc')) setQty(t.dataset.id, t.dataset.v, 1);
        else if (t.classList.contains('dec')) setQty(t.dataset.id, t.dataset.v, -1);
        else if (t.classList.contains('rm')) removeItem(t.dataset.id, t.dataset.v);
      });
    }

    var fab = document.getElementById('cartFab');
    if (fab) fab.addEventListener('click', openDrawer);
    var close = document.getElementById('drawerClose');
    if (close) close.addEventListener('click', closeDrawer);
    var backdrop = document.getElementById('drawerBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    var checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
      checkoutBtn.dataset.label = 'Checkout';
      checkoutBtn.addEventListener('click', function () {
        var items = loadCart().map(function (it) {
          return { id: it.id, variantId: it.variantId, quantity: it.quantity };
        });
        if (!items.length) return;
        checkout(items, checkoutBtn);
      });
    }
  }

  // Clear the cart and surface the order outcome after returning from Stripe.
  function handleReturn(returnPath) {
    var params = new URLSearchParams(location.search);
    if (params.get('success') === '1') {
      saveCart([]);
      renderCart();
      toast('Thank you! Your order is confirmed.');
      history.replaceState({}, '', returnPath);
    } else if (params.get('canceled') === '1') {
      toast('Checkout canceled');
      history.replaceState({}, '', returnPath);
    }
  }

  window.SLStore = {
    api: api, esc: esc, fmt: fmt, toast: toast,
    getCurrency: function () { return storeCurrency; },
    setCurrency: function (c) { if (c) storeCurrency = c; },
    loadCart: loadCart, saveCart: saveCart,
    addToCart: addToCart, setQty: setQty, removeItem: removeItem,
    cartCount: cartCount, cartTotal: cartTotal,
    renderCart: renderCart, openDrawer: openDrawer, closeDrawer: closeDrawer,
    checkout: checkout, wireDrawer: wireDrawer, handleReturn: handleReturn,
  };
})();
