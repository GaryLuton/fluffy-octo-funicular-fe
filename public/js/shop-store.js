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
  }).catch(function(err){
    // If the signed-in visitor owns *a* shop, the slug may have changed
    // (handle edits, slug suffixes, etc.) — bounce them to their own
    // dashboard so they don't get stranded on a dead URL.
    if (SLShop.authed()) {
      SLShop.api('/shops/me').then(function(me){
        if (me && me.shop && me.shop.slug) {
          if (me.shop.slug !== slug) {
            // Re-route to their real slug, preserving the ?new=1 banner.
            var keepNew = isNew ? '&new=1' : '';
            location.replace('/shop-store.html?shop=' + encodeURIComponent(me.shop.slug) + keepNew);
            return;
          }
        }
        showNotFound(err);
      }).catch(function(){ showNotFound(err); });
    } else {
      showNotFound(err);
    }
  });

  function showNotFound(err){
    var msg = (err && err.message) || 'shop not found';
    c.innerHTML = '<div class="shop-wrap"><div class="empty">' +
      '<div class="bc">' + SLShop.escapeHtml(msg) + '</div>' +
      '<p>This link may be wrong, or the shop has been removed.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap;">' +
        '<a class="btn btn-primary" href="/shop.html">Browse the marketplace</a>' +
        (SLShop.authed() ? '<a class="btn btn-ghost" href="/shop-mine.html">Your dashboard</a>' : '') +
      '</div>' +
    '</div></div>';
  }

  function initials(name){
    return String(name || '?').trim().split(/\s+/).map(function(w){ return w[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?';
  }

  function parseCats(s){
    try { var v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch(e){ return []; }
  }

  function productCard(featured, p){
    var img = (p.image_urls && p.image_urls[0]) || '';
    return '<a class="card' + (featured ? ' featured-card' : '') + '" href="/shop-product.html?id=' + p.id + '">' +
      '<div class="card-img">' +
        (img ? '<img loading="lazy" alt="" src="' + SLShop.escapeHtml(img) + '"/>' : '<div class="card-img-empty">No image</div>') +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-title">' + SLShop.escapeHtml(p.title) + '</div>' +
        '<div class="card-price">' + SLShop.fmtPrice(p.price_cents, p.currency) + '</div>' +
      '</div>' +
    '</a>';
  }

  function buildSocial(s){
    var out = [];
    if (s.instagram) out.push('<a target="_blank" rel="noopener" href="https://instagram.com/' + encodeURIComponent(s.instagram) + '">📷 ' + SLShop.escapeHtml(s.instagram) + '</a>');
    if (s.tiktok)    out.push('<a target="_blank" rel="noopener" href="https://tiktok.com/@' + encodeURIComponent(s.tiktok) + '">🎵 ' + SLShop.escapeHtml(s.tiktok) + '</a>');
    if (s.website) {
      var url = /^https?:\/\//i.test(s.website) ? s.website : 'https://' + s.website;
      out.push('<a target="_blank" rel="noopener" href="' + SLShop.escapeHtml(url) + '">🔗 site</a>');
    }
    if (s.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) {
      out.push('<a href="mailto:' + SLShop.escapeHtml(s.email) + '">✉️ email</a>');
    }
    return out;
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
      var design = shop.design || {};
      var social = design.social || {};
      var featuredIds = Array.isArray(design.featuredProductIds) ? design.featuredProductIds : [];

      // Apply accent color to the storefront scope
      if (design.accentColor) c.style.setProperty('--accent', design.accentColor);

      var html = '';

      if (design.announcement) {
        html += '<div class="announce-bar editable" data-edit="announcement"' +
                (isOwner ? ' data-owner="1"' : '') + '>' +
                SLShop.escapeHtml(design.announcement) + '</div>';
      } else if (isOwner) {
        html += '<div class="announce-bar editable placeholder" data-edit="announcement" data-owner="1" ' +
                'style="background:rgba(42,26,20,0.55);">+ add a pinned message</div>';
      }

      var ownerAttr = isOwner ? ' data-owner="1"' : '';

      if (design.announcement) {
        // override the basic announcement bar above with an editable version if owner
      }

      var hasBanner = !!shop.banner_url;
      html += '<section class="store-hero' + (hasBanner ? ' has-banner' : '') + '">';
      if (hasBanner) {
        html += '<div class="store-banner"><img src="' + SLShop.escapeHtml(shop.banner_url) + '" alt=""/></div>';
      }
      html +=   '<div class="store-avatar">' + (shop.avatar_url
                  ? '<img src="' + SLShop.escapeHtml(shop.avatar_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>'
                  : SLShop.escapeHtml(initials(shop.name))) + '</div>';
      html +=   '<h1 class="store-name editable" data-edit="name"' + ownerAttr + '>' + SLShop.escapeHtml(shop.name) + '</h1>';
      if (shop.handle) html += '<div class="store-handle">@' + SLShop.escapeHtml(shop.handle) + '</div>';
      if (shop.bio) {
        html += '<p class="store-bio editable" data-edit="bio"' + ownerAttr + '>' + SLShop.escapeHtml(shop.bio) + '</p>';
      } else if (isOwner) {
        html += '<p class="store-bio editable placeholder" data-edit="bio" data-owner="1">+ add a short intro</p>';
      }

      var tagBits = [];
      if (kind) tagBits.push(kind);
      cats.forEach(function(c){ tagBits.push(c); });
      if (tagBits.length) {
        html += '<div class="store-tags">' + tagBits.map(function(t){
          return '<span class="store-tag">' + SLShop.escapeHtml(t) + '</span>';
        }).join('') + '</div>';
      }
      if (shop.ships_from) html += '<div class="store-meta">ships from ' + SLShop.escapeHtml(shop.ships_from) + '</div>';

      var socialLinks = buildSocial(social);
      if (socialLinks.length) {
        html += '<div class="store-social">' + socialLinks.join('') + '</div>';
      }

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

      // Featured products section (above main grid)
      var featured = [];
      if (featuredIds.length) {
        var byId = {};
        products.forEach(function(p){ byId[p.id] = p; });
        featuredIds.forEach(function(id){ if (byId[id]) featured.push(byId[id]); });
      }
      if (featured.length) {
        html += '<section class="featured-section">';
        html +=   '<div class="reveal section-bar"><div>' +
                    '<div class="section-eyebrow">featured</div>' +
                    '<h2 class="section-h2">picks from the shop</h2>' +
                  '</div></div>';
        html +=   '<div class="featured-grid">' + featured.map(productCard.bind(null, true)).join('') + '</div>';
        html += '</section>';
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
        html += '<div class="grid">' + products.map(productCard.bind(null, false)).join('') + '</div>';
      }

      if (design.about) {
        html += '<section class="about-section">';
        html +=   '<div class="about-card">' +
                    '<h2>about the shop</h2>' +
                    '<p>' + SLShop.escapeHtml(design.about) + '</p>' +
                  '</div>';
        html += '</section>';
      }

      // Share box — useful to everyone, but specially highlighted for owners
      html += '<div class="store-share">' +
        '<span class="label">share</span>' +
        '<span class="url" id="shareUrl">' + SLShop.escapeHtml(shareUrl) + '</span>' +
        '<button class="btn btn-ghost" id="copyBtn" style="padding:8px 16px;font-size:0.7rem;letter-spacing:2px;">copy link</button>' +
      '</div>';

      html += '</main>';

      if (isOwner) {
        html += '<button class="cz-fab" id="czOpen">🎨 customize</button>';
      }

      c.innerHTML = html;

      if (isOwner) {
        wireInlineEdits(shop, design);
        var fab = document.getElementById('czOpen');
        if (fab) fab.addEventListener('click', function(){ openCustomize(shop, design, products); });
      }

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

  // ───────────────────────────────────────────────────────────────
  // Owner inline edits
  // ───────────────────────────────────────────────────────────────
  function wireInlineEdits(shop, design){
    Array.prototype.forEach.call(document.querySelectorAll('.editable[data-owner="1"]'), function(el){
      el.addEventListener('click', function(){
        var field = el.getAttribute('data-edit');
        if (field === 'name')         promptEdit('Shop name', shop.name || '', 80, false, function(v){ saveShop({ name: v }, 'name', v); });
        else if (field === 'bio')     promptEdit('Bio', shop.bio || '', 500, true, function(v){ saveShop({ bio: v }, 'bio', v); });
        else if (field === 'announcement') promptEdit('Announcement', design.announcement || '', 140, false, function(v){
          saveShop({ design: { announcement: v } }, 'design.announcement', v);
        });
      });
    });
  }

  function promptEdit(label, current, max, multiline, onSave){
    var bd = document.createElement('div');
    bd.className = 'cz-backdrop';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:20px;padding:24px;max-width:440px;width:calc(100% - 40px);position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:602;box-shadow:0 20px 60px rgba(30,12,6,0.3);';
    var inputTag = multiline ? '<textarea style="width:100%;min-height:120px;padding:11px 14px;border:2px solid rgba(42,26,20,0.12);border-radius:12px;font:inherit;box-sizing:border-box;resize:vertical;"></textarea>'
                             : '<input type="text" style="width:100%;padding:11px 14px;border:2px solid rgba(42,26,20,0.12);border-radius:12px;font:inherit;box-sizing:border-box;"/>';
    box.innerHTML =
      '<div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;letter-spacing:2px;text-transform:uppercase;font-size:0.78rem;color:rgba(42,26,20,0.55);margin-bottom:8px;">' + label + '</div>' +
      inputTag +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
        '<button class="btn btn-ghost" data-x="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-x="save">Save</button>' +
      '</div>';
    document.body.appendChild(bd);
    document.body.appendChild(box);
    requestAnimationFrame(function(){ bd.classList.add('show'); });
    var input = box.querySelector(multiline ? 'textarea' : 'input');
    input.value = current;
    input.maxLength = max;
    input.focus();
    input.select();
    function close(){ bd.remove(); box.remove(); }
    bd.addEventListener('click', close);
    box.querySelector('[data-x="cancel"]').addEventListener('click', close);
    box.querySelector('[data-x="save"]').addEventListener('click', function(){
      var v = input.value.trim().slice(0, max);
      close();
      onSave(v);
    });
    if (!multiline) input.addEventListener('keydown', function(e){ if (e.key === 'Enter') box.querySelector('[data-x="save"]').click(); });
  }

  function saveShop(body, _path, _newVal){
    SLShop.api('/shops/me', { method:'PATCH', body: body }).then(function(){
      SLShop.toast('saved ✓');
      // Simple: reload to render the updated state cleanly
      setTimeout(function(){ location.reload(); }, 400);
    }).catch(function(e){ SLShop.toast(e.message || 'could not save'); });
  }

  // ───────────────────────────────────────────────────────────────
  // Customize drawer
  // ───────────────────────────────────────────────────────────────
  var SWATCHES = ['#c87860','#a86050','#7a8b6f','#6b8aab','#a87bb0','#d4a574','#5e7d6b','#b85a5a','#2a1a14'];

  function openCustomize(shop, design, products){
    design = design || {};
    var social = Object.assign({ instagram:'', tiktok:'', email:'', website:'' }, design.social || {});
    var featured = (design.featuredProductIds || []).slice();

    var bd = document.createElement('div');
    bd.className = 'cz-backdrop';
    var dr = document.createElement('div');
    dr.className = 'cz-drawer';
    dr.innerHTML =
      '<div class="cz-head">' +
        '<h2>customize your shop</h2>' +
        '<button class="btn btn-ghost" id="czClose" style="padding:6px 10px;">✕</button>' +
      '</div>' +
      '<div class="cz-body">' +

        '<div class="cz-section">' +
          '<label class="cz-label">banner image</label>' +
          '<input type="url" id="czBanner" placeholder="https://… (wide image works best)" value="' + SLShop.escapeHtml(shop.banner_url || '') + '"/>' +
          '<div class="cz-hint">paste any image URL. 1600×400 or wider looks best.</div>' +
        '</div>' +

        '<div class="cz-section">' +
          '<label class="cz-label">shop avatar / logo</label>' +
          '<input type="url" id="czAvatar" placeholder="https://… (square image)" value="' + SLShop.escapeHtml(shop.avatar_url || '') + '"/>' +
          '<div class="cz-hint">square works best. leave blank to use your initials.</div>' +
        '</div>' +

        '<div class="cz-section">' +
          '<label class="cz-label">accent color</label>' +
          '<div class="cz-swatches" id="czSwatches">' +
            SWATCHES.map(function(c){
              var active = (design.accentColor || '').toLowerCase() === c;
              return '<button type="button" class="cz-swatch' + (active ? ' active' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>';
            }).join('') +
            '<input type="text" class="cz-hex" id="czHex" placeholder="#c87860" value="' + SLShop.escapeHtml(design.accentColor || '') + '" maxlength="7"/>' +
          '</div>' +
          '<div class="cz-hint">tap a swatch or type a hex code.</div>' +
        '</div>' +

        '<div class="cz-section">' +
          '<label class="cz-label">announcement bar</label>' +
          '<input type="text" id="czAnnounce" placeholder="free shipping over $50" maxlength="140" value="' + SLShop.escapeHtml(design.announcement || '') + '"/>' +
          '<div class="cz-hint">short message pinned to the top. leave blank to hide.</div>' +
        '</div>' +

        '<div class="cz-section">' +
          '<label class="cz-label">about the shop</label>' +
          '<textarea id="czAbout" maxlength="2000" placeholder="tell visitors your story — where you started, what you love making, what makes your stuff different">' + SLShop.escapeHtml(design.about || '') + '</textarea>' +
          '<div class="cz-hint">shown below your products.</div>' +
        '</div>' +

        '<div class="cz-section">' +
          '<label class="cz-label">social & contact</label>' +
          '<div class="cz-social-grid">' +
            '<label>instagram</label><input type="text" id="czIg" maxlength="60" placeholder="username" value="' + SLShop.escapeHtml(social.instagram) + '"/>' +
            '<label>tiktok</label>   <input type="text" id="czTt" maxlength="60" placeholder="username" value="' + SLShop.escapeHtml(social.tiktok) + '"/>' +
            '<label>website</label>  <input type="url" id="czWeb" maxlength="200" placeholder="yoursite.com" value="' + SLShop.escapeHtml(social.website) + '"/>' +
            '<label>email</label>    <input type="email" id="czEmail" maxlength="120" placeholder="hi@yoursite.com" value="' + SLShop.escapeHtml(social.email) + '"/>' +
          '</div>' +
        '</div>' +

        '<div class="cz-section">' +
          '<label class="cz-label">featured products (up to 3)</label>' +
          (products.length === 0
            ? '<div class="cz-hint">add a product first — then you can feature it here.</div>'
            : '<div class="cz-feat-list" id="czFeat">' + products.map(function(p){
                var img = (p.image_urls && p.image_urls[0]) || '';
                var on = featured.indexOf(p.id) !== -1;
                return '<div class="cz-feat-item' + (on ? ' active' : '') + '" data-id="' + p.id + '">' +
                  (img ? '<img src="' + SLShop.escapeHtml(img) + '" alt=""/>' : '<div style="width:40px;height:40px;border-radius:8px;background:rgba(42,26,20,0.08);"></div>') +
                  '<div class="ti">' + SLShop.escapeHtml(p.title) + '</div>' +
                  '<div class="mark"></div>' +
                '</div>';
              }).join('') + '</div>'
          ) +
        '</div>' +

      '</div>' +
      '<div class="cz-footer">' +
        '<div class="cz-err" id="czErr"></div>' +
        '<button class="btn btn-ghost" id="czCancel">cancel</button>' +
        '<button class="btn btn-primary" id="czSave">save</button>' +
      '</div>';

    document.body.appendChild(bd);
    document.body.appendChild(dr);
    requestAnimationFrame(function(){ bd.classList.add('show'); dr.classList.add('show'); });

    function close(){ bd.classList.remove('show'); dr.classList.remove('show'); setTimeout(function(){ bd.remove(); dr.remove(); }, 250); }
    bd.addEventListener('click', close);
    dr.querySelector('#czClose').addEventListener('click', close);
    dr.querySelector('#czCancel').addEventListener('click', close);

    // Swatch behavior
    var hex = dr.querySelector('#czHex');
    Array.prototype.forEach.call(dr.querySelectorAll('.cz-swatch'), function(b){
      b.addEventListener('click', function(){
        Array.prototype.forEach.call(dr.querySelectorAll('.cz-swatch'), function(x){ x.classList.remove('active'); });
        b.classList.add('active');
        hex.value = b.getAttribute('data-c');
      });
    });
    hex.addEventListener('input', function(){
      Array.prototype.forEach.call(dr.querySelectorAll('.cz-swatch'), function(x){
        x.classList.toggle('active', x.getAttribute('data-c').toLowerCase() === hex.value.toLowerCase());
      });
    });

    // Featured selection (cap at 3)
    Array.prototype.forEach.call(dr.querySelectorAll('.cz-feat-item'), function(it){
      it.addEventListener('click', function(){
        var id = parseInt(it.getAttribute('data-id'), 10);
        var i = featured.indexOf(id);
        if (i !== -1) {
          featured.splice(i, 1);
          it.classList.remove('active');
        } else if (featured.length < 3) {
          featured.push(id);
          it.classList.add('active');
        } else {
          SLShop.toast('up to 3 featured');
        }
      });
    });

    dr.querySelector('#czSave').addEventListener('click', function(){
      var btn = this;
      var err = dr.querySelector('#czErr');
      err.textContent = '';
      var hexVal = (hex.value || '').trim();
      if (hexVal && !/^#[0-9a-fA-F]{6}$/.test(hexVal)) {
        err.textContent = 'accent color must be a 6-digit hex like #c87860';
        return;
      }
      var body = {
        banner_url: dr.querySelector('#czBanner').value.trim(),
        avatar_url: dr.querySelector('#czAvatar').value.trim(),
        design: {
          accentColor: hexVal,
          announcement: dr.querySelector('#czAnnounce').value.trim(),
          about: dr.querySelector('#czAbout').value.trim(),
          social: {
            instagram: dr.querySelector('#czIg').value.trim(),
            tiktok:    dr.querySelector('#czTt').value.trim(),
            website:   dr.querySelector('#czWeb').value.trim(),
            email:     dr.querySelector('#czEmail').value.trim(),
          },
          featuredProductIds: featured,
        },
      };
      btn.disabled = true; btn.textContent = 'saving…';
      SLShop.api('/shops/me', { method:'PATCH', body: body }).then(function(){
        SLShop.toast('shop updated ✓');
        close();
        setTimeout(function(){ location.reload(); }, 350);
      }).catch(function(e){
        err.textContent = e.message || 'could not save';
        btn.disabled = false; btn.textContent = 'save';
      });
    });
  }
})();
