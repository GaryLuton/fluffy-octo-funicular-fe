/* ============================================================
   STUFLOVER SHARED NAV
   Injects a consistent 4-tab nav on every page.
   Desktop: sticky top bar. Mobile: top logo + top tabs.
   Idempotent — safe to include multiple times.

   NOTE: Nav CSS now lives in the static stylesheet stuflover-nav.css.
   This file only builds the nav DOM and wires behavior. Pages must
   link stuflover-nav.css in <head> before this script runs.
   ============================================================ */

/* ── View Transition interrupt guard ──────────────────────────
   @view-transition { navigation: auto } in stuflover-nav.css drives
   automatic cross-document transitions. When a user clicks a second
   link before the first transition settles, Chrome rejects the
   in-flight transition promise with an AbortError that can surface
   as an uncaught rejection in DevTools. Swallow only that error.
   ============================================================ */
(function(){
  if (window.__sluVtGuard) return;
  window.__sluVtGuard = true;
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    if (!r) return;
    var name = r.name || (r.constructor && r.constructor.name) || '';
    if (name === 'AbortError') e.preventDefault();
  });
})();

/* ── SITE THEME / EXPERIENCE SYSTEM ───────────────────────────
   Applies user-chosen colors and experience settings. The first
   paint is handled by the tiny inline boot script in each page's
   <head> (see sl-theme-boot). This block exposes the full API
   (presets, update, reset) for the Me page.
   ============================================================ */
(function () {
  if (window.StufloverTheme) return;
  var STORAGE_KEY = 'stuflover_theme';

  var PRESETS = {
    'default': { name: 'Pink Peach',   bg: '#faf0f0', bgMid: '#f0ddd6', accent: '#c87860', tx: '#2a1a14', surface: '#ffffff' },
    'rose':    { name: 'Rose Garden',  bg: '#fbe8ec', bgMid: '#f5cdd5', accent: '#d84a6b', tx: '#2a0e18', surface: '#ffffff' },
    'mint':    { name: 'Mint Fresh',   bg: '#e8f5ef', bgMid: '#cde8dc', accent: '#3fa874', tx: '#0e2419', surface: '#ffffff' },
    'lilac':   { name: 'Lilac Dream',  bg: '#f0e8fa', bgMid: '#ddcdf0', accent: '#8a5fd8', tx: '#1a0c2a', surface: '#ffffff' },
    'ocean':   { name: 'Ocean Breeze', bg: '#e4f1f8', bgMid: '#c8dfed', accent: '#2e86b8', tx: '#0c1a24', surface: '#ffffff' },
    'sunset':  { name: 'Sunset Glow',  bg: '#fcead2', bgMid: '#f6d2a8', accent: '#e07b3c', tx: '#2a140a', surface: '#ffffff' },
    'mono':    { name: 'Monochrome',   bg: '#f5f5f5', bgMid: '#e0e0e0', accent: '#333333', tx: '#111111', surface: '#ffffff' },
    'dark':    { name: 'Moonlight',    bg: '#1a1418', bgMid: '#2a1f25', accent: '#e08a95', tx: '#f5e8e8', surface: '#2a1f25' }
  };

  var TEXT_SIZES = { 'small': 0.9, 'default': 1.0, 'large': 1.1, 'xlarge': 1.2 };

  function defaults() {
    return { preset: 'default', accent: null, textSize: 'default', motion: true, texture: true };
  }

  function hasCustom() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!s) return defaults();
      var d = defaults();
      for (var k in d) if (s[k] === undefined || s[k] === null && k !== 'accent') s[k] = d[k];
      return s;
    } catch (e) { return defaults(); }
  }

  function save(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function shade(hex, pct) {
    if (!hex) return hex;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
    var f = pct < 0 ? (1 + pct) : 1;
    var add = pct > 0 ? pct * 255 : 0;
    r = Math.max(0, Math.min(255, Math.round(r * f + add)));
    g = Math.max(0, Math.min(255, Math.round(g * f + add)));
    b = Math.max(0, Math.min(255, Math.round(b * f + add)));
    return '#' + [r,g,b].map(function(x){ var h=x.toString(16); return h.length<2?'0'+h:h; }).join('');
  }

  function apply(s) {
    s = s || load();
    var preset;
    if (s.customPreset && typeof s.customPreset === 'object' && s.customPreset.bg) {
      var cp = s.customPreset;
      preset = {
        name: cp.name || 'Custom',
        bg: cp.bg,
        bgMid: cp.bgMid || shade(cp.bg, -0.06),
        accent: cp.accent,
        tx: cp.tx,
        surface: cp.surface || '#ffffff'
      };
    } else {
      preset = PRESETS[s.preset] || PRESETS['default'];
    }
    var accent = s.accent || preset.accent;
    var accentDark = shade(accent, -0.2);

    var r = document.documentElement;
    r.style.setProperty('--sl-pink-light', preset.bg);
    r.style.setProperty('--sl-pink-mid', preset.bgMid);
    r.style.setProperty('--sl-peach', preset.bgMid);
    r.style.setProperty('--sl-terracotta', accent);
    r.style.setProperty('--sl-terracotta-dark', accentDark);
    r.style.setProperty('--sl-brown', preset.tx);
    r.style.setProperty('--sl-white', preset.surface);
    r.style.setProperty('--sl-bg', preset.bg);
    r.style.setProperty('--sl-tx', preset.tx);
    r.style.setProperty('--sl-ac', accent);
    r.style.setProperty('--sl-ac-hover', accentDark);
    r.style.setProperty('--sl-surface', preset.surface);
    r.style.setProperty('--pink-light', preset.bg);
    r.style.setProperty('--pink-mid', preset.bgMid);
    r.style.setProperty('--pink', preset.bg);
    r.style.setProperty('--peach', preset.bgMid);
    r.style.setProperty('--terracotta', accent);
    r.style.setProperty('--terracotta-dark', accentDark);
    r.style.setProperty('--brown', preset.tx);
    r.style.setProperty('--white', preset.surface);
    r.style.setProperty('--bg', preset.bg);
    r.style.setProperty('--tx', preset.tx);
    r.style.setProperty('--ac', accent);
    r.style.setProperty('--ac2', accentDark);

    var mult = TEXT_SIZES[s.textSize] || 1.0;
    r.style.setProperty('font-size', (16 * mult) + 'px');

    r.setAttribute('data-sl-theme', s.preset);
    r.setAttribute('data-sl-motion', s.motion ? 'on' : 'off');
    r.setAttribute('data-sl-texture', s.texture ? 'on' : 'off');
    if (hasCustom()) r.setAttribute('data-sl-custom', 'on');
    else r.removeAttribute('data-sl-custom');
  }

  apply();

  function getPalette() {
    var s = load();
    var preset;
    if (s.customPreset && s.customPreset.bg) {
      preset = s.customPreset;
    } else {
      preset = PRESETS[s.preset] || PRESETS['default'];
    }
    var accent = s.accent || preset.accent;
    return {
      bg: preset.bg,
      bgMid: preset.bgMid || shade(preset.bg, -0.06),
      ac: accent,
      ac2: shade(accent, -0.2),
      tx: preset.tx,
      surface: preset.surface || '#ffffff',
      isCustom: hasCustom()
    };
  }

  window.StufloverTheme = {
    PRESETS: PRESETS,
    TEXT_SIZES: TEXT_SIZES,
    load: load,
    apply: apply,
    getPalette: getPalette,
    update: function (partial) {
      var s = load();
      if (partial && partial.preset && !partial.customPreset) s.customPreset = null;
      for (var k in partial) s[k] = partial[k];
      save(s);
      apply(s);
      return s;
    },
    reset: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      apply(defaults());
      return defaults();
    }
  };
})();

