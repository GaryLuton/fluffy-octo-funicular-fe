(function(){
  function loadCommon(cb){
    if (window.SLShop) return cb();
    var s = document.createElement('script'); s.src='/js/shop-common.js'; s.onload=cb; document.head.appendChild(s);
  }
  loadCommon(init);

  function init(){
    var orderId = parseInt(new URLSearchParams(location.search).get('orderId'));
    var c = document.getElementById('content');
    if (!orderId) { c.innerHTML = '<div class="empty"><div class="bc">No order id</div></div>'; return; }
    if (!SLShop.authed()) { c.innerHTML = '<div class="empty"><div class="bc">Order placed</div><p>Sign in to view receipt.</p></div>'; return; }
    var attempts = 0;
    function poll(){
      SLShop.api('/orders/' + orderId).then(function(r){
        var o = r.order;
        if (o.status === 'paid' || attempts >= 8) {
          render(o);
        } else {
          attempts++;
          setTimeout(poll, 1500);
        }
      }).catch(function(e){
        c.innerHTML = '<div class="empty"><div class="bc">' + SLShop.escapeHtml(e.message) + '</div></div>';
      });
    }
    poll();
  }

  function render(o){
    var paid = o.status === 'paid';
    var c = document.getElementById('content');
    c.innerHTML =
      '<header class="shop-header"><div>' +
        '<div class="shop-eyebrow">Order #' + o.id + '</div>' +
        '<h1 class="shop-title">' + (paid ? 'Thank You!' : 'Processing…') + '</h1>' +
        '<p class="shop-sub">' + (paid ? 'Your order has been received. The seller(s) will be notified.' : 'We\'re finalizing payment. Refresh in a moment if this lingers.') + '</p>' +
      '</div></header>' +
      '<div class="cart-list">' + (o.items || []).map(function(it){
        return '<div class="cart-row">' +
          '<div></div>' +
          '<div><div class="ctitle">' + SLShop.escapeHtml(it.title_snapshot) + '</div></div>' +
          '<div>×' + it.quantity + '</div>' +
          '<div class="card-price">' + SLShop.fmtPrice(it.price_cents_snapshot * it.quantity) + '</div>' +
          '<div></div>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="cart-totals"><div class="cart-total-label">Total</div><div class="cart-total-amt">' + SLShop.fmtPrice(o.total_cents) + '</div></div>';
  }
})();
