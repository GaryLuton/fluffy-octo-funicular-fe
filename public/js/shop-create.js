// Multi-step "open your shop" wizard — friendly + fun.
(function(){
  var root = document.getElementById('root');

  var CATEGORIES = ['Apparel','Jewelry','Art','Home','Vintage','Craft','Digital','Other'];
  var KINDS = [
    { id:'handmade',  emoji:'🧵', title:'Handmade',         desc:"i make it with my own hands" },
    { id:'vintage',   emoji:'🪩', title:'Vintage / Thrift', desc:'pre-loved finds with stories' },
    { id:'digital',   emoji:'💾', title:'Digital',          desc:'printables, presets, downloads' },
    { id:'reseller',  emoji:'🛍', title:'Reseller',         desc:'curated picks i love' },
    { id:'mixed',     emoji:'🎁', title:'A mix',            desc:"a bit of everything" },
  ];
  var EXPERIENCE = [
    { id:'hobby',       emoji:'☁️', title:'just a hobby',       desc:'for fun, no pressure' },
    { id:'side-hustle', emoji:'🌱', title:'a side hustle',      desc:"pays for the lattes" },
    { id:'full-time',   emoji:'🚀', title:"it's my whole thing", desc:'this is my main gig' },
  ];

  // Cute name-suggestions so the page never feels blank.
  var NAME_BITS_A = ['Sunbeam','Velvet','Moonpetal','Goldenhour','Honeyfern','Little','Mossy','Soft','Cherry','Cloud','Crescent','Maple','Daisy','Lemon','Bramble','Saltwater','Wildflower','Peach','Misty','Indigo'];
  var NAME_BITS_B = ['Studio','Goods','Atelier','Co.','Club','Shop','Stand','Market','House','Workshop','Drop','Stories','Lab','Press','Things'];
  function randomName(){
    var a = NAME_BITS_A[Math.floor(Math.random() * NAME_BITS_A.length)];
    var b = NAME_BITS_B[Math.floor(Math.random() * NAME_BITS_B.length)];
    return a + ' ' + b;
  }

  // Rotating placeholders so step 1 feels alive.
  var NAME_PLACEHOLDERS = ['e.g. Sunbeam Studio','e.g. Honeyfern Press','e.g. Velvet Goods','e.g. Little Cherry Co.','e.g. Mossy Drop','e.g. Cloud Atelier'];

  // Encouraging notes shown after each step is completed.
  var PEP = [
    'cute name ✨',
    'nice handle 🌸',
    'love that ✨',
    'thank you 💌',
  ];

  var DRAFT_KEY = 'stuflover_shop_draft';

  function loadDraft(){
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      return d;
    } catch (e) { return null; }
  }
  function saveDraft(){
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: state.step, data: state.data })); } catch (e) {}
  }
  function clearDraft(){
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  var draft = loadDraft();
  var state = {
    step: draft && typeof draft.step === 'number' ? Math.min(Math.max(0, draft.step), 4) : 0,
    total: 5,
    data: Object.assign({
      name: '',
      handle: '',
      productKind: '',
      categories: [],
      shipsFrom: '',
      bio: '',
      experience: '',
    }, (draft && draft.data) || {}),
    handleStatus: null,
    handleMsg: '',
    handleDirty: false, // true if user has typed in the handle field manually
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
        '<h2 class="bc" style="font-size:1.6rem;margin-bottom:8px;">first, sign in!</h2>' +
        '<p style="color:rgba(42,26,20,0.55);margin-bottom:20px;line-height:1.6;">you need a (free) stuflover account to open a shop. takes like 10 seconds. promise.</p>' +
        '<a class="btn btn-primary" href="/auth.html?return=' + encodeURIComponent(location.pathname) + '">Sign in or sign up</a>' +
      '</div>';
  }

  function renderHasShop(shop){
    clearDraft();
    root.innerHTML =
      '<div class="auth-block">' +
        '<h2 class="bc" style="font-size:1.6rem;margin-bottom:8px;">you already have a shop! 🌸</h2>' +
        '<p style="color:rgba(42,26,20,0.55);margin-bottom:20px;line-height:1.6;"><strong>' + SLShop.escapeHtml(shop.name) + '</strong> is live and waiting for you.</p>' +
        '<a class="btn btn-primary" href="/shop-mine.html">Go to dashboard</a>' +
      '</div>';
  }

  function renderWizard(){
    root.innerHTML = '<div class="wizard reveal visible">' +
      '<div class="progress" id="progress"></div>' +
      '<div class="pep" id="pep"></div>' +
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

  function showPep(text){
    var el = document.getElementById('pep');
    if (!el) return;
    el.textContent = text;
    requestAnimationFrame(function(){ el.classList.add('show'); });
    clearTimeout(showPep._t);
    showPep._t = setTimeout(function(){ el.classList.remove('show'); }, 2400);
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

  function slugifyHandle(s){
    return String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  }

  function renderStep(step){
    if (step === 0) {
      var ph = NAME_PLACEHOLDERS[Math.floor(Math.random() * NAME_PLACEHOLDERS.length)];
      return '<div class="step active">' +
        '<div class="step-eyebrow">step 1 of 5 · 30 seconds in</div>' +
        '<h2>What should we call your shop?</h2>' +
        '<p class="lede">name it whatever feels like you — your aesthetic, your cat, your favourite colour. you can change it later 🌷</p>' +
        '<div class="form-row" style="margin-bottom:6px;">' +
          '<input id="fName" maxlength="80" placeholder="' + ph + '" value="' + SLShop.escapeHtml(state.data.name) + '" autocomplete="off"/>' +
          '<button type="button" class="suggest-btn" id="bSuggest">✨ surprise me</button>' +
          '<div class="hint" id="hName"></div>' +
        '</div>' +
        '<div class="reassure">you can rename anytime — even after you launch.</div>' +
      '</div>';
    }
    if (step === 1) {
      return '<div class="step active">' +
        '<div class="step-eyebrow">step 2 of 5</div>' +
        '<h2>Pick your @</h2>' +
        '<p class="lede">just for your shop link. letters, numbers, underscores. lowercase forever 💌</p>' +
        '<div class="form-row" style="margin-bottom:6px;">' +
          '<div class="input-prefix">' +
            '<span class="pre">@</span>' +
            '<input id="fHandle" maxlength="30" placeholder="' + SLShop.escapeHtml(slugifyHandle(state.data.name) || 'yourshop') + '" value="' + SLShop.escapeHtml(state.data.handle) + '" autocomplete="off"/>' +
          '</div>' +
          '<div class="hint ' + (state.handleStatus === 'ok' ? 'ok' : state.handleStatus === 'err' ? 'err' : '') + '" id="hHandle">' + SLShop.escapeHtml(state.handleMsg || 'stuflover.com/shop.html?shop=' + (state.data.handle || 'your-handle')) + '</div>' +
        '</div>' +
      '</div>';
    }
    if (step === 2) {
      return '<div class="step active">' +
        '<div class="step-eyebrow">step 3 of 5 · the fun part</div>' +
        '<h2>What are you selling?</h2>' +
        '<p class="lede">pick the one that fits best. then tap up to 4 vibes 🌈</p>' +
        '<div style="margin-bottom:18px;">' +
          '<div class="opts" id="kindOpts">' +
            KINDS.map(function(k){
              var active = state.data.productKind === k.id ? ' active' : '';
              return '<button type="button" class="opt' + active + '" data-id="' + k.id + '">' +
                '<span class="opt-mark"></span>' +
                '<span class="opt-body"><div class="opt-title">' + k.emoji + ' &nbsp;' + k.title + '</div><div class="opt-desc">' + k.desc + '</div></span>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="form-row" style="margin-bottom:0;">' +
          '<label style="margin-bottom:8px;">categories <span style="opacity:0.5;font-weight:600;text-transform:none;letter-spacing:0;font-family:\'Nunito\',sans-serif;font-size:0.78rem;">— pick up to 4</span></label>' +
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
        '<div class="step-eyebrow">step 4 of 5 · totally optional</div>' +
        '<h2>Tell us a bit about you ✨</h2>' +
        '<p class="lede">skip the whole thing if you want — buyers just like knowing there\'s a real person behind a shop.</p>' +
        '<div class="form-row">' +
          '<label>your intro <span style="opacity:0.5;font-weight:600;text-transform:none;letter-spacing:0;font-family:\'Nunito\',sans-serif;font-size:0.78rem;">(a sentence is plenty)</span></label>' +
          '<textarea id="fBio" maxlength="500" placeholder="i hand-sew slow-fashion tops in my brooklyn bedroom 🌷">' + SLShop.escapeHtml(state.data.bio) + '</textarea>' +
        '</div>' +
        '<div class="form-row">' +
          '<label>where do you ship from?</label>' +
          '<input id="fShips" maxlength="60" placeholder="city or country" value="' + SLShop.escapeHtml(state.data.shipsFrom) + '"/>' +
        '</div>' +
        '<div class="form-row" style="margin-bottom:0;">' +
          '<label style="margin-bottom:8px;">vibe check — what is this for you?</label>' +
          '<div class="opts" id="expOpts">' +
            EXPERIENCE.map(function(e){
              var active = state.data.experience === e.id ? ' active' : '';
              return '<button type="button" class="opt' + active + '" data-id="' + e.id + '">' +
                '<span class="opt-mark"></span>' +
                '<span class="opt-body"><div class="opt-title">' + e.emoji + ' &nbsp;' + e.title + '</div><div class="opt-desc">' + e.desc + '</div></span>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="reassure">none of this is required — you can add it later from your dashboard.</div>' +
      '</div>';
    }
    // step 4 — review
    var d = state.data;
    var catLine = d.categories.length ? d.categories.join(', ') : '—';
    var kindObj = KINDS.find(function(k){return k.id===d.productKind;}) || {};
    var kindLabel = kindObj.title ? (kindObj.emoji + ' ' + kindObj.title) : '—';
    var expObj = EXPERIENCE.find(function(e){return e.id===d.experience;}) || {};
    var expLabel = expObj.title ? (expObj.emoji + ' ' + expObj.title) : 'haven\'t decided';
    return '<div class="step active">' +
      '<div class="step-eyebrow">last step — let\'s gooo</div>' +
      '<h2>Looks good? 🚀</h2>' +
      '<p class="lede">tap launch and your shop is live. remember — change anything anytime from your dashboard. zero pressure.</p>' +
      '<dl class="review-list">' +
        '<dt>shop name</dt><dd>' + SLShop.escapeHtml(d.name) + '</dd>' +
        '<dt>handle</dt><dd>@' + SLShop.escapeHtml(d.handle) + '</dd>' +
        '<dt>you sell</dt><dd>' + SLShop.escapeHtml(kindLabel) + ' · ' + SLShop.escapeHtml(catLine) + '</dd>' +
        (d.bio ? '<dt>about</dt><dd>' + SLShop.escapeHtml(d.bio) + '</dd>' : '') +
        (d.shipsFrom ? '<dt>ships from</dt><dd>' + SLShop.escapeHtml(d.shipsFrom) + '</dd>' : '') +
        '<dt>vibe</dt><dd>' + SLShop.escapeHtml(expLabel) + '</dd>' +
      '</dl>' +
      '<div class="hint err" id="hSubmit"></div>' +
    '</div>';
  }

  function renderNav(step){
    var back = step > 0 ? '<button class="btn btn-link" id="bBack">← back</button>' : '<span class="spacer"></span>';
    var skip = '';
    if (step === 3) skip = ' <button type="button" class="skip-link" id="bSkip">skip — i\'m good</button>';
    var next;
    if (step < state.total - 1) {
      next = '<button class="btn btn-primary" id="bNext">' + (step === 3 ? 'next →' : 'continue →') + '</button>' + skip;
    } else {
      next = '<button class="btn btn-primary" id="bSubmit">🚀 launch my shop</button>';
    }
    return back + '<span class="spacer"></span>' + next;
  }

  function wireStep(step){
    if (step === 0) {
      var inp = document.getElementById('fName');
      inp.addEventListener('input', function(){ state.data.name = inp.value; saveDraft(); });
      inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') goNext(); });
      var sg = document.getElementById('bSuggest');
      if (sg) sg.addEventListener('click', function(){
        var n = randomName();
        inp.value = n;
        state.data.name = n;
        saveDraft();
        inp.focus();
      });
    } else if (step === 1) {
      var inp = document.getElementById('fHandle');
      var hint = document.getElementById('hHandle');
      // If the user hasn't touched the handle yet, suggest one from the shop name.
      if (!state.data.handle && !state.handleDirty && state.data.name) {
        var suggested = slugifyHandle(state.data.name);
        if (suggested.length >= 3) {
          inp.value = suggested;
          state.data.handle = suggested;
          saveDraft();
          // Trigger the check immediately so the user gets feedback.
          checkHandle(suggested, hint);
        }
      }
      var debounceT;
      inp.addEventListener('input', function(){
        state.handleDirty = true;
        var v = slugifyHandle(inp.value);
        if (v !== inp.value) inp.value = v;
        state.data.handle = v;
        state.handleStatus = null;
        state.handleMsg = 'stuflover.com/shop.html?shop=' + (v || 'your-handle');
        hint.className = 'hint';
        hint.textContent = state.handleMsg;
        saveDraft();
        clearTimeout(debounceT);
        if (v.length >= 3) {
          state.handleStatus = 'checking';
          hint.textContent = 'checking…';
          debounceT = setTimeout(function(){ checkHandle(v, hint); }, 350);
        }
      });
      inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') goNext(); });
    } else if (step === 2) {
      Array.prototype.forEach.call(document.querySelectorAll('#kindOpts .opt'), function(b){
        b.addEventListener('click', function(){
          state.data.productKind = b.getAttribute('data-id');
          Array.prototype.forEach.call(document.querySelectorAll('#kindOpts .opt'), function(x){ x.classList.remove('active'); });
          b.classList.add('active');
          saveDraft();
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
            SLShop.toast('up to 4 — pick your faves');
          }
          saveDraft();
        });
      });
    } else if (step === 3) {
      document.getElementById('fBio').addEventListener('input', function(e){ state.data.bio = e.target.value; saveDraft(); });
      document.getElementById('fShips').addEventListener('input', function(e){ state.data.shipsFrom = e.target.value; saveDraft(); });
      Array.prototype.forEach.call(document.querySelectorAll('#expOpts .opt'), function(b){
        b.addEventListener('click', function(){
          state.data.experience = b.getAttribute('data-id');
          Array.prototype.forEach.call(document.querySelectorAll('#expOpts .opt'), function(x){ x.classList.remove('active'); });
          b.classList.add('active');
          saveDraft();
        });
      });
    }
  }

  function checkHandle(v, hint){
    SLShop.api('/handle-available?handle=' + encodeURIComponent(v)).then(function(r){
      if (state.data.handle !== v) return;
      if (r.available) {
        state.handleStatus = 'ok';
        state.handleMsg = '@' + v + ' is yours ✨';
        hint.className = 'hint ok';
      } else {
        state.handleStatus = 'err';
        state.handleMsg = '@' + v + ' is taken — try another?';
        hint.className = 'hint err';
      }
      hint.textContent = state.handleMsg;
    }).catch(function(){});
  }

  function wireNav(step){
    var back = document.getElementById('bBack');
    if (back) back.addEventListener('click', function(){ state.step--; saveDraft(); drawStep(); window.scrollTo({top:0,behavior:'smooth'}); });
    var next = document.getElementById('bNext');
    if (next) next.addEventListener('click', goNext);
    var sub = document.getElementById('bSubmit');
    if (sub) sub.addEventListener('click', submit);
    var skip = document.getElementById('bSkip');
    if (skip) skip.addEventListener('click', function(){ state.step++; saveDraft(); drawStep(); window.scrollTo({top:0,behavior:'smooth'}); showPep('totally fine — moving on 🌸'); });
  }

  function goNext(){
    var step = state.step;
    if (step === 0) {
      if (!state.data.name || state.data.name.trim().length < 2) { setHint('hName', 'give it a name first — even a silly one 🌷', 'err'); return; }
      state.data.name = state.data.name.trim();
    }
    if (step === 1) {
      if (!state.data.handle || state.data.handle.length < 3) { setHint('hHandle', 'need 3+ characters — letters, numbers, _', 'err'); return; }
      if (state.handleStatus === 'err') { setHint('hHandle', state.handleMsg, 'err'); return; }
    }
    if (step === 2) {
      if (!state.data.productKind) { SLShop.toast('pick what you sell ✨'); return; }
    }
    var pepText = PEP[Math.min(step, PEP.length - 1)];
    state.step++;
    saveDraft();
    drawStep();
    window.scrollTo({top:0,behavior:'smooth'});
    showPep(pepText);
  }

  function setHint(id, msg, cls){
    var h = document.getElementById(id);
    if (!h) return;
    h.textContent = msg;
    h.className = 'hint ' + (cls || '');
  }

  // Tiny confetti burst — no external library.
  function launchConfetti(){
    var layer = document.createElement('div');
    layer.className = 'confetti-layer';
    document.body.appendChild(layer);
    var colors = ['#c87860','#a86050','#f0ddd6','#e8d5c8','#fbe8ec','#fcead2'];
    var N = 90;
    for (var i = 0; i < N; i++) {
      var b = document.createElement('div');
      b.className = 'confetti-bit';
      b.style.left = (Math.random() * 100) + '%';
      b.style.background = colors[Math.floor(Math.random() * colors.length)];
      b.style.setProperty('--dx', ((Math.random() - 0.5) * 200) + 'px');
      b.style.setProperty('--rot', (360 + Math.random() * 720) + 'deg');
      b.style.animationDuration = (2 + Math.random() * 2) + 's';
      b.style.animationDelay = (Math.random() * 0.4) + 's';
      b.style.opacity = 0.85;
      layer.appendChild(b);
    }
    setTimeout(function(){ layer.remove(); }, 4500);
  }

  function submit(){
    var btn = document.getElementById('bSubmit');
    var err = document.getElementById('hSubmit');
    if (err) err.textContent = '';
    btn.disabled = true; btn.textContent = 'launching…';
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
      clearDraft();
      launchConfetti();
      SLShop.toast('your shop is live! 🎉');
      btn.textContent = '🎉 live!';
      setTimeout(function(){ location.href = '/shop-mine.html'; }, 1400);
    }).catch(function(e){
      if (err) err.textContent = e.message || 'couldn\'t open shop just now — try again?';
      btn.disabled = false; btn.textContent = '🚀 launch my shop';
    });
  }

  init();

  // Scroll reveal for hero elements
  var obs = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting) e.target.classList.add('visible'); });
  },{threshold:0.1});
  document.querySelectorAll('.reveal').forEach(function(el){ obs.observe(el); });
})();
