/* ============================================================
   STUFLOVER THEME BOOT
   Tiny synchronous script — loaded in <head> BEFORE any
   page-specific <style> so persisted theme tokens are applied
   before first paint. Returning users never see a palette flash.

   The full theme API (PRESETS, update, reset, …) lives in
   stuflover-nav.js / stuflover-theme.js and loads later.
   ============================================================ */
(function () {
  try {
    var PRESETS = {
      'default': { bg: '#faf0f0', bgMid: '#f0ddd6', accent: '#c87860', tx: '#2a1a14', surface: '#ffffff' },
      'rose':    { bg: '#fbe8ec', bgMid: '#f5cdd5', accent: '#d84a6b', tx: '#2a0e18', surface: '#ffffff' },
      'mint':    { bg: '#e8f5ef', bgMid: '#cde8dc', accent: '#3fa874', tx: '#0e2419', surface: '#ffffff' },
      'lilac':   { bg: '#f0e8fa', bgMid: '#ddcdf0', accent: '#8a5fd8', tx: '#1a0c2a', surface: '#ffffff' },
      'ocean':   { bg: '#e4f1f8', bgMid: '#c8dfed', accent: '#2e86b8', tx: '#0c1a24', surface: '#ffffff' },
      'sunset':  { bg: '#fcead2', bgMid: '#f6d2a8', accent: '#e07b3c', tx: '#2a140a', surface: '#ffffff' },
      'mono':    { bg: '#f5f5f5', bgMid: '#e0e0e0', accent: '#333333', tx: '#111111', surface: '#ffffff' },
      'dark':    { bg: '#1a1418', bgMid: '#2a1f25', accent: '#e08a95', tx: '#f5e8e8', surface: '#2a1f25' }
    };
    function shade(h, p) {
      h = (h || '').replace('#', '');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      if (h.length !== 6) return '#' + h;
      var r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
      var f = p < 0 ? (1 + p) : 1, a = p > 0 ? p * 255 : 0;
      r = Math.max(0, Math.min(255, Math.round(r*f+a)));
      g = Math.max(0, Math.min(255, Math.round(g*f+a)));
      b = Math.max(0, Math.min(255, Math.round(b*f+a)));
      return '#' + [r,g,b].map(function(x){var s=x.toString(16);return s.length<2?'0'+s:s;}).join('');
    }
    var s = JSON.parse(localStorage.getItem('stuflover_theme') || 'null') || {};
    var preset = (s.customPreset && s.customPreset.bg)
      ? { bg: s.customPreset.bg, bgMid: s.customPreset.bgMid || shade(s.customPreset.bg, -0.06),
          accent: s.customPreset.accent, tx: s.customPreset.tx, surface: s.customPreset.surface || '#ffffff' }
      : (PRESETS[s.preset] || PRESETS['default']);
    var accent = s.accent || preset.accent;
    var accentDark = shade(accent, -0.2);
    var r = document.documentElement;
    var vars = {
      '--sl-pink-light': preset.bg, '--sl-pink-mid': preset.bgMid, '--sl-peach': preset.bgMid,
      '--sl-terracotta': accent, '--sl-terracotta-dark': accentDark,
      '--sl-brown': preset.tx, '--sl-white': preset.surface,
      '--sl-bg': preset.bg, '--sl-tx': preset.tx, '--sl-ac': accent, '--sl-ac-hover': accentDark, '--sl-surface': preset.surface,
      '--pink-light': preset.bg, '--pink-mid': preset.bgMid, '--pink': preset.bg, '--peach': preset.bgMid,
      '--terracotta': accent, '--terracotta-dark': accentDark, '--brown': preset.tx, '--white': preset.surface,
      '--bg': preset.bg, '--tx': preset.tx, '--ac': accent, '--ac2': accentDark
    };
    for (var k in vars) r.style.setProperty(k, vars[k]);
    var SIZES = { small: 0.9, 'default': 1.0, large: 1.1, xlarge: 1.2 };
    r.style.setProperty('font-size', (16 * (SIZES[s.textSize] || 1.0)) + 'px');
    if (s.preset) r.setAttribute('data-sl-theme', s.preset);
    r.setAttribute('data-sl-motion', s.motion === false ? 'off' : 'on');
    r.setAttribute('data-sl-texture', s.texture === false ? 'off' : 'on');
    if (localStorage.getItem('stuflover_theme')) r.setAttribute('data-sl-custom', 'on');
  } catch (e) {}
})();
