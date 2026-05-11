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
        (shop.handle ? '<div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;letter-spacing:2px;text-transform:uppercase;font-size:0.72rem;color:var(--shop-terracotta);margin-bottom:6px;">@' + SLShop.escapeHtml(shop.handle) + '</div>' : '') +
        '<p class="shop-sub">' + SLShop.escapeHtml(shop.bio || '') + '</p>' +
        (function(){
          var bits = [];
          if (shop.product_kind) bits.push(shop.product_kind.replace('-', ' '));
          try { var cats = JSON.parse(shop.categories || '[]'); if (Array.isArray(cats) && cats.length) bits.push(cats.join(', ')); } catch(e){}
          if (shop.ships_from) bits.push('ships from ' + shop.ships_from);
          return bits.length ? '<div style="font-size:0.85rem;opacity:0.6;margin-top:6px;">' + SLShop.escapeHtml(bits.join(' · ')) + '</div>' : '';
        })() +
        '<div style="font-size:0.78rem;opacity:0.5;margin-top:6px;">stuflover.com/shop-store.html?shop=' + SLShop.escapeHtml(shop.slug) + '</div>' +
      '</div><div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<a class="btn btn-ghost" href="/shop-store.html?shop=' + encodeURIComponent(shop.slug) + '">View storefront →</a>' +
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

    c.querySelector('#editShopBtn').addEventListener('click', function(){ openShopEditor(shop); });

    SLShop.api('/orders/seller').then(function(r){
      var ord = document.getElementById('orders');
      if (!r.items || !r.items.length) { ord.innerHTML = '<div style="opacity:0.5;font-style:italic;">No sales yet.</div>'; return; }
      ord.innerHTML = '<div class="cart-list">' + r.items.map(function(it){
        return '<div class="cart-row"><div></div><div><div class="ctitle">' + SLShop.escapeHtml(it.title_snapshot) + '</div><div class="cshop">to ' + SLShop.escapeHtml(it.buyer_username) + ' · ' + new Date(it.ordered_at + 'Z').toLocaleString() + '</div></div><div>×' + it.quantity + '</div><div class="card-price">' + SLShop.fmtPrice(it.price_cents_snapshot * it.quantity) + '</div><div></div></div>';
      }).join('') + '</div>';
    }).catch(function(){});
  }

  var CATEGORIES = ['Apparel','Jewelry','Art','Home','Vintage','Craft','Digital','Other'];
  var KINDS = [
    { id:'handmade',  label:'Handmade' },
    { id:'vintage',   label:'Vintage / Thrift' },
    { id:'digital',   label:'Digital' },
    { id:'reseller',  label:'Reseller' },
    { id:'mixed',     label:'A mix' },
  ];
  var EXPERIENCE = [
    { id:'hobby',       label:'Just a hobby' },
    { id:'side-hustle', label:'A side hustle' },
    { id:'full-time',   label:'Full-time' },
  ];

  function openShopEditor(shop){
    var cats = [];
    try { cats = JSON.parse(shop.categories || '[]'); if (!Array.isArray(cats)) cats = []; } catch(e) {}
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(30,12,6,0.55);backdrop-filter:blur(6px);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:24px;padding:32px;max-width:560px;width:100%;box-shadow:0 20px 60px rgba(30,12,6,0.25);">' +
        '<h2 class="bc" style="font-size:1.8rem;margin-bottom:6px;">Edit your shop</h2>' +
        '<p style="color:rgba(42,26,20,0.55);margin-bottom:20px;font-size:0.9rem;">Everything you set up in the wizard — change any of it.</p>' +
        '<div class="form-row"><label>Shop name</label><input id="eName" maxlength="80" value="' + SLShop.escapeHtml(shop.name || '') + '"/></div>' +
        '<div class="form-row"><label>Username</label>' +
          '<div style="display:flex;align-items:center;gap:0;border:2px solid rgba(42,26,20,0.12);border-radius:14px;overflow:hidden;">' +
            '<span style="padding:13px 4px 13px 16px;color:rgba(42,26,20,0.45);">@</span>' +
            '<input id="eHandle" maxlength="30" value="' + SLShop.escapeHtml(shop.handle || '') + '" style="flex:1;border:none;outline:none;padding:13px 16px 13px 0;font:inherit;background:transparent;"/>' +
          '</div>' +
          '<div class="hint" id="eHandleHint" style="font-size:0.78rem;margin-top:6px;color:rgba(42,26,20,0.5);min-height:18px;"></div>' +
        '</div>' +
        '<div class="form-row"><label>Bio</label><textarea id="eBio" maxlength="500">' + SLShop.escapeHtml(shop.bio || '') + '</textarea></div>' +
        '<div class="form-row"><label>Ships from</label><input id="eShips" maxlength="60" value="' + SLShop.escapeHtml(shop.ships_from || '') + '"/></div>' +
        '<div class="form-row"><label>What you sell</label>' +
          '<select id="eKind">' +
            '<option value="">—</option>' +
            KINDS.map(function(k){ return '<option value="' + k.id + '"' + (shop.product_kind === k.id ? ' selected' : '') + '>' + k.label + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div class="form-row"><label>Categories (tap up to 4)</label>' +
          '<div id="eCatChips" style="display:flex;flex-wrap:wrap;gap:8px;">' +
            CATEGORIES.map(function(c){
              var active = cats.indexOf(c) !== -1;
              return '<button type="button" data-cat="' + c + '" class="chip-pick' + (active ? ' active' : '') + '" style="padding:8px 14px;border-radius:50px;border:2px solid ' + (active ? '#c87860' : 'rgba(42,26,20,0.12)') + ';background:' + (active ? '#c87860' : '#fff') + ';color:' + (active ? '#fff' : 'inherit') + ';font-family:\'Barlow Condensed\',sans-serif;font-weight:900;letter-spacing:2px;text-transform:uppercase;font-size:0.7rem;cursor:pointer;">' + c + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="form-row"><label>How serious is this for you?</label>' +
          '<select id="eExp">' +
            '<option value="">—</option>' +
            EXPERIENCE.map(function(e){ return '<option value="' + e.id + '"' + (shop.experience === e.id ? ' selected' : '') + '>' + e.label + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div class="hint err" id="eErr" style="color:#c87860;font-weight:700;min-height:18px;margin-bottom:8px;"></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
          '<button id="eCancel" class="btn btn-ghost">Cancel</button>' +
          '<button id="eSave" class="btn btn-primary">Save changes</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function close(){ overlay.remove(); }
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
    overlay.querySelector('#eCancel').addEventListener('click', close);

    var selectedCats = cats.slice();
    Array.prototype.forEach.call(overlay.querySelectorAll('[data-cat]'), function(b){
      b.addEventListener('click', function(){
        var cat = b.getAttribute('data-cat');
        var i = selectedCats.indexOf(cat);
        if (i !== -1) {
          selectedCats.splice(i, 1);
          b.classList.remove('active');
          b.style.background = '#fff'; b.style.color = 'inherit'; b.style.borderColor = 'rgba(42,26,20,0.12)';
        } else if (selectedCats.length < 4) {
          selectedCats.push(cat);
          b.classList.add('active');
          b.style.background = '#c87860'; b.style.color = '#fff'; b.style.borderColor = '#c87860';
        } else {
          SLShop.toast('Up to 4 categories');
        }
      });
    });

    var handleInp = overlay.querySelector('#eHandle');
    var handleHint = overlay.querySelector('#eHandleHint');
    var debounceT;
    handleInp.addEventListener('input', function(){
      var v = handleInp.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
      if (v !== handleInp.value) handleInp.value = v;
      handleHint.textContent = '';
      clearTimeout(debounceT);
      if (v.length >= 3 && v !== shop.handle) {
        handleHint.textContent = 'Checking…';
        debounceT = setTimeout(function(){
          SLShop.api('/handle-available?handle=' + encodeURIComponent(v)).then(function(r){
            handleHint.textContent = r.available ? '@' + v + ' is available ✓' : '@' + v + ' is taken — try another';
            handleHint.style.color = r.available ? '#2f8a4a' : '#c87860';
          }).catch(function(){});
        }, 350);
      }
    });

    overlay.querySelector('#eSave').addEventListener('click', function(){
      var btn = this;
      var err = overlay.querySelector('#eErr');
      err.textContent = '';
      var body = {
        name: overlay.querySelector('#eName').value.trim(),
        handle: overlay.querySelector('#eHandle').value.trim(),
        bio: overlay.querySelector('#eBio').value,
        shipsFrom: overlay.querySelector('#eShips').value,
        productKind: overlay.querySelector('#eKind').value,
        experience: overlay.querySelector('#eExp').value,
        categories: selectedCats,
      };
      if (body.name.length < 2) { err.textContent = 'Shop name too short'; return; }
      btn.disabled = true; btn.textContent = 'Saving…';
      SLShop.api('/shops/me', { method:'PATCH', body: body })
        .then(function(){ SLShop.toast('Saved'); close(); location.reload(); })
        .catch(function(e){ err.textContent = e.message; btn.disabled = false; btn.textContent = 'Save changes'; });
    });
  }
})();
