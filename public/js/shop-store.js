// Public storefront for a single shop. URL: /shop-store.html?shop=<slug>[&new=1]
(function(){
  var c = document.getElementById('content');
  var qs = new URLSearchParams(location.search);
  var slug = qs.get('shop');
  var isNew = qs.get('new') === '1';

  if (!slug) {
    c.innerHTML = '<div class="shop-wrap"><div class="empty"><div class="bc">no shop specified</div><a class="btn btn-primary" href="/shop.html" style="margin-top:14px;">Browse the shop</a></div></div>';
    return;
  }

  SLShop.api('/shops/' + encodeURIComponent(slug)).then(function(r){
    render(r.shop, r.products || []);
  }).catch(function(){
    c.innerHTML = '<div class="shop-wrap"><div class="empty"><div class="bc">shop not found</div><p>This shop might have been removed or the link is wrong.</p><a class="btn btn-primary" href="/shop.html" style="margin-top:14px;">Browse the shop</a></div></div>';
  });

  function initials(name){
    return String(name || '?').trim().split(/\s+/).map(function(w){ return w[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?';
  }

  function parseCats(s){
    try { var v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch(e){ return []; }
  }

  function kindLabel(k){
    return ({
      handmade: 'handmade',
      vintage:  'vintage',
      digital:  'digital',
      reseller: 'curated picks',
      mixed:    'a mix of things',
    })[k] || '';
  }

  function render(shop, products){
    document.title = shop.name + ' — Stuflover Shop';

    var cats = parseCats(shop.categories);
    var kind = kindLabel(shop.product_kind);
    var token = SLShop.token();
    // The /shops/:slug endpoint returns the owner's user_id via the join on
    // the username column — but we don't currently expose user_id, so we
    // infer ownership by re-calling /shops/me when the visitor is signed in.
    var isOwnerCheck = token
      ? SLShop.api('/shops/me').then(function(me){ return me.shop && me.shop.id === shop.id; }).catch(function(){ return false; })
      : Promise.resolve(false);

    isOwnerCheck.then(function(isOwner){
      var shareUrl = location.origin + '/shop-store.html?shop=' + encodeURIComponent(shop.slug);

      var html = '';
      html += '<section class="store-hero">';
      html +=   '<div class="store-avatar">' + (shop.avatar_url
                  ? '<img src="' + SLShop.escapeHtml(shop.avatar_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>'
                  : SLShop.escapeHtml(initials(shop.name))) + '</div>';
      html +=   '<h1 class="store-name">' + SLShop.escapeHtml(shop.name) + '</h1>';
      if (shop.handle) html += '<div class="store-handle">@' + SLShop.escapeHtml(shop.handle) + '</div>';
      if (shop.bio) html += '<p class="store-bio">' + SLShop.escapeHtml(shop.bio) + '</p>';

      var tagBits = [];
      if (kind) tagBits.push(kind);
      cats.forEach(function(c){ tagBits.push(c); });
      if (tagBits.length) {
        html += '<div class="store-tags">' + tagBits.map(function(t){
          return '<span class="store-tag">' + SLShop.escapeHtml(t) + '</span>';
        }).join('') + '</div>';
      }
      if (shop.ships_from) html += '<div class="store-meta">ships from ' + SLShop.escapeHtml(shop.ships_from) + '</div>';

      if (isOwner) {
        html += '<div class="store-owner-bar">' +
          '<a class="btn btn-primary" href="/shop-mine.html">manage shop →</a>' +
          '<a class="btn btn-ghost" href="/shop.html">browse marketplace</a>' +
        '</div>';
      }
      html += '</section>';

      if (isOwner && isNew) {
        html += '<div class="welcome" id="welcome">' +
          '<div class="welcome-emoji">🎉</div>' +
          '<div>' +
            '<h3>welcome to your shop!</h3>' +
            '<p>this is exactly what buyers will see. it\'s a little empty right now — add your first product and you\'re officially in business 🌷</p>' +
            '<div class="welcome-actions">' +
              '<a class="btn btn-primary" href="/shop-mine.html">+ add your first product</a>' +
              '<a class="btn btn-ghost" href="javascript:navigator.clipboard.writeText(\'' + shareUrl.replace(/'/g, "\\'") + '\').then(function(){SLShop.toast(\'link copied!\')})">share your link</a>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      html += '<main class="shop-wrap">';

      if (!products.length) {
        if (isOwner) {
          html += '<div class="store-empty">' +
            '<div class="icon">🌱</div>' +
            '<h3>your first listing goes here</h3>' +
            '<p>once you add a product it\'ll show up in this spot. you can list anything — start with one, see how it feels.</p>' +
            '<a class="btn btn-primary" href="/shop-mine.html">+ add a product</a>' +
          '</div>';
        } else {
          html += '<div class="store-empty">' +
            '<div class="icon">🪴</div>' +
            '<h3>nothing listed yet</h3>' +
            '<p>this shop is just getting started. check back soon!</p>' +
          '</div>';
        }
      } else {
        html += '<div class="reveal section-bar">' +
          '<div><div class="section-eyebrow">listings</div><h2 class="section-h2">' + products.length + ' ' + (products.length === 1 ? 'item' : 'items') + '</h2></div>' +
        '</div>';
        html += '<div class="grid">' + products.map(function(p){
          var img = (p.image_urls && p.image_urls[0]) || '';
          return '<a class="card" href="/shop-product.html?id=' + p.id + '">' +
            '<div class="card-img">' +
              (img ? '<img loading="lazy" alt="" src="' + SLShop.escapeHtml(img) + '"/>' : '<div class="card-img-empty">No image</div>') +
            '</div>' +
            '<div class="card-body">' +
              '<div class="card-title">' + SLShop.escapeHtml(p.title) + '</div>' +
              '<div class="card-price">' + SLShop.fmtPrice(p.price_cents, p.currency) + '</div>' +
            '</div>' +
          '</a>';
        }).join('') + '</div>';
      }

      // Share box — useful to everyone, but specially highlighted for owners
      html += '<div class="store-share">' +
        '<span class="label">share</span>' +
        '<span class="url" id="shareUrl">' + SLShop.escapeHtml(shareUrl) + '</span>' +
        '<button class="btn btn-ghost" id="copyBtn" style="padding:8px 16px;font-size:0.7rem;letter-spacing:2px;">copy link</button>' +
      '</div>';

      html += '</main>';

      c.innerHTML = html;

      var copy = document.getElementById('copyBtn');
      if (copy) copy.addEventListener('click', function(){
        navigator.clipboard.writeText(shareUrl).then(function(){
          copy.textContent = 'copied!';
          SLShop.toast('link copied!');
          setTimeout(function(){ copy.textContent = 'copy link'; }, 1800);
        }).catch(function(){ SLShop.toast('copy failed — try again?'); });
      });

      if (isOwner && isNew) launchConfetti();
    });
  }

  function launchConfetti(){
    var layer = document.createElement('div');
    layer.className = 'confetti-layer';
    document.body.appendChild(layer);
    var colors = ['#c87860','#a86050','#f0ddd6','#e8d5c8','#fbe8ec','#fcead2'];
    for (var i = 0; i < 80; i++) {
      var b = document.createElement('div');
      b.className = 'confetti-bit';
      b.style.left = (Math.random() * 100) + '%';
      b.style.background = colors[Math.floor(Math.random() * colors.length)];
      b.style.setProperty('--dx', ((Math.random() - 0.5) * 200) + 'px');
      b.style.setProperty('--rot', (360 + Math.random() * 720) + 'deg');
      b.style.animationDuration = (2 + Math.random() * 2) + 's';
      b.style.animationDelay = (Math.random() * 0.5) + 's';
      b.style.opacity = 0.85;
      layer.appendChild(b);
    }
    setTimeout(function(){ layer.remove(); }, 4500);
  }
})();
