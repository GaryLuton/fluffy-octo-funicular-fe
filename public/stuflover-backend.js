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
    vid_liked: 'stuflover_vid_liked',
    vid_disliked: 'stuflover_vid_disliked',
  };
  var LS_TO_SERVER = {};
  for (var k in KEY_MAP) LS_TO_SERVER[KEY_MAP[k]] = k;

  // Dynamic key prefix: stuflover_chat_* -> chat_*
  function lsKeyToServer(lsKey) {
    if (LS_TO_SERVER[lsKey]) return LS_TO_SERVER[lsKey];
    if (lsKey.indexOf('stuflover_chat_') === 0) return lsKey.replace('stuflover_', '');
    return null;
  }

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
    var serverKey = lsKeyToServer(key);
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

  // ─── Track page visits ───
  if (getToken() && !window.location.pathname.includes('auth.html') && !window.location.pathname.includes('admin.html')) {
    var page = window.location.pathname.replace(/^\//, '').replace(/\.html$/, '') || 'index';
    _origFetch.call(window, API_BASE + '/api/activity/page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken(),
      },
      body: JSON.stringify({ page: page }),
    }).catch(function () {});
  }

  // ─── Expose user info and API base ───
  window.stufloverUser = getUser;
  window.STUFLOVER_API_URL = API_BASE;

  // ─── Message Notification System (runs on ALL pages) ───
  function _playPing(){
    try{
      var ctx = new (window.AudioContext||window.webkitAudioContext)();
      var o1 = ctx.createOscillator(); var g1 = ctx.createGain();
      o1.connect(g1); g1.connect(ctx.destination);
      o1.frequency.value=880; o1.type='sine';
      g1.gain.setValueAtTime(0.25,ctx.currentTime);
      g1.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3);
      o1.start(ctx.currentTime); o1.stop(ctx.currentTime+0.3);
      var o2 = ctx.createOscillator(); var g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination);
      o2.frequency.value=1100; o2.type='sine';
      g2.gain.setValueAtTime(0.18,ctx.currentTime+0.15);
      g2.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
      o2.start(ctx.currentTime+0.15); o2.stop(ctx.currentTime+0.4);
    }catch(e){}
  }

  // Request notification permission
  document.addEventListener('click', function(){
    if('Notification' in window && Notification.permission==='default') Notification.requestPermission();
  }, {once:true});

  // Poll for new messages on every page
  if(getToken() && !window.location.pathname.includes('auth.html')){
    setInterval(function(){
      _origFetch.call(window, API_BASE+'/api/friends', {
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()}
      }).then(function(r){return r.json();}).then(function(d){
        var friends = d.friends||[];
        friends.forEach(function(f){
          _origFetch.call(window, API_BASE+'/api/friends/messages/'+f.id, {
            headers:{'Content-Type':'application/json','Authorization':'Bearer '+getToken()}
          }).then(function(r){return r.json();}).then(function(md){
            var msgs = md.messages||[];
            if(msgs.length===0) return;
            var latest = msgs[msgs.length-1];
            var key = 'stuflover_lastmsg_'+f.id;
            var lastKnown = parseInt(localStorage.getItem(key)||'0');
            var user = getUser();
            var myId = user ? parseInt(user.id) : 0;
            var latestId = latest.id||0;
            if(latestId > lastKnown && parseInt(latest.from_user)!==myId){
              _playPing();
              if('Notification' in window && Notification.permission==='granted'){
                try{new Notification('Message from '+f.username, {body:latest.text.substring(0,60)});}catch(e){}
              }
              localStorage.setItem(key, latestId.toString());
            } else if(latestId > lastKnown){
              localStorage.setItem(key, latestId.toString());
            }
          }).catch(function(){});
        });
      }).catch(function(){});
    }, 8000);
  }

})();
