/* ============================================================
   STUFLOVER LOCALSTORAGE SCHEMA VERSION
   Tiny synchronous script — load in <head> BEFORE any other
   script that reads or writes stuflover_* keys. Keeps a single
   stuflover_schema_version cell and runs numbered migrations
   to upgrade legacy blobs in place. Migrations must be idempotent.
   ============================================================ */
(function () {
  var VERSION_KEY = 'stuflover_schema_version';
  var CURRENT = 1;

  // Known persisted keys (for audits / future namespacing).
  // Not enforced today, listed so migrations can reason about what exists.
  var KNOWN_KEYS = [
    'stuflover_token', 'stuflover_user', 'stuflover_profile',
    'stuflover_theme', 'stuflover_contacts', 'stuflover_quiz_done',
    'stuflover_pending_quiz', 'stuflover_daily_open', 'stuflover_closet',
    'stuflover_chat_font', 'stuflover_update_seen', 'stuflover_flovee_reply',
    'stuflover_seen_flovee'
  ];

  // Migrations are keyed by target version. Each takes no args and mutates
  // localStorage in place. Keep them small, tolerant of missing keys, and
  // side-effect-free on re-run.
  var migrations = {
    1: function () {
      // Establish the baseline. Nothing to rewrite yet — older installs had
      // no version key and match the v1 shape. Future versions can migrate
      // e.g. `stuflover_flovee_chat_*` blobs into a namespaced container or
      // compress their JSON bodies.
    }
    // 2: function () { /* add when the schema changes */ }
  };

  function readVersion() {
    var raw = localStorage.getItem(VERSION_KEY);
    if (raw == null) return 0;
    var n = parseInt(raw, 10);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  try {
    if (!('localStorage' in window)) return;
    var from = readVersion();
    if (from === CURRENT) return;
    if (from > CURRENT) {
      // User rolled back to an older build. Leave data intact; a newer
      // schema is forward-compatible unless a migration says otherwise.
      return;
    }
    for (var v = from + 1; v <= CURRENT; v++) {
      var fn = migrations[v];
      if (typeof fn === 'function') {
        try { fn(); } catch (e) { /* one failing migration should not brick the app */ }
      }
      localStorage.setItem(VERSION_KEY, String(v));
    }
  } catch (e) { /* private mode / quota / disabled — ignore */ }

  // Exported for tests and future migrations. Not a public API.
  window.__stufloverSchema = { VERSION: CURRENT, KNOWN_KEYS: KNOWN_KEYS };
})();
