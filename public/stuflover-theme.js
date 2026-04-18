/* ============================================================
   STUFLOVER SITE THEME / EXPERIENCE SYSTEM
   Applies user-chosen colors and experience settings (text size,
   motion, texture) site-wide. Settings live in localStorage so
   they persist across pages. Controls live on the Me page.
   Idempotent — safe to include multiple times.
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

  function injectThemeStyles() {
    if (document.getElementById('sl-theme-styles')) return;
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