(function () {
  if (window.__slNavMounted) return;
  window.__slNavMounted = true;

  var TABS = [
    { id: 'mypage',   label: 'My Page', href: 'lifestyle.html',  match: ['lifestyle.html'],                 icon: iconHome },
    { id: 'play',     label: 'Play',    href: 'games.html',      match: ['activities.html','games.html','fitcheck.html','fitforit.html','catalog.html','collab.html','academic.html','wishingwell.html'], icon: iconPlay },
    { id: 'friends',  label: 'Friends', href: 'friends.html',    match: ['friends.html','flovee.html'],     icon: iconUsers },
    { id: 'me',       label: 'Me',      href: 'account.html',    match: ['account.html','auth.html'],       icon: iconUser }
  ];

  function isAuthed() { return !!localStorage.getItem('stuflover_token'); }

  function currentFile() {
    var path = (location.pathname || '').split('/').pop() || 'index.html';
    return path || 'index.html';
  }

  function activeTabId() {
    if (window.__slActiveTabOverride) return window.__slActiveTabOverride;
    var file = currentFile();
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].match.indexOf(file) !== -1) return TABS[i].id;
    }
    return null;
  }

  function isPlayChild() {
    var file = currentFile();
    if (file === 'games.html') return false;
    var playTab = null;
    for (var i = 0; i < TABS.length; i++) if (TABS[i].id === 'play') { playTab = TABS[i]; break; }
    return !!playTab && playTab.match.indexOf(file) !== -1;
  }

  function hrefFor(tab) {
    if (tab.id === 'me' && !isAuthed()) return 'auth.html';
    return tab.href;
  }

  function removeLegacyNav() {
    var selectors = ['nav#mainNav', 'nav.sl-nav', '.top-bar'];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { el.remove(); });
    });
  }

  function tabLink(tab, active) {
    var a = document.createElement('a');
    a.className = 'sl-tab' + (active ? ' is-active' : '');
    a.href = hrefFor(tab);
    a.setAttribute('data-tab', tab.id);
    if (active) {
      a.setAttribute('aria-current', 'page');
      a.addEventListener('click', function (e) { e.preventDefault(); });
    } else {
      a.addEventListener('click', markNavStart);
    }
    a.appendChild(tab.icon());
    var span = document.createElement('span');
    span.textContent = tab.label;
    a.appendChild(span);
    return a;
  }

  function markNavStart() {
    try {
      if (window.performance && performance.mark) {
        performance.mark('sl-nav-click');
        try { localStorage.setItem('sl_nav_click_ts', String(Date.now())); } catch (e) {}
      }
    } catch (e) {}
  }

  function buildNav() {
    var active = activeTabId();

    var top = document.createElement('nav');
    top.id = 'sl-top-nav';
    top.setAttribute('aria-label', 'Main');

    var left = document.createElement('div');
    left.className = 'sl-left';
    var logo = document.createElement('a');
    logo.className = 'sl-logo';
    logo.href = 'index.html';
    logo.textContent = 'Stuflover';
    logo.addEventListener('click', markNavStart);
    left.appendChild(logo);

    if (isPlayChild()) {
      var back = document.createElement('a');
      back.className = 'sl-back-chip';
      back.href = 'activities.html';
      back.setAttribute('aria-label', 'Back to Play');
      back.textContent = '← Play';
      back.addEventListener('click', markNavStart);
      left.appendChild(back);
    }
    top.appendChild(left);

    var tabsWrap = document.createElement('div');
    tabsWrap.className = 'sl-tabs';
    TABS.forEach(function (t) { tabsWrap.appendChild(tabLink(t, t.id === active)); });
    top.appendChild(tabsWrap);

    var user = document.createElement('span');
    user.className = 'sl-user';
    var u = null;
    try { u = JSON.parse(localStorage.getItem('stuflover_user') || 'null'); } catch (e) {}
    user.textContent = u && u.username ? 'Hi, ' + u.username : '';
    top.appendChild(user);

    var bottom = document.createElement('nav');
    bottom.id = 'sl-bottom-tabs';
    bottom.setAttribute('aria-label', 'Main (mobile)');
    TABS.forEach(function (t) { bottom.appendChild(tabLink(t, t.id === active)); });

    document.body.insertBefore(top, document.body.firstChild);
    document.body.appendChild(bottom);
  }

  function svg(pathD) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', pathD);
    s.appendChild(p);
    return s;
  }
  function iconHome()  { return svg('M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z'); }
  function iconPlay()  { return svg('M8 5v14l11-7z'); }
  function iconUsers() { return svg('M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM3 21a7 7 0 0 1 14 0M21 21a5 5 0 0 0-4-4.9'); }
  function iconUser()  { return svg('M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'); }

  /* ── Idle prefetch of top nav targets ───────────────────────
     After the current page settles, warm the HTTP cache for the
     other top-level nav pages so the next click lands instantly.
     Skipped when the user has opted into data-saver. */
  function prefetchNavTargets() {
    try {
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;
    } catch (e) {}

    var here = currentFile();
    var seen = {};
    TABS.forEach(function (t) {
      var href = hrefFor(t);
      if (href === here || seen[href]) return;
      seen[href] = true;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.setAttribute('as', 'document');
      document.head.appendChild(link);
    });
  }

  function scheduleIdle(fn) {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(fn, { timeout: 2000 });
    } else {
      setTimeout(fn, 800);
    }
  }

  function measureArrival() {
    try {
      if (!window.performance || !performance.mark) return;
      var ts = null;
      try { ts = parseInt(localStorage.getItem('sl_nav_click_ts') || '', 10); } catch (e) {}
      if (!ts || !isFinite(ts)) return;
      var delta = Date.now() - ts;
      if (delta > 0 && delta < 10000) {
        performance.mark('sl-nav-paint');
        try { performance.measure('sl-nav-transition', { start: performance.timeOrigin + 0, duration: delta }); } catch (e) {}
        if (window.__slNavDebug) {
          try { console.log('[sl-nav] transition ' + currentFile() + ': ' + delta + 'ms'); } catch (e) {}
        }
      }
      try { localStorage.removeItem('sl_nav_click_ts'); } catch (e) {}
    } catch (e) {}
  }

  function mount() {
    removeLegacyNav();
    buildNav();
    measureArrival();
    scheduleIdle(prefetchNavTargets);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }

  function setActiveTab(id) {
    window.__slActiveTabOverride = id || null;
    var tabs = document.querySelectorAll('#sl-top-nav .sl-tab, #sl-bottom-tabs .sl-tab');
    tabs.forEach(function (el) {
      var isActive = el.getAttribute('data-tab') === id;
      el.classList.toggle('is-active', isActive);
      if (isActive) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }
  window.StufloverNav = window.StufloverNav || {};
  window.StufloverNav.setActiveTab = setActiveTab;
})();
