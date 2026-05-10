// Stuflover Shop — shared client helpers
(function(){
  if (window.SLShop) return;
  function token(){ return localStorage.getItem('stuflover_token') || ''; }
  function authed(){ return !!token(); }
  function api(path, opts){
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      if (typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    }
    if (authed()) headers['Authorization'] = 'Bearer ' + token();
    return fetch('/api/shop' + path, Object.assign({}, opts, { headers: headers }))
      .then(function(r){
        return r.json().then(function(j){
          if (!r.ok) throw new Error(j && j.error || ('HTTP ' + r.status));
          return j;
        });
      });
  }
  function fmtPrice(cents, cur){
    var n = (cents || 0) / 100;
    var c = (cur || 'USD').toUpperCase();
    try { return new Intl.NumberFormat('en-US', { style:'currency', currency:c }).format(n); }
    catch(e){ return '$' + n.toFixed(2); }
  }
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function toast(msg){
    var t = document.getElementById('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__slShopToast);
    window.__slShopToast = setTimeout(function(){ t.classList.remove('show'); }, 2200);
  }
  function requireAuthThen(actionLabel){
    if (authed()) return true;
    var go = confirm((actionLabel || 'Continue') + ' — please sign in first. Go to sign-in?');
    if (go) location.href = '/auth.html?return=' + encodeURIComponent(location.pathname + location.search);
    return false;
  }
  function refreshCartCount(){
    if (!authed()) return;
    api('/cart').then(function(r){
      var n = (r.items || []).reduce(function(a,it){ return a + (it.quantity||1); }, 0);
      var el = document.getElementById('cartCount');
      if (el) el.textContent = n ? '(' + n + ')' : '';
    }).catch(function(){});
  }
  window.SLShop = {
    api: api, token: token, authed: authed,
    fmtPrice: fmtPrice, escapeHtml: escapeHtml,
    toast: toast, requireAuthThen: requireAuthThen,
    refreshCartCount: refreshCartCount
  };
})();
