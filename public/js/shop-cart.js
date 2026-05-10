(function(){
  function loadCommon(cb){
    if (window.SLShop) return cb();
    var s = document.createElement('script'); s.src='/js/shop-common.js'; s.onload=cb; document.head.appendChild(s);
  }
  loadCommon(init);

  function init(){
    if (!SLShop.authed()) {
      document.getElementById('cart').innerHTML = '<div class="empty"><div class="bc">Sign in to view your cart</div><a class="btn btn-primary" href="/auth.html?return=' + encodeURIComponent(location.pathname) + '" style="margin-top:14px;">Sign in</a></div>';
      return;
    }
    load();
  }

  function load(){
    SLShop.api('/cart').then(render).catch(function(e){
      document.getElementById('cart').innerHTML = '<div class="empty">' + SLShop.escapeHtml(e.message) + '</div>';
    });
  }

  function render(data){
    var items = data.items || [];
    var c = document.getElementById('cart');
    if (!items.length) {
      c.innerHTML = '<div class="empty"><div class="bc">Your cart is empty</div><a class="btn btn-primary" href="/shop" style="margin-top:14px;">Browse the shop</a></div>';
      return;
    }
    c.innerHTML =
      '<div class="cart-list">' + items.map(function(it){
        var img = (it.image_urls && it.image_urls[0]) || '';
        return '<div class="cart-row" data-id="' + it.id + '">' +
          (img ? '<img src="' + SLShop.escapeHtml(img) + '" alt=""/>' : '<div class="card-img-empty" style="width:88px;height:88px;display:flex;align-items:center;justify-content:center;">No img</div>') +
          '<div><div class="ctitle">' + SLShop.escapeHtml(it.title) + '</div><div class="cshop">' + SLShop.escapeHtml(it.shop_name) + '</div></div>' +
          '<input type="number" class="qty cart-qty" min="1" max="99" value="' + it.quantity + '" data-id="' + it.id + '"/>' +
          '<div class="card-price">' + SLShop.fmtPrice(it.price_cents * it.quantity, it.currency) + '</div>' +
          '<button class="btn btn-ghost cart-remove" data-id="' + it.id + '">Remove</button>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="cart-totals">' +
        '<div class="cart-total-label">Subtotal</div>' +
        '<div class="cart-total-amt">' + SLShop.fmtPrice(data.totalCents) + '</div>' +
        '<button id="checkoutBtn" class="btn btn-primary">Checkout</button>' +
      '</div>';

    Array.prototype.forEach.call(c.querySelectorAll('.cart-qty'), function(inp){
      inp.addEventListener('change', function(){
        var pid = parseInt(inp.getAttribute('data-id'));
        var q = Math.max(1, parseInt(inp.value) || 1);
        SLShop.api('/cart', { method:'POST', body:{ productId: pid, quantity: q } })
          .then(load).catch(function(e){ SLShop.toast(e.message); });
      });
    });
    Array.prototype.forEach.call(c.querySelectorAll('.cart-remove'), function(b){
      b.addEventListener('click', function(){
        var pid = parseInt(b.getAttribute('data-id'));
        SLShop.api('/cart/' + pid, { method:'DELETE' }).then(load).catch(function(e){ SLShop.toast(e.message); });
      });
    });
    document.getElementById('checkoutBtn').addEventListener('click', function(){
      this.disabled = true; this.textContent = 'Redirecting…';
      SLShop.api('/checkout', { method:'POST' })
        .then(function(r){ if (r.url) location.href = r.url; })
        .catch(function(e){ SLShop.toast(e.message); document.getElementById('checkoutBtn').disabled = false; document.getElementById('checkoutBtn').textContent = 'Checkout'; });
    });
  }
})();
