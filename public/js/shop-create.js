// Multi-step "open your shop" wizard, Wix-style.
(function(){
  var root = document.getElementById('root');

  var CATEGORIES = ['Apparel','Jewelry','Art','Home','Vintage','Craft','Digital','Other'];
  var KINDS = [
    { id:'handmade',  title:'Handmade',        desc:"I make it myself." },
    { id:'vintage',   title:'Vintage / Thrift', desc:'20+ year old or pre-loved finds.' },
    { id:'digital',   title:'Digital',         desc:'Printables, presets, downloads.' },
    { id:'reseller',  title:'Reseller',        desc:'Curated picks from other brands.' },
    { id:'mixed',     title:'A mix',           desc:"Bit of everything." },
  ];
  var EXPERIENCE = [
    { id:'hobby',       title:'Just a hobby',       desc:'I sell a few things for fun.' },
    { id:'side-hustle', title:'A side hustle',      desc:'It pays for some of my life.' },
    { id:'full-time',   title:'My full-time thing', desc:'This is my main job.' },
  ];

  var state = {
    step: 0,
    total: 5,
    data: {
      name: '',
      handle: '',
      productKind: '',
      categories: [],
      shipsFrom: '',
      bio: '',
      experience: '',
    },
    handleStatus: null, // 'checking' | 'ok' | 'err' | null
    handleMsg: '',
  };

  function init(){
    if (!SLShop.authed()) { renderAuthPrompt(); return; }
    SLShop.api('/shops/me').then(function(r){
      if (r.shop) renderHasShop(r.shop);
      else renderWizard();
    }).catch(function(){ renderWizard(); });
  }

  function renderAuthPrompt(){
    root.innerHTML =
      '<div class="auth-block">' +
        '<h2 class="bc" style="font-size:1.6rem;margin-bottom:8px;">Sign in to open a shop</h2>' +
        '<p style="color:rgba(42,26,20,0.55);margin-bottom:20px;line-height:1.6;">You need a free Stuflover account to sell. Takes 10 seconds.</p>' +
        '<a class="btn btn-primary" href="/auth.html?return=' + encodeURIComponent(location.pathname) + '">Sign in or sign up</a>' +
      '</div>';
  }

  function renderHasShop(shop){
    root.innerHTML =
      '<div class="auth-block">' +
        '<h2 class="bc" style="font-size:1.6rem;margin-bottom:8px;">You already have a shop</h2>' +
        '<p style="color:rgba(42,26,20,0.55);margin-bottom:20px;line-height:1.6;">' + SLShop.escapeHtml(shop.name) + ' is live. Manage it from your dashboard.</p>' +
        '<a class="btn btn-primary" href="/shop-mine.html">Go to dashboard</a>' +
      '</div>';
  }

  function renderWizard(){
    root.innerHTML = '<div class="wizard reveal visible">' +
      '<div class="progress" id="progress"></div>' +
      '<div id="stepHolder"></div>' +
      '<div class="nav-row" id="navRow"></div>' +
    '</div>';
    drawProgress();
    drawStep();
  }

  function drawProgress(){
    var el = document.getElementById('progress');
    var html = '';
    for (var i = 0; i < state.total; i++) {
      var cls = i < state.step ? 'done' : i === state.step ? 'cur' : '';
      html += '<div class="dot ' + cls + '">' + (i + 1) + '</div>';
      if (i < state.total - 1) html += '<div class="bar ' + (i < state.step ? 'done' : '') + '"></div>';
    }
    el.innerHTML = html;
  }

  function drawStep(){
    var holder = document.getElementById('stepHolder');
    var nav = document.getElementById('navRow');
    var step = state.step;
    holder.innerHTML = renderStep(step);
    nav.innerHTML = renderNav(step);
    wireStep(step);
    wireNav(step);
    drawProgress();
    var firstInput = holder.querySelector('input,textarea');
    if (firstInput) setTimeout(function(){ firstInput.focus(); }, 50);
  }

  function renderStep(step){
    if (step === 0) {
      return '<div class="step active">' +
        '<div class="step-eyebrow">Step 1 of 5</div>' +
        '<h2>Name your shop</h2>' +
        '<p class="lede">This is what buyers will see at the top of your storefront. Pick something memorable — you can change it later.</p>' +
        '<div class="form-row">' +
          '<input id="fName" maxlength="80" placeholder="Sunbeam Studio" value="' + SLShop.escapeHtml(state.data.name) + '" autocomplete="off"/>' +
          '<div class="hint" id="hName"></div>' +
        '</div>' +
      '</div>';
    }
    if (step === 1) {
      return '<div class="step active">' +
        '<div class="step-eyebrow">Step 2 of 5</div>' +
        '<h2>Pick a username</h2>' +
        '<p class="lede">This is your unique shop handle. Letters, numbers, and underscores only — like @sunbeamstudio.</p>' +
        '<div class="form-row">' +
          '<div class="input-prefix">' +
            '<span class="pre">@</span>' +
            '<input id="fHandle" maxlength="30" placeholder="sunbeamstudio" value="' + SLShop.escapeHtml(state.data.handle) + '" autocomplete="off"/>' +
          '</div>' +
          '<div class="hint ' + (state.handleStatus === 'ok' ? 'ok' : state.handleStatus === 'err' ? 'err' : '') + '" id="hHandle">' + SLShop.escapeHtml(state.handleMsg || 'stuflover.com/shop.html?shop=' + (state.data.handle || 'your-handle')) + '</div>' +
        '</div>' +
      '</div>';
    }
    if (step === 2) {
      return '<div class="step active">' +
        '<div class="step-eyebrow">Step 3 of 5</div>' +
        '<h2>What will you sell?</h2>' +
        '<p class="lede">Pick one main style, then tap any categories that fit. Buyers use these to find you.</p>' +
        '<div style="margin-bottom:18px;">' +
          '<div class="opts" id="kindOpts">' +
            KINDS.map(function(k){
              var active = state.data.productKind === k.id ? ' active' : '';
              return '<button type="button" class="opt' + active + '" data-id="' + k.id + '">' +
                '<span class="opt-mark"></span>' +
                '<span class="opt-body"><div class="opt-title">' + k.title + '</div><div class="opt-desc">' + k.desc + '</div></span>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="form-row" style="margin-bottom:0;">' +
          '<label style="margin-bottom:8px;">Categories <span style="opacity:0.5;font-weight:600;">(tap up to 4)</span></label>' +
          '<div class="chip-group" id="catChips">' +
            CATEGORIES.map(function(c){
              var active = state.data.categories.indexOf(c) !== -1 ? ' active' : '';
              return '<button type="button" class="chip-pick' + active + '" data-cat="' + c + '">' + c + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';
    }
    if (step === 3) {
      return '<div class="step active">' +
        '<div class="step-eyebrow">Step 4 of 5</div>' +
        '<h2>About you</h2>' +
        '<p class="lede">Help buyers connect with the person behind the shop. A sentence is enough.</p>' +
        '<div class="form-row">' +
          '<label>Quick intro</label>' +
          '<textarea id="fBio" maxlength="500" placeholder="I hand-sew slow-fashion tops in my Brooklyn studio…">' + SLShop.escapeHtml(state.data.bio) + '</textarea>' +
        '</div>' +
        '<div class="form-row">' +
          '<label>Where do you ship from?</label>' +
          '<input id="fShips" maxlength="60" placeholder="Country or city" value="' + SLShop.escapeHtml(state.data.shipsFrom) + '"/>' +
        '</div>' +
        '<div class="form-row" style="margin-bottom:0;">' +
          '<label style="margin-bottom:8px;">How serious is this for you?</label>' +
          '<div class="opts" id="expOpts">' +
            EXPERIENCE.map(function(e){
              var active = state.data.experience === e.id ? ' active' : '';
              return '<button type="button" class="opt' + active + '" data-id="' + e.id + '">' +
                '<span class="opt-mark"></span>' +
                '<span class="opt-body"><div class="opt-title">' + e.title + '</div><div class="opt-desc">' + e.desc + '</div></span>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';
    }
    // step 4 — review
    var d = state.data;
    var catLine = d.categories.length ? d.categories.join(', ') : '—';
    var kindLabel = (KINDS.find(function(k){return k.id===d.productKind;}) || {}).title || '—';
    var expLabel = (EXPERIENCE.find(function(e){return e.id===d.experience;}) || {}).title || '—';
    return '<div class="step active">' +
      '<div class="step-eyebrow">Step 5 of 5</div>' +
      '<h2>Look right?</h2>' +
      '<p class="lede">Tap "Open my shop" and your storefront goes live. You can edit anything from your dashboard.</p>' +
      '<dl class="review-list">' +
        '<dt>Shop name</dt><dd>' + SLShop.escapeHtml(d.name) + '</dd>' +
        '<dt>Username</dt><dd>@' + SLShop.escapeHtml(d.handle) + '</dd>' +
        '<dt>You sell</dt><dd>' + SLShop.escapeHtml(kindLabel) + ' · ' + SLShop.escapeHtml(catLine) + '</dd>' +
        (d.bio ? '<dt>About</dt><dd>' + SLShop.escapeHtml(d.bio) + '</dd>' : '') +
        (d.shipsFrom ? '<dt>Ships from</dt><dd>' + SLShop.escapeHtml(d.shipsFrom) + '</dd>' : '') +
        '<dt>Vibe</dt><dd>' + SLShop.escapeHtml(expLabel) + '</dd>' +
      '</dl>' +
      '<div class="hint err" id="hSubmit"></div>' +
    '</div>';
  }

  function renderNav(step){
    var back = step > 0 ? '<button class="btn btn-link" id="bBack">← Back</button>' : '<span class="spacer"></span>';
    var next;
    if (step < state.total - 1) {
      next = '<button class="btn btn-primary" id="bNext">Continue</button>';
    } else {
      next = '<button class="btn btn-primary" id="bSubmit">Open my shop</button>';
    }
    return back + '<span class="spacer"></span>' + next;
  }

  function wireStep(step){
    if (step === 0) {
      var inp = document.getElementById('fName');
      inp.addEventListener('input', function(){ state.data.name = inp.value; });
      inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') goNext(); });
    } else if (step === 1) {
      var inp = document.getElementById('fHandle');
      var hint = document.getElementById('hHandle');
      var debounceT;
      inp.addEventListener('input', function(){
        var v = inp.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
        if (v !== inp.value) inp.value = v;
        state.data.handle = v;
        state.handleStatus = null;
        state.handleMsg = 'stuflover.com/shop.html?shop=' + (v || 'your-handle');
        hint.className = 'hint';
        hint.textContent = state.handleMsg;
        clearTimeout(debounceT);
        if (v.length >= 3) {
          state.handleStatus = 'checking';
          hint.textContent = 'Checking…';
          debounceT = setTimeout(function(){
            SLShop.api('/handle-available?handle=' + encodeURIComponent(v)).then(function(r){
              if (state.data.handle !== v) return;
              if (r.available) {
                state.handleStatus = 'ok';
                state.handleMsg = '@' + v + ' is available ✓';
                hint.className = 'hint ok';
              } else {
                state.handleStatus = 'err';
                state.handleMsg = '@' + v + ' is taken — try another';
                hint.className = 'hint err';
              }
              hint.textContent = state.handleMsg;
            }).catch(function(){});
          }, 350);
        }
      });
      inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') goNext(); });
    } else if (step === 2) {
      Array.prototype.forEach.call(document.querySelectorAll('#kindOpts .opt'), function(b){
        b.addEventListener('click', function(){
          state.data.productKind = b.getAttribute('data-id');
          Array.prototype.forEach.call(document.querySelectorAll('#kindOpts .opt'), function(x){ x.classList.remove('active'); });
          b.classList.add('active');
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('#catChips .chip-pick'), function(b){
        b.addEventListener('click', function(){
          var cat = b.getAttribute('data-cat');
          var idx = state.data.categories.indexOf(cat);
          if (idx !== -1) {
            state.data.categories.splice(idx, 1);
            b.classList.remove('active');
          } else if (state.data.categories.length < 4) {
            state.data.categories.push(cat);
            b.classList.add('active');
          } else {
            SLShop.toast('Up to 4 categories');
          }
        });
      });
    } else if (step === 3) {
      document.getElementById('fBio').addEventListener('input', function(e){ state.data.bio = e.target.value; });
      document.getElementById('fShips').addEventListener('input', function(e){ state.data.shipsFrom = e.target.value; });
      Array.prototype.forEach.call(document.querySelectorAll('#expOpts .opt'), function(b){
        b.addEventListener('click', function(){
          state.data.experience = b.getAttribute('data-id');
          Array.prototype.forEach.call(document.querySelectorAll('#expOpts .opt'), function(x){ x.classList.remove('active'); });
          b.classList.add('active');
        });
      });
    }
  }

  function wireNav(step){
    var back = document.getElementById('bBack');
    if (back) back.addEventListener('click', function(){ state.step--; drawStep(); window.scrollTo({top:0,behavior:'smooth'}); });
    var next = document.getElementById('bNext');
    if (next) next.addEventListener('click', goNext);
    var sub = document.getElementById('bSubmit');
    if (sub) sub.addEventListener('click', submit);
  }

  function goNext(){
    var step = state.step;
    if (step === 0) {
      if (!state.data.name || state.data.name.trim().length < 2) { setHint('hName', 'Give your shop a name (at least 2 characters)', 'err'); return; }
      state.data.name = state.data.name.trim();
    }
    if (step === 1) {
      if (!state.data.handle || state.data.handle.length < 3) { setHint('hHandle', 'Username needs 3+ characters', 'err'); return; }
      if (state.handleStatus === 'err') { setHint('hHandle', state.handleMsg, 'err'); return; }
      // If still checking, just submit anyway — server validates again.
    }
    if (step === 2) {
      if (!state.data.productKind) { SLShop.toast('Pick what you sell'); return; }
    }
    state.step++;
    drawStep();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function setHint(id, msg, cls){
    var h = document.getElementById(id);
    if (!h) return;
    h.textContent = msg;
    h.className = 'hint ' + (cls || '');
  }

  function submit(){
    var btn = document.getElementById('bSubmit');
    var err = document.getElementById('hSubmit');
    if (err) err.textContent = '';
    btn.disabled = true; btn.textContent = 'Opening…';
    var d = state.data;
    SLShop.api('/shops', { method:'POST', body:{
      name: d.name,
      handle: d.handle,
      bio: d.bio,
      categories: d.categories,
      productKind: d.productKind,
      shipsFrom: d.shipsFrom,
      experience: d.experience,
    } }).then(function(){
      SLShop.toast('Shop opened!');
      setTimeout(function(){ location.href = '/shop-mine.html'; }, 600);
    }).catch(function(e){
      if (err) err.textContent = e.message || 'Could not open shop.';
      btn.disabled = false; btn.textContent = 'Open my shop';
    });
  }

  init();

  // Scroll reveal for hero elements
  var obs = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting) e.target.classList.add('visible'); });
  },{threshold:0.1});
  document.querySelectorAll('.reveal').forEach(function(el){ obs.observe(el); });
})();
