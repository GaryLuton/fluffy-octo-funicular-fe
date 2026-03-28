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

  var TOKEN_KEY = 'stuflover_token';
  var USER_KEY = 'stuflover_user';

  // API base URL — set window.STUFLOVER_API_URL before this script loads,
  // or it defaults to '' (same origin) for Railway hosting
  var API_BASE = window.STUFLOVER_API_URL || '';

  // Key mapping: server key -> localStorage key
  var KEY_MAP = {
    profile: 'stuflover_profile',
    wishlist: 'stuflover_wishlist',
    catalog: 'stuflover_catalog',
    approved: 'stuflover_approved',
    contacts: 'stuflover_contacts',
    convos: 'stuflover_convos',
    vids: 'stuflover_vids',
  };
  var LS_TO_SERVER = {};
  for (var k in KEY_MAP) LS_TO_SERVER[KEY_MAP[k]] = k;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  }

  // ─── Auth Gate ───
  if (!getToken() && !window.location.pathname.includes('auth.html')) {
    window.location.href = '/auth.html';
  }

  // ─── Override fetch to proxy Anthropic calls ───
  var _origFetch = window.fetch;
  window.fetch = function (url, opts) {
    if (typeof url === 'string' && url.includes('api.anthropic.com')) {
      var body = opts && opts.body ? JSON.parse(opts.body) : {};
      return _origFetch.call(this, API_BASE + '/api/chat', {
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
  var _origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    _origSetItem.call(this, key, value);
    var serverKey = LS_TO_SERVER[key];
    if (serverKey && getToken()) {
      var parsed;
      try { parsed = JSON.parse(value); } catch (e) { parsed = value; }
      _origFetch.call(window, API_BASE + '/api/data/' + serverKey, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getToken(),
        },
        body: JSON.stringify({ value: parsed }),
      }).catch(function () {});
    }
  };

  // ─── Remove the old API key banner ───
  window.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[id*="api-key"], [id*="apiKey"], [id*="api_key"]').forEach(function (el) {
      el.style.display = 'none';
    });
    var banners = document.querySelectorAll('.api-banner, #apiBanner');
    banners.forEach(function (b) { b.style.display = 'none'; });
  });

  // ─── Provide global getApiKey that returns a placeholder ───
  window.getApiKey = function () {
    return getToken() ? 'server-proxied' : '';
  };

  // ─── Logout utility ───
  window.stufloverLogout = function () {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = '/auth.html';
  };

  // ─── Expose user info and API base ───
  window.stufloverUser = getUser;
  window.STUFLOVER_API_URL = API_BASE;

})();
