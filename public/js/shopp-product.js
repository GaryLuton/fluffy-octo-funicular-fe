// Printify storefront — single product detail page (/shopp-product?id=…).
// Shows a large main image with a thumbnail gallery, full description, a
// variant picker, and add-to-cart / buy-now. Cart + checkout come from SLStore.
(function () {
  var Store = window.SLStore;
  var esc = Store.esc, fmt = Store.fmt, toast = Store.toast;

  var product = null;
  var images = [];

  function init() {
    Store.wireDrawer();
    Store.renderCart();
    wireLightbox();
    var id = new URLSearchParams(location.search).get('id');
    if (!id) { showError('Product not found'); return; }
    Store.api('/products/' + encodeURIComponent(id))
      .then(function (r) {
        product = r.product;
        if (!product) { showError('Product not found'); return; }
        if (product.currency) Store.setCurrency(product.currency);
        if (r.demo) document.getElementById('demoBanner').style.display = '';
        render();
      })
      .catch(function (e) { showError(e.message || 'Could not load product'); });
  }

  function showError(msg) {
    document.getElementById('content').innerHTML =
      '<div class="empty"><div class="bc">' + esc(msg) + '</div>' +
      '<p><a href="/shopp.html">Return to the shop</a></p></div>';
  }

  // A variant is buyable when it isn't flagged sold out and carries a price.
  function buyableVariants() {
    return product.variants.filter(function (v) { return v.available !== false && v.priceCents > 0; });
  }
  function currentVariant() {
    var sel = document.getElementById('variant');
    if (sel) {
      var v = product.variants.find(function (x) { return x.id === sel.value; });
      if (v) return v;
    }
    return buyableVariants()[0] || product.variants[0];
  }

  function render() {
    document.title = product.title + ' — Stuflover Shop';
    images = (product.images && product.images.length) ? product.images : (product.image ? [product.image] : []);
    var mainImg = images[0] || '';
    var out = product.inStock === false;

    var galleryHtml =
      '<div class="detail-gallery">' +
        '<div class="main">' +
          (mainImg ? '<img id="mainImg" src="' + esc(mainImg) + '" alt="' + esc(product.title) + '"/>'
                   : '<div class="card-img-empty" style="margin:auto">No image</div>') +
        '</div>' +
        (images.length > 1 ? '<div class="thumbs">' + images.map(function (u, i) {
          return '<img data-i="' + i + '" class="' + (i === 0 ? 'active' : '') + '" src="' + esc(u) + '" alt=""/>';
        }).join('') + '</div>' : '') +
      '</div>';

    var variantSelect = product.variants.length > 1
      ? '<select id="variant" class="detail-variant">' +
          product.variants.map(function (v) {
            var soldOut = v.available === false;
            return '<option value="' + esc(v.id) + '"' + (soldOut ? ' disabled' : '') + '>' +
              esc(v.title) + ' — ' + fmt(v.priceCents, product.currency) + (soldOut ? ' (Sold out)' : '') + '</option>';
          }).join('') +
        '</select>'
      : '';

    var actionsHtml = out
      ? '<span class="sold-out">Sold out</span>'
      : '<button id="addBtn" class="btn">Add to cart</button>' +
        '<button id="buyBtn" class="btn btn-primary">Buy now</button>';

    document.getElementById('content').innerHTML =
      '<div class="detail">' +
        galleryHtml +
        '<div class="detail-info">' +
          '<h1 class="detail-title">' + esc(product.title) + '</h1>' +
          '<div id="detailPrice" class="detail-price">' + fmt((currentVariant() || product).priceCents || product.priceCents, product.currency) + '</div>' +
          (product.description ? '<div class="detail-desc">' + esc(product.description) + '</div>' : '') +
          (variantSelect ? '<div>' + variantSelect + '</div>' : '') +
          '<div class="detail-actions">' + actionsHtml + '</div>' +
        '</div>' +
      '</div>';

    wireGallery();
    wireActions(out);
  }

  // Thumbnails swap the main image; clicking the main image opens the lightbox.
  function wireGallery() {
    var content = document.getElementById('content');
    Array.prototype.forEach.call(content.querySelectorAll('.thumbs img'), function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(content.querySelectorAll('.thumbs img'), function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        var main = document.getElementById('mainImg');
        if (main) main.src = images[parseInt(t.getAttribute('data-i'), 10)];
      });
    });
    var main = document.getElementById('mainImg');
    if (main) main.addEventListener('click', function () { openLightbox(main.src); });
  }

  function wireActions(out) {
    if (out) return;
    var sel = document.getElementById('variant');
    if (sel) {
      sel.addEventListener('change', function () {
        var v = currentVariant();
        document.getElementById('detailPrice').textContent = fmt(v.priceCents, product.currency);
      });
    }
    document.getElementById('addBtn').addEventListener('click', function () {
      var v = currentVariant();
      if (!v || v.available === false) { toast('That option is sold out'); return; }
      Store.addToCart({
        id: product.id, title: product.title, image: product.image,
        variantId: v.id, variantTitle: v.title, priceCents: v.priceCents,
        available: v.available, currency: product.currency || Store.getCurrency(),
      });
      toast('Added to cart');
    });
    document.getElementById('buyBtn').addEventListener('click', function (e) {
      var v = currentVariant();
      if (!v || v.available === false) { toast('That option is sold out'); return; }
      Store.checkout([{ id: product.id, variantId: v.id, quantity: 1 }], e.currentTarget);
    });
  }

  // ── Lightbox (full-size image) ────────────────────────
  function openLightbox(src) {
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightbox').classList.add('show');
  }
  function closeLightbox() {
    document.getElementById('lightbox').classList.remove('show');
  }
  function wireLightbox() {
    document.getElementById('lightbox').addEventListener('click', closeLightbox);
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
