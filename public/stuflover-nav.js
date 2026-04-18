/* ============================================================
   STUFLOVER SHARED NAV
   Injects a consistent 5-tab nav on every page.
   Desktop: sticky top bar. Mobile: top logo + bottom tab bar.
   Idempotent — safe to include multiple times.
   ============================================================ */

/* ── SITE THEME / EXPERIENCE SYSTEM ───────────────────────────
   Applies user-chosen colors and experience settings (text size,
   motion, texture) site-wide. Settings live in localStorage so
   they persist across pages. Controls are exposed on the Me page.
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
    var preset = PRESETS[s.preset] || PRESETS['default'];
    var accent = s.accent || preset.accent;
    var accentDark = shade(accent, -0.2);

    var r = document.documentElement;
    // Design-system tokens
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
    // Page-local aliases used by individual pages that redefine vars
    r.style.setProperty('--pink-light', preset.bg);
    r.style.setProperty('--pink-mid', preset.bgMid);
    r.style.setProperty('--pink', preset.bg);
    r.style.setProperty('--peach', preset.bgMid);
    r.style.setProperty('--terracotta', accent);
    r.style.setProperty('--terracotta-dark', accentDark);
    r.style.setProperty('--brown', preset.tx);
    r.style.setProperty('--white', preset.surface);
    // Short aliases used by activities.html and aesthetic pages
    r.style.setProperty('--bg', preset.bg);
    r.style.setProperty('--tx', preset.tx);
    r.style.setProperty('--ac', accent);
    r.style.setProperty('--ac2', accentDark);

    var mult = TEXT_SIZES[s.textSize] || 1.0;
    r.style.setProperty('font-size', (16 * mult) + 'px');

    r.setAttribute('data-sl-theme', s.preset);
    r.setAttribute('data-sl-motion', s.motion ? 'on' : 'off');
    r.setAttribute('data-sl-texture', s.texture ? 'on' : 'off');
    // Only force the body/text overrides when the user has actively chosen
    // settings — otherwise per-page aesthetic (PAL) palettes keep working.
    if (hasCustom()) r.setAttribute('data-sl-custom', 'on');
    else r.removeAttribute('data-sl-custom');
  }

  apply();

  function injectThemeStyles() {
    if (document.getElementById('sl-theme-styles')) return;
    // These use !important so they override per-page inline styles set by
    // aesthetic/PAL scripts (e.g. document.body.style.background = ...).
    var css = ''
      + 'html[data-sl-custom="on"] body {'
      + '  background-color: var(--sl-bg) !important;'
      + '  color: var(--sl-tx) !important;'
      + '}'
      + 'html[data-sl-custom="on"] h1, html[data-sl-custom="on"] h2,'
      + 'html[data-sl-custom="on"] h3, html[data-sl-custom="on"] h4,'
      + 'html[data-sl-custom="on"] h5, html[data-sl-custom="on"] h6,'
      + 'html[data-sl-custom="on"] .bc, html[data-sl-custom="on"] .logo {'
      + '  color: var(--sl-tx) !important;'
      + '}'
      + 'html[data-sl-custom="on"] a { color: var(--sl-ac); }'
      + 'html[data-sl-motion="off"] *, html[data-sl-motion="off"] *::before, html[data-sl-motion="off"] *::after {'
      + '  animation-duration: 0ms !important; animation-delay: 0ms !important;'
      + '  transition-duration: 0ms !important; transition-delay: 0ms !important;'
      + '  scroll-behavior: auto !important;'
      + '}'
      + 'html[data-sl-texture="off"] body { background-image: none !important; }';
    var style = document.createElement('style');
    style.id = 'sl-theme-styles';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectThemeStyles);
  } else {
    injectThemeStyles();
  }

  window.StufloverTheme = {
    PRESETS: PRESETS,
    TEXT_SIZES: TEXT_SIZES,
    load: load,
    apply: apply,
    update: function (partial) {
      var s = load();
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
    { id: 'play',     label: 'Play',    href: 'activities.html', match: ['activities.html','fitcheck.html','fitforit.html','catalog.html','beyou.html','collab.html','academic.html','wishingwell.html'], icon: iconPlay },
    { id: 'flovee',   label: 'Flovee',  href: 'friends.html?flovee=1', match: ['flovee.html'],             icon: iconSpark, smart: true },
    { id: 'friends',  label: 'Friends', href: 'friends.html',    match: ['friends.html'],                   icon: iconUsers },
    { id: 'me',       label: 'Me',      href: 'account.html',    match: ['account.html','auth.html'],       icon: iconUser }
  ];

  function getProfile() {
    try { return JSON.parse(localStorage.getItem('stuflover_profile') || 'null'); }
    catch (e) { return null; }
  }
  function isAuthed() { return !!localStorage.getItem('stuflover_token'); }

  function currentFile() {
    var path = (location.pathname || '').split('/').pop() || 'index.html';
    return path || 'index.html';
  }

  function activeTabId() {
    var file = currentFile();
    if (file === 'friends.html' && inFloveeMode()) return 'flovee';
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].match.indexOf(file) !== -1) return TABS[i].id;
    }
    return null;
  }

  function isPlayChild() {
    var file = currentFile();
    if (file === 'activities.html') return false;
    var playTab = null;
    for (var i = 0; i < TABS.length; i++) if (TABS[i].id === 'play') { playTab = TABS[i]; break; }
    return !!playTab && playTab.match.indexOf(file) !== -1;
  }

  function hrefFor(tab) {
    // Flovee tab: route quiz-less users to the quiz instead of a blank chat.
    if (tab.smart && tab.id === 'flovee' && !getProfile()) return 'index.html#quiz';
    // Me tab: unauthed → auth page.
    if (tab.id === 'me' && !isAuthed()) return 'auth.html';
    return tab.href;
  }

  // Mark Flovee tab active when Friends page is opened with ?flovee=1.
  function inFloveeMode() {
    try {
      var p = new URLSearchParams(location.search || '');
      return p.get('flovee') === '1' || p.get('chat') === 'flovee';
    } catch (e) { return false; }
  }

  function removeLegacyNav() {
    var selectors = [
      'nav#mainNav',
      'nav.sl-nav',
      '.top-bar'
    ];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { el.remove(); });
    });
    // index.html wraps nav in <nav class="sl-nav"> too — already covered above.
  }

  function injectStyles() {
    if (document.getElementById('sl-nav-styles')) return;
    var css = '\
:root { --sl-nav-h: 60px; --sl-tabs-h: 62px; }\
body { padding-top: var(--sl-nav-h); }\
#sl-top-nav {\
  position: fixed; top: 0; left: 0; right: 0; height: var(--sl-nav-h);\
  display: flex; align-items: center; justify-content: space-between;\
  gap: 12px; padding: 0 24px; z-index: 300;\
  background: rgba(250, 240, 240, 0.82); backdrop-filter: blur(18px) saturate(1.4);\
  -webkit-backdrop-filter: blur(18px) saturate(1.4);\
  border-bottom: 1px solid rgba(42, 26, 20, 0.08);\
}\
#sl-top-nav .sl-logo {\
  font-family: "Barlow Condensed", sans-serif; font-weight: 900;\
  font-size: 1.4rem; letter-spacing: 3px; text-transform: uppercase;\
  color: var(--sl-tx, #2a1a14); text-decoration: none; white-space: nowrap;\
}\
#sl-top-nav .sl-left { display: flex; align-items: center; gap: 14px; min-width: 0; }\
#sl-top-nav .sl-back-chip {\
  display: inline-flex; align-items: center; gap: 6px;\
  padding: 7px 14px; border-radius: 999px;\
  border: 1.5px solid rgba(42, 26, 20, 0.12);\
  font-family: "Barlow Condensed", sans-serif; font-weight: 800;\
  font-size: 0.72rem; letter-spacing: 2px; text-transform: uppercase;\
  color: var(--sl-tx, #2a1a14); text-decoration: none; white-space: nowrap;\
  transition: border-color 180ms ease, background 180ms ease;\
}\
#sl-top-nav .sl-back-chip:hover {\
  border-color: var(--sl-tx, #2a1a14);\
  background: rgba(42, 26, 20, 0.04);\
}\
#sl-top-nav .sl-tabs { display: flex; gap: 4px; flex-wrap: nowrap; }\
#sl-top-nav .sl-tab {\
  display: inline-flex; align-items: center; gap: 8px;\
  padding: 10px 18px; border-radius: 999px;\
  font-family: "Barlow Condensed", sans-serif; font-weight: 800;\
  font-size: 0.82rem; letter-spacing: 2.5px; text-transform: uppercase;\
  color: var(--sl-tx, #2a1a14); text-decoration: none; white-space: nowrap;\
  transition: background 180ms ease, color 180ms ease;\
}\
#sl-top-nav .sl-tab:hover { background: rgba(42, 26, 20, 0.06); }\
#sl-top-nav .sl-tab.is-active {\
  background: var(--sl-ac, #c87860); color: #fff;\
}\
#sl-top-nav .sl-tab svg { width: 16px; height: 16px; flex-shrink: 0; }\
#sl-top-nav .sl-user {\
  font-family: "Barlow Condensed", sans-serif; font-weight: 700;\
  font-size: 0.72rem; letter-spacing: 2px; text-transform: uppercase;\
  color: rgba(42, 26, 20, 0.55); white-space: nowrap;\
  max-width: 160px; overflow: hidden; text-overflow: ellipsis;\
}\
#sl-bottom-tabs { display: none; }\
/* Tablet / narrow desktop — drop the user greeting and tighten tab padding so tabs don\'t collide */\
@media (max-width: 999px) {\
  #sl-top-nav .sl-user { display: none; }\
  #sl-top-nav .sl-tab { padding: 9px 12px; letter-spacing: 1.5px; font-size: 0.78rem; gap: 6px; }\
  #sl-top-nav .sl-tab svg { width: 15px; height: 15px; }\
}\
/* Mobile — swap top tabs for a bottom tab bar */\
@media (max-width: 760px) {\
  body { padding-top: var(--sl-nav-h); padding-bottom: calc(var(--sl-tabs-h) + env(safe-area-inset-bottom, 0px)); }\
  #sl-top-nav { padding: 0 16px; }\
  #sl-top-nav .sl-tabs { display: none; }\
  #sl-bottom-tabs {\
    display: grid; grid-template-columns: repeat(5, 1fr);\
    position: fixed; bottom: 0; left: 0; right: 0; height: var(--sl-tabs-h);\
    background: rgba(250, 240, 240, 0.92); backdrop-filter: blur(18px) saturate(1.4);\
    -webkit-backdrop-filter: blur(18px) saturate(1.4);\
    border-top: 1px solid rgba(42, 26, 20, 0.1); z-index: 300;\
    padding-bottom: env(safe-area-inset-bottom, 0);\
  }\
  #sl-bottom-tabs .sl-tab {\
    display: flex; flex-direction: column; align-items: center; justify-content: center;\
    gap: 3px; padding: 4px 2px; text-decoration: none; color: var(--sl-tx, #2a1a14);\
    font-family: "Barlow Condensed", sans-serif; font-weight: 800;\
    font-size: 0.62rem; letter-spacing: 1.5px; text-transform: uppercase;\
    opacity: 0.55; transition: opacity 150ms ease, color 150ms ease;\
    min-width: 0;\
  }\
  #sl-bottom-tabs .sl-tab span {\
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\
  }\
  #sl-bottom-tabs .sl-tab svg { width: 22px; height: 22px; flex-shrink: 0; }\
  #sl-bottom-tabs .sl-tab.is-active { opacity: 1; color: var(--sl-ac, #c87860); }\
}\
/* Small phones — tighten logo and hide back-chip label; bottom tab labels get smaller */\
@media (max-width: 480px) {\
  #sl-top-nav { padding: 0 12px; gap: 8px; }\
  #sl-top-nav .sl-logo { font-size: 1.2rem; letter-spacing: 2px; }\
  #sl-top-nav .sl-back-chip { padding: 6px 10px; font-size: 0.65rem; letter-spacing: 1.5px; }\
  #sl-bottom-tabs .sl-tab { letter-spacing: 1px; font-size: 0.58rem; }\
  #sl-bottom-tabs .sl-tab svg { width: 20px; height: 20px; }\
}\
/* Very small phones — icon-only bottom tabs so labels never collide */\
@media (max-width: 360px) {\
  #sl-top-nav .sl-logo { font-size: 1.1rem; letter-spacing: 1.5px; }\
  #sl-bottom-tabs .sl-tab span { display: none; }\
  #sl-bottom-tabs .sl-tab svg { width: 24px; height: 24px; }\
}\
';
    var style = document.createElement('style');
    style.id = 'sl-nav-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function tabLink(tab, active, variant) {
    var a = document.createElement('a');
    a.className = 'sl-tab' + (active ? ' is-active' : '');
    a.href = hrefFor(tab);
    a.setAttribute('data-tab', tab.id);
    if (active) a.setAttribute('aria-current', 'page');
    a.appendChild(tab.icon());
    var span = document.createElement('span');
    span.textContent = tab.label;
    a.appendChild(span);
    return a;
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
    left.appendChild(logo);

    if (isPlayChild()) {
      var back = document.createElement('a');
      back.className = 'sl-back-chip';
      back.href = 'activities.html';
      back.setAttribute('aria-label', 'Back to Play');
      back.textContent = '← Play';
      left.appendChild(back);
    }
    top.appendChild(left);

    var tabsWrap = document.createElement('div');
    tabsWrap.className = 'sl-tabs';
    TABS.forEach(function (t) { tabsWrap.appendChild(tabLink(t, t.id === active, 'top')); });
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
    TABS.forEach(function (t) { bottom.appendChild(tabLink(t, t.id === active, 'bottom')); });

    document.body.insertBefore(top, document.body.firstChild);
    document.body.appendChild(bottom);
  }

  // ── SVG icon helpers ─────────────────────────────────────
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
  function iconSpark() { return svg('M12 2l2.4 6.4L21 11l-6.6 2.6L12 20l-2.4-6.4L3 11l6.6-2.6z'); }
  function iconUsers() { return svg('M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM3 21a7 7 0 0 1 14 0M21 21a5 5 0 0 0-4-4.9'); }
  function iconUser()  { return svg('M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'); }

  function mount() {
    injectStyles();
    removeLegacyNav();
    buildNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
