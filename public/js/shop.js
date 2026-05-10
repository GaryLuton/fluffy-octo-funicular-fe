// Shop landing — product browse
(function(){
  function loadCommon(cb){
    if (window.SLShop) return cb();
    var s = document.createElement('script');
    s.src = '/js/shop-common.js';
    s.onload = cb;
    document.head.appendChild(s);
  }
  loadCommon(init);

  var CATEGORIES = ['All','Apparel','Jewelry','Art','Home','Vintage','Craft','Digital','Other'];
  var state = { q:'', sort:'new', category:'' };

  function init(){
    SLShop.refreshCartCount();
    renderChips();
    document.getElementById('q').addEventListener('input', debounce(function(e){
      state.q = e.target.value.trim(); load();
    }, 300));
    document.getElementById('sort').addEventListener('change', function(e){
      state.sort = e.target.value; load();
    });
    load();
  }

  function debounce(fn, ms){ var t; return function(){ var a=arguments,c=this; clearTimeout(t); t=setTimeout(function(){ fn.apply(c,a); }, ms); }; }

  function renderChips(){
    var c = document.getElementById('chips');
    c.innerHTML = '';
    CATEGORIES.forEach(function(cat){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + ((state.category === '' && cat === 'All') || state.category === cat ? ' active' : '');
      b.textContent = cat;
      b.addEventListener('click', function(){
        state.category = cat === 'All' ? '' : cat;
        renderChips();
        load();
      });
      c.appendChild(b);
    });
  }

  function load(){
    var qs = new URLSearchParams();
    if (state.q) qs.set('q', state.q);
    if (state.category) qs.set('category', state.category);
    if (state.sort) qs.set('sort', state.sort);
    SLShop.api('/products?' + qs.toString())
      .then(function(r){ render(r.products || []); })
      .catch(function(e){ SLShop.toast('Failed to load: ' + e.message); });
  }

  function render(products){
    var grid = document.getElementById('grid');
    var empty = document.getElementById('empty');
    grid.innerHTML = '';
    if (!products.length) { empty.style.display = ''; return; }
    empty.style.display = 'none';
    products.forEach(function(p){
      var img = (p.image_urls && p.image_urls[0]) || '';
      var a = document.createElement('a');
      a.className = 'card';
      a.href = '/shop-product?id=' + p.id;
      a.innerHTML =
        '<div class="card-img">' +
          (img ? '<img loading="lazy" alt="" src="' + SLShop.escapeHtml(img) + '"/>' : '<div class="card-img-empty">No image</div>') +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-title">' + SLShop.escapeHtml(p.title) + '</div>' +
          '<div class="card-shop">' + SLShop.escapeHtml(p.shop_name || '') + '</div>' +
          '<div class="card-price">' + SLShop.fmtPrice(p.price_cents, p.currency) + '</div>' +
        '</div>';
      grid.appendChild(a);
    });
  }
})();
