// Stuflover Printify storefront (/shopp) — product grid. Cart, drawer and
// checkout live in shopp-common.js (SLStore); this file owns the grid and the
// click-through to each product's detail page.
(function () {
  var Store = window.SLStore;
  var esc = Store.esc, fmt = Store.fmt, toast = Store.toast;

  var products = [];

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
      var detailHref = '/shopp-product.html?id=' + encodeURIComponent(p.id);
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
      var firstAvail = (p.variants.filter(function (v) { return v.available !== false; })[0] || {}).id;
      var variantSelect = p.variants.length > 1
        ? '<select class="variant" data-id="' + esc(p.id) + '">' +
            p.variants.map(function (v) {
              var soldOut = v.available === false;
              return '<option value="' + esc(v.id) + '"' + (soldOut ? ' disabled' : '') +
                (v.id === firstAvail ? ' selected' : '') + '>' +
                esc(v.title) + ' — ' + fmt(v.priceCents, p.currency) + (soldOut ? ' (Sold out)' : '') + '</option>';
            }).join('') +
          '</select>'
        : '';
      var out = p.inStock === false;
      var actionsHtml = out
        ? '<span class="sold-out">Sold out</span>'
        : (variantSelect +
           '<button class="btn btn-sm add" data-id="' + esc(p.id) + '">Add to cart</button>' +
           '<button class="btn btn-primary btn-sm buy" data-id="' + esc(p.id) + '">Buy now</button>');
      var descHtml = p.description
        ? '<div class="card-desc">' + esc(p.description) + '</div>'
        : '';
      // Title links straight through; the image area navigates via JS (it can
      // hold carousel buttons, which aren't valid inside an <a>). The action
      // controls (carousel arrows, variant select, buttons) opt out below.
      return '<div class="card" data-id="' + esc(p.id) + '" data-href="' + esc(detailHref) + '">' +
        '<div class="card-img card-link">' + imgHtml + '</div>' +
        '<div class="card-body">' +
          '<a class="card-title" href="' + esc(detailHref) + '">' + esc(p.title) + '</a>' +
          descHtml +
          '<div class="card-price">' + fmt(p.priceCents, p.currency) + '</div>' +
          '<div class="card-actions">' +
            actionsHtml +
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
      available: variant.available,
      currency: prod.currency || Store.getCurrency(),
    };
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  // ── Events ────────────────────────────────────────────
  function wire() {
    document.getElementById('grid').addEventListener('click', function (e) {
      var nav = e.target.closest('.carousel-nav');
      if (nav) {
        e.preventDefault();
        var track = nav.parentElement.querySelector('.card-carousel');
        if (track) track.scrollBy({ left: Number(nav.dataset.dir) * track.clientWidth, behavior: 'smooth' });
        return;
      }
      var add = e.target.closest('.add');
      var buy = e.target.closest('.buy');
      if (add) {
        var choice = variantChoiceFor(add.dataset.id);
        if (choice && choice.available === false) { toast('That option is sold out'); return; }
        if (choice) { Store.addToCart(choice); toast('Added to cart'); }
        return;
      }
      if (buy) {
        var c = variantChoiceFor(buy.dataset.id);
        if (c && c.available === false) { toast('That option is sold out'); return; }
        if (c) Store.checkout([{ id: c.id, variantId: c.variantId, quantity: 1 }], buy);
        return;
      }
      // Click anywhere on the image area opens the product detail page.
      var link = e.target.closest('.card-link');
      if (link) {
        var card = link.closest('.card');
        if (card && card.dataset.href) window.location.href = card.dataset.href;
      }
    });
  }

  // ── Init ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    wire();
    Store.wireDrawer();
    Store.renderCart();
    Store.handleReturn('/shopp.html');
    Store.api('/products')
      .then(function (r) {
        products = r.products || [];
        if (products[0] && products[0].currency) Store.setCurrency(products[0].currency);
        if (r.demo) document.getElementById('demoBanner').style.display = '';
        renderGrid();
        Store.renderCart();
      })
      .catch(function (e) {
        document.getElementById('grid').innerHTML =
          '<div class="empty"><div class="bc">Could not load products</div><p>' + esc(e.message) + '</p></div>';
      });
  });
})();
