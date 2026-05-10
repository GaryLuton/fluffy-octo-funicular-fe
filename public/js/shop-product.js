(function(){
  function loadCommon(cb){
    if (window.SLShop) return cb();
    var s = document.createElement('script'); s.src='/js/shop-common.js'; s.onload=cb; document.head.appendChild(s);
  }
  loadCommon(init);

  function init(){
    SLShop.refreshCartCount();
    var id = parseInt(new URLSearchParams(location.search).get('id'));
    if (!id) { document.getElementById('content').innerHTML = '<div class="empty"><div class="bc">Not found</div></div>'; return; }
    SLShop.api('/products/' + id).then(render).catch(function(e){
      document.getElementById('content').innerHTML = '<div class="empty"><div class="bc">' + SLShop.escapeHtml(e.message) + '</div></div>';
    });
  }

  function render(data){
    var p = data.product, reviews = data.reviews || [];
    document.title = p.title + ' — Stuflover Shop';
    var imgs = p.image_urls && p.image_urls.length ? p.image_urls : [];
    var mainImg = imgs[0] || '';
    var c = document.getElementById('content');
    c.innerHTML =
      '<div class="detail">' +
        '<div class="detail-gallery">' +
          '<div class="main">' + (mainImg ? '<img id="mainImg" src="' + SLShop.escapeHtml(mainImg) + '" alt=""/>' : '<div class="card-img-empty" style="margin:auto">No image</div>') + '</div>' +
          (imgs.length > 1 ? '<div class="thumbs">' + imgs.map(function(u, i){
            return '<img data-i="' + i + '" class="' + (i === 0 ? 'active' : '') + '" src="' + SLShop.escapeHtml(u) + '" alt=""/>';
          }).join('') + '</div>' : '') +
        '</div>' +
        '<div class="detail-info">' +
          '<div class="detail-shop">From <a href="/shop?shop=' + encodeURIComponent(p.shop_slug) + '">' + SLShop.escapeHtml(p.shop_name) + '</a></div>' +
          '<h1 class="detail-title">' + SLShop.escapeHtml(p.title) + '</h1>' +
          '<div class="detail-price">' + SLShop.fmtPrice(p.price_cents, p.currency) + '</div>' +
          '<div class="detail-desc">' + SLShop.escapeHtml(p.description || '') + '</div>' +
          (p.stock != null ? '<div style="font-size:0.8rem;opacity:0.5;">' + (p.stock > 0 ? p.stock + ' in stock' : 'Sold out') + '</div>' : '') +
          '<div class="detail-actions">' +
            '<input id="qty" class="qty" type="number" min="1" max="' + Math.max(1, p.stock || 99) + '" value="1"/>' +
            '<button id="addBtn" class="btn btn-primary" ' + (p.stock === 0 ? 'disabled' : '') + '>Add to Cart</button>' +
            '<button id="favBtn" class="btn btn-ghost" title="Favorite">♡</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<section class="section">' +
        '<div class="section-title">Reviews (' + reviews.length + ')</div>' +
        (reviews.length ? reviews.map(function(r){
          return '<div class="review"><div class="review-head"><strong>' + SLShop.escapeHtml(r.username) + '</strong><span class="stars">' + '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) + '</span></div><div>' + SLShop.escapeHtml(r.text || '') + '</div></div>';
        }).join('') : '<div style="opacity:0.5;font-style:italic;">No reviews yet.</div>') +
      '</section>';

    Array.prototype.forEach.call(c.querySelectorAll('.thumbs img'), function(t){
      t.addEventListener('click', function(){
        Array.prototype.forEach.call(c.querySelectorAll('.thumbs img'), function(x){ x.classList.remove('active'); });
        t.classList.add('active');
        document.getElementById('mainImg').src = imgs[parseInt(t.getAttribute('data-i'))];
      });
    });

    document.getElementById('addBtn').addEventListener('click', function(){
      if (!SLShop.requireAuthThen('Add to cart')) return;
      var q = Math.max(1, parseInt(document.getElementById('qty').value) || 1);
      SLShop.api('/cart', { method:'POST', body:{ productId: p.id, quantity: q } })
        .then(function(){ SLShop.toast('Added to cart'); SLShop.refreshCartCount(); })
        .catch(function(e){ SLShop.toast(e.message); });
    });
    document.getElementById('favBtn').addEventListener('click', function(){
      if (!SLShop.requireAuthThen('Favorite')) return;
      SLShop.api('/favorites/' + p.id, { method:'POST' })
        .then(function(){ SLShop.toast('Favorited'); }).catch(function(e){ SLShop.toast(e.message); });
    });
  }
})();
