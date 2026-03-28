/**
 * Stuflover Backend Connector
 * Drop this script into any page to enable:
 *  - Auth-gated access (redirects to /auth.html if not logged in)
 *  - API proxy (routes Anthropic calls through /api/chat)
 *  - Auto-sync localStorage data to the server
 *  - Logout functionality
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'stuflover_token';
  const USER_KEY = 'stuflover_user';

  // Key mapping: server key -> localStorage key
  const KEY_MAP = {
    profile: 'stuflover_profile',
    wishlist: 'stuflover_wishlist',
    catalog: 'stuflover_catalog',
    approved: 'stuflover_approved',
    contacts: 'stuflover_contacts',
    convos: 'stuflover_convos',
    vids: 'stuflover_vids',
  };
  const LS_TO_SERVER = {};
  for (const [k, v] of Object.entries(KEY_MAP)) LS_TO_SERVER[v] = k;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }

  // ─── Auth Gate ───
  // Redirect to auth page if not logged in (skip if already on auth page)
  if (!getToken() && !window.location.pathname.includes('auth.html')) {
    window.location.href = '/auth.html';
  }

  // ─── Override fetch to proxy Anthropic calls ───
  const _origFetch = window.fetch;
  window.fetch = function (url, opts) {
    if (typeof url === 'string' && url.includes('api.anthropic.com')) {
      // Rewrite to use our proxy
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      return _origFetch.call(this, '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getToken(),
        },
        body: JSON.stringify(body),
      });
    }
    return _origFetch.call(this, url, opts);
  };

  // ─── Sync localStorage changes to server ───
  // Wrap localStorage.setItem to auto-sync relevant keys
  const _origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    _origSetItem.call(this, key, value);
    const serverKey = LS_TO_SERVER[key];
    if (serverKey && getToken()) {
      let parsed;
      try { parsed = JSON.parse(value); } catch { parsed = value; }
      _origFetch.call(window, '/api/data/' + serverKey, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getToken(),
        },
        body: JSON.stringify({ value: parsed }),
      }).catch(function () {}); // fire and forget
    }
  };

  // ─── Remove the old API key banner ───
  // Hide any existing API key banners since the key is now server-side
  window.addEventListener('DOMContentLoaded', function () {
    // Remove API key banners (they have ids like 'api-key-banner' or contain api key inputs)
    document.querySelectorAll('[id*="api-key"], [id*="apiKey"], [id*="api_key"]').forEach(function (el) {
      el.style.display = 'none';
    });
    // Also hide the old getApiKey banner if it was created dynamically
    var banners = document.querySelectorAll('.api-banner, #apiBanner');
    banners.forEach(function (b) { b.style.display = 'none'; });
  });

  // ─── Provide global getApiKey that returns a placeholder ───
  // Pages that call getApiKey() will get a truthy value so they don't show the banner
  window.getApiKey = function () {
    return getToken() ? 'server-proxied' : '';
  };

  // ─── Logout utility ───
  window.stufloverLogout = function () {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = '/auth.html';
  };

  // ─── Expose user info ───
  window.stufloverUser = getUser;

})();
