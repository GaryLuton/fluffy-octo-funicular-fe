/* ============================================================
   STUFLOVER SHARED NAV
   Injects a consistent 5-tab nav on every page.
   Desktop: sticky top bar. Mobile: top logo + bottom tab bar.
   Idempotent — safe to include multiple times.
   ============================================================ */
(function () {
  if (window.__slNavMounted) return;
  window.__slNavMounted = true;

  var TABS = [
    { id: 'mypage',   label: 'My Page', href: 'lifestyle.html',  match: ['lifestyle.html'],                 icon: iconHome },
    { id: 'play',     label: 'Play',    href: 'activities.html', match: ['activities.html','fitcheck.html','fitforit.html','catalog.html','beyou.html','collab.html','academic.html','wishingwell.html'], icon: iconPlay },
    { id: 'flovee',   label: 'Flovee',  href: 'flovee.html',     match: ['flovee.html'],                    icon: iconSpark, smart: true },
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
