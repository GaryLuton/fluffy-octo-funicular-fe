/* ============================================================
   STUFLOVER FIRST-SESSION TOUR
   Shows a full-screen overlay the first time a quiz-completed
   user lands on lifestyle.html: the assigned Flovee greets by
   name and walks them to their first activity, first Flovee
   chat, and first moment of calm. Sets stuflover_first_session
   so it never reappears.
   ============================================================ */
(function () {
  if (window.__slTourMounted) return;
  window.__slTourMounted = true;

  var page = (location.pathname || '').split('/').pop() || '';
  if (page && page !== 'lifestyle.html') return;

  function getProfile() {
    try { return JSON.parse(localStorage.getItem('stuflover_profile') || 'null'); }
    catch (e) { return null; }
  }

  var profile = getProfile();
  if (!profile || !profile.aesthetics) return;                        // no quiz data → no tour
  if (localStorage.getItem('stuflover_first_session') === 'done') return; // already done

  // Derive Flovee name from top aesthetic (mirror flovee.html logic).
  var AE_TO_FLOVEE = {
    kawaii:'Lumi', softgirl:'Vesper', cleangirl:'Lumi', coquette:'Vesper',
    goth:'Nox', darkacad:'Delara', grunge:'Nox', y2k:'Zola', street:'Miro',
    cottage:'Seraph', hippie:'Seraph', oldmoney:'Delara', preppy:'Lumi',
    indie:'Miro', emo:'Nox'
  };
  var sorted = Object.entries(profile.aesthetics).sort(function (a, b) { return b[1] - a[1]; });
  var top = sorted[0] && sorted[0][0];
  var who = AE_TO_FLOVEE[top] || 'your Flovee';

  function markDone() {
    try { localStorage.setItem('stuflover_first_session', 'done'); } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById('sl-tour-styles')) return;
    var css = '\
#sl-tour {\
  position: fixed; inset: 0; z-index: 500;\
  display: flex; align-items: center; justify-content: center;\
  background: rgba(42, 26, 20, 0.55);\
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);\
  padding: 20px; opacity: 0; transition: opacity 300ms ease;\
}\
#sl-tour.is-open { opacity: 1; }\
#sl-tour .sl-tour-card {\
  background: #fff; border-radius: 20px; max-width: 460px; width: 100%;\
  padding: 28px 28px 22px; box-shadow: 0 20px 60px rgba(0,0,0,0.2);\
  font-family: "Space Grotesk", sans-serif; color: #2a1a14;\
  transform: translateY(12px); transition: transform 320ms cubic-bezier(0.34,1.56,0.64,1);\
  max-height: 90vh; overflow-y: auto;\
}\
#sl-tour.is-open .sl-tour-card { transform: translateY(0); }\
#sl-tour .sl-tour-eyebrow {\
  font-family: "Barlow Condensed", sans-serif; font-weight: 900;\
  font-size: 0.62rem; letter-spacing: 4px; text-transform: uppercase;\
  color: #c87860; margin-bottom: 8px;\
}\
#sl-tour h2 {\
  font-family: "Barlow Condensed", sans-serif; font-weight: 900;\
  font-size: 1.9rem; letter-spacing: -0.5px; line-height: 1.1;\
  margin: 0 0 10px; text-transform: none;\
}\
#sl-tour .sl-tour-sub { font-size: 0.92rem; line-height: 1.6; opacity: 0.68; margin-bottom: 18px; }\
#sl-tour .sl-tour-steps { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }\
#sl-tour .sl-tour-step {\
  display: flex; align-items: center; gap: 14px;\
  padding: 14px; border-radius: 12px; border: 1.5px solid rgba(42,26,20,0.1);\
  color: inherit; text-decoration: none;\
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;\
}\
#sl-tour .sl-tour-step:hover {\
  border-color: #c87860; background: rgba(200,120,96,0.06); transform: translateX(3px);\
}\
#sl-tour .sl-tour-step .sl-tour-emoji {\
  flex: 0 0 44px; height: 44px; border-radius: 50%;\
  display: flex; align-items: center; justify-content: center;\
  font-size: 1.4rem; background: rgba(200,120,96,0.12);\
}\
#sl-tour .sl-tour-step-text { flex: 1; min-width: 0; }\
#sl-tour .sl-tour-step-title {\
  font-family: "Barlow Condensed", sans-serif; font-weight: 900;\
  font-size: 0.92rem; letter-spacing: 1.5px; text-transform: uppercase; line-height: 1.2;\
}\
#sl-tour .sl-tour-step-sub { font-size: 0.78rem; opacity: 0.55; margin-top: 2px; line-height: 1.45; }\
#sl-tour .sl-tour-step-arrow { opacity: 0.35; }\
#sl-tour .sl-tour-foot {\
  display: flex; justify-content: space-between; align-items: center;\
  padding-top: 6px; border-top: 1px solid rgba(42,26,20,0.06);\
}\
#sl-tour .sl-tour-skip {\
  background: none; border: none; color: #2a1a14; opacity: 0.45; cursor: pointer;\
  font-family: "Barlow Condensed", sans-serif; font-weight: 800;\
  font-size: 0.68rem; letter-spacing: 2px; text-transform: uppercase; padding: 8px 10px;\
}\
#sl-tour .sl-tour-skip:hover { opacity: 0.9; }\
#sl-tour .sl-tour-note { font-size: 0.68rem; opacity: 0.4; }\
@media (max-width: 520px) {\
  #sl-tour .sl-tour-card { padding: 22px 20px 18px; border-radius: 16px; }\
  #sl-tour h2 { font-size: 1.5rem; }\
}\
';
    var style = document.createElement('style');
    style.id = 'sl-tour-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildStep(emoji, title, subtitle, href) {
    var a = document.createElement('a');
    a.className = 'sl-tour-step';
    a.href = href;
    a.innerHTML =
      '<div class="sl-tour-emoji">' + emoji + '</div>' +
      '<div class="sl-tour-step-text">' +
        '<div class="sl-tour-step-title">' + title + '</div>' +
        '<div class="sl-tour-step-sub">' + subtitle + '</div>' +
      '</div>' +
      '<svg class="sl-tour-step-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
    a.addEventListener('click', function () { markDone(); });
    return a;
  }

  function mount() {
    injectStyles();
    var overlay = document.createElement('div');
    overlay.id = 'sl-tour';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Welcome to Stuflover');

    var card = document.createElement('div');
    card.className = 'sl-tour-card';

    var eyebrow = document.createElement('div');
    eyebrow.className = 'sl-tour-eyebrow';
    eyebrow.textContent = 'Your Flovee is here';

    var h = document.createElement('h2');
    h.textContent = 'Hi, I\u2019m ' + who + '.';

    var sub = document.createElement('p');
    sub.className = 'sl-tour-sub';
    sub.textContent = 'Pick one thing to start. You can do the rest whenever — I\u2019ll be waiting.';

    var steps = document.createElement('div');
    steps.className = 'sl-tour-steps';
    steps.appendChild(buildStep('\uD83C\uDFAE', 'Try your first activity', 'Ideas picked for your aesthetic', 'activities.html'));
    steps.appendChild(buildStep('\uD83D\uDCAC', 'Say hi to ' + who,        'A quick chat with your Flovee',        'flovee.html'));
    steps.appendChild(buildStep('\uD83C\uDF3F', 'One minute of calm',       'A breathing moment in BeYou',          'beyou.html'));

    var foot = document.createElement('div');
    foot.className = 'sl-tour-foot';
    var skip = document.createElement('button');
    skip.className = 'sl-tour-skip';
    skip.type = 'button';
    skip.textContent = 'Maybe later';
    skip.addEventListener('click', function () { close(); });
    var note = document.createElement('span');
    note.className = 'sl-tour-note';
    note.textContent = 'Shown once.';
    foot.appendChild(skip);
    foot.appendChild(note);

    card.appendChild(eyebrow);
    card.appendChild(h);
    card.appendChild(sub);
    card.appendChild(steps);
    card.appendChild(foot);
    overlay.appendChild(card);

    function close() {
      markDone();
      overlay.classList.remove('is-open');
      setTimeout(function () { overlay.remove(); }, 320);
    }

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('is-open'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
