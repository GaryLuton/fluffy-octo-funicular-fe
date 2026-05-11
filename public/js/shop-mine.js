(function(){
  function loadCommon(cb){
    if (window.SLShop) return cb();
    var s = document.createElement('script'); s.src='/js/shop-common.js'; s.onload=cb; document.head.appendChild(s);
  }
  loadCommon(init);

  function init(){
    if (!SLShop.authed()) {
      document.getElementById('content').innerHTML = '<div class="empty"><div class="bc">Sign in to manage your shop</div><a class="btn btn-primary" href="/auth.html?return=' + encodeURIComponent(location.pathname) + '" style="margin-top:14px;">Sign in</a></div>';
      return;
    }
    SLShop.api('/shops/me').then(function(r){
      if (!r.shop) { location.replace('/shop-create.html'); return; }
      renderDashboard(r.shop, r.products || []);
    }).catch(function(e){
      document.getElementById('content').innerHTML = '<div class="empty">' + SLShop.escapeHtml(e.message) + '</div>';
    });
  }

  function renderOpenShop(){
    document.getElementById('content').innerHTML =
      '<header class="shop-header"><div>' +
        '<div class="shop-eyebrow">Sellers</div>' +
        '<h1 class="shop-title">Open Your Shop</h1>' +
        '<p class="shop-sub">Pick a name and write a quick intro. You can edit anything later.</p>' +
      '</div></header>' +
      '<div style="max-width:520px;">' +
        '<div class="form-row"><label>Shop name</label><input id="shopName" maxlength="80" placeholder="Sunbeam Studio"/></div>' +
        '<div class="form-row"><label>Bio</label><textarea id="shopBio" maxlength="500" placeholder="What do you make?"></textarea></div>' +
        '<button id="openBtn" class="btn btn-primary">Open shop</button>' +
      '</div>';
    document.getElementById('openBtn').addEventListener('click', function(){
      var name = document.getElementById('shopName').value.trim();
      var bio = document.getElementById('shopBio').value.trim();
      if (!name) { SLShop.toast('Name required'); return; }
      SLShop.api('/shops', { method:'POST', body:{ name: name, bio: bio } })
        .then(function(){ location.reload(); })
        .catch(function(e){ SLShop.toast(e.message); });
    });
  }

  function renderDashboard(shop, products){
    var c = document.getElementById('content');
    c.innerHTML =
      '<header class="shop-header"><div>' +
        '<div class="shop-eyebrow">Your Shop</div>' +
        '<h1 class="shop-title">' + SLShop.escapeHtml(shop.name) + '</h1>' +
        '<p class="shop-sub">' + SLShop.escapeHtml(shop.bio || '') + '</p>' +
        '<div style="font-size:0.78rem;opacity:0.5;margin-top:6px;">stuflover.com/shop?shop=' + SLShop.escapeHtml(shop.slug) + '</div>' +
      '</div><div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button id="editShopBtn" class="btn btn-ghost">Edit shop</button>' +
        '<button id="addBtn" class="btn btn-primary">+ Add Product</button>' +
      '</div></header>' +
      '<div id="addForm" style="display:none;max-width:640px;margin-bottom:32px;padding:24px;border:1.5px solid rgba(128,128,128,0.18);border-radius:12px;">' +
        '<div class="section-title" id="formTitle">New Product</div>' +
        '<input type="hidden" id="editId"/>' +
        '<div class="form-row"><label>Title</label><input id="pTitle" maxlength="200"/></div>' +
        '<div class="form-row"><label>Description</label><textarea id="pDesc" maxlength="4000"></textarea></div>' +
        '<div class="form-row"><label>Price (USD)</label><input id="pPrice" type="number" min="0.50" step="0.01" placeholder="19.99"/></div>' +
        '<div class="form-row"><label>Image URLs (one per line, max 8)</label><textarea id="pImgs" placeholder="https://…"></textarea></div>' +
        '<div class="form-row"><label>Category</label>' +
          '<select id="pCat"><option value="">—</option><option>Apparel</option><option>Jewelry</option><option>Art</option><option>Home</option><option>Vintage</option><option>Craft</option><option>Digital</option><option>Other</option></select>' +
        '</div>' +
        '<div class="form-row"><label>Tags (comma-separated)</label><input id="pTags" maxlength="200"/></div>' +
        '<div class="form-row"><label>Stock</label><input id="pStock" type="number" min="0" value="1"/></div>' +
        '<div style="display:flex;gap:8px;"><button id="saveBtn" class="btn btn-primary">Save</button><button id="cancelBtn" class="btn btn-ghost">Cancel</button></div>' +
      '</div>' +
      '<div class="section-title">Your Products (' + products.length + ')</div>' +
      '<div id="prodGrid" class="grid"></div>' +
      '<div class="section"><div class="section-title">Recent Sales</div><div id="orders"></div></div>';

    var grid = c.querySelector('#prodGrid');
    if (!products.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1;">No products yet. Click <strong>Add Product</strong> to start.</div>';
    } else {
      products.forEach(function(p){
        var img = (p.image_urls && p.image_urls[0]) || '';
        var d = document.createElement('div');
        d.className = 'card';
        d.innerHTML =
          '<div class="card-img">' + (img ? '<img src="' + SLShop.escapeHtml(img) + '"/>' : '<div class="card-img-empty">No image</div>') + '</div>' +
          '<div class="card-body">' +
            '<div class="card-title">' + SLShop.escapeHtml(p.title) + '</div>' +
            '<div class="card-shop">' + (p.status || 'active') + ' · ' + (p.stock != null ? p.stock + ' in stock' : '') + '</div>' +
            '<div class="card-price">' + SLShop.fmtPrice(p.price_cents) + '</div>' +
            '<div style="display:flex;gap:6px;margin-top:8px;">' +
              '<button class="btn btn-ghost editP" data-id="' + p.id + '" style="padding:6px 12px;font-size:0.7rem;">Edit</button>' +
              '<button class="btn btn-ghost delP" data-id="' + p.id + '" style="padding:6px 12px;font-size:0.7rem;">Delete</button>' +
            '</div>' +
          '</div>';
        grid.appendChild(d);
      });
      Array.prototype.forEach.call(grid.querySelectorAll('.delP'), function(b){
        b.addEventListener('click', function(){
          if (!confirm('Delete this product?')) return;
          SLShop.api('/products/' + b.getAttribute('data-id'), { method:'DELETE' }).then(function(){ location.reload(); }).catch(function(e){ SLShop.toast(e.message); });
        });
      });
      Array.prototype.forEach.call(grid.querySelectorAll('.editP'), function(b){
        b.addEventListener('click', function(){
          var id = parseInt(b.getAttribute('data-id'));
          var p = products.find(function(x){ return x.id === id; });
          if (!p) return;
          document.getElementById('addForm').style.display = '';
          document.getElementById('formTitle').textContent = 'Edit Product';
          document.getElementById('editId').value = id;
          document.getElementById('pTitle').value = p.title;
          document.getElementById('pDesc').value = p.description || '';
          document.getElementById('pPrice').value = (p.price_cents / 100).toFixed(2);
          document.getElementById('pImgs').value = (p.image_urls || []).join('\n');
          document.getElementById('pCat').value = p.category || '';
          document.getElementById('pTags').value = p.tags || '';
          document.getElementById('pStock').value = p.stock;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
    }

    c.querySelector('#addBtn').addEventListener('click', function(){
      document.getElementById('addForm').style.display = '';
      document.getElementById('formTitle').textContent = 'New Product';
      document.getElementById('editId').value = '';
      ['pTitle','pDesc','pPrice','pImgs','pTags'].forEach(function(id){ document.getElementById(id).value = ''; });
      document.getElementById('pCat').value = '';
      document.getElementById('pStock').value = '1';
    });
    c.querySelector('#cancelBtn').addEventListener('click', function(){
      document.getElementById('addForm').style.display = 'none';
    });
    c.querySelector('#saveBtn').addEventListener('click', function(){
      var imgs = document.getElementById('pImgs').value.split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean);
      var body = {
        title: document.getElementById('pTitle').value.trim(),
        description: document.getElementById('pDesc').value.trim(),
        priceCents: Math.round(parseFloat(document.getElementById('pPrice').value) * 100),
        imageUrls: imgs,
        category: document.getElementById('pCat').value,
        tags: document.getElementById('pTags').value.trim(),
        stock: parseInt(document.getElementById('pStock').value) || 0
      };
      var editId = document.getElementById('editId').value;
      var p = editId
        ? SLShop.api('/products/' + editId, { method:'PATCH', body: body })
        : SLShop.api('/products', { method:'POST', body: body });
      p.then(function(){ location.reload(); }).catch(function(e){ SLShop.toast(e.message); });
    });

    c.querySelector('#editShopBtn').addEventListener('click', function(){
      var name = prompt('Shop name', shop.name);
      if (name == null) return;
      var bio = prompt('Bio', shop.bio || '');
      if (bio == null) return;
      SLShop.api('/shops/me', { method:'PATCH', body:{ name: name, bio: bio } })
        .then(function(){ location.reload(); }).catch(function(e){ SLShop.toast(e.message); });
    });

    SLShop.api('/orders/seller').then(function(r){
      var ord = document.getElementById('orders');
      if (!r.items || !r.items.length) { ord.innerHTML = '<div style="opacity:0.5;font-style:italic;">No sales yet.</div>'; return; }
      ord.innerHTML = '<div class="cart-list">' + r.items.map(function(it){
        return '<div class="cart-row"><div></div><div><div class="ctitle">' + SLShop.escapeHtml(it.title_snapshot) + '</div><div class="cshop">to ' + SLShop.escapeHtml(it.buyer_username) + ' · ' + new Date(it.ordered_at + 'Z').toLocaleString() + '</div></div><div>×' + it.quantity + '</div><div class="card-price">' + SLShop.fmtPrice(it.price_cents_snapshot * it.quantity) + '</div><div></div></div>';
      }).join('') + '</div>';
    }).catch(function(){});
  }
})();
