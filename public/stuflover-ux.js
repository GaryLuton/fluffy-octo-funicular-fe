// ═══ STUFLOVER UX ENHANCEMENTS ═══
// Loaded on all pages via script tag
(function(){
  'use strict';

  // 1. Button click animations
  document.addEventListener('click', function(e){
    var btn = e.target.closest('button,a,.boredom-card,.feature-card,.feed-card,.closet-item,.hub-tile');
    if(!btn) return;
    btn.style.transition = 'transform 0.15s';
    btn.style.transform = 'scale(0.95)';
    setTimeout(function(){ btn.style.transform = ''; }, 150);
  });

  // 2. Touch targets — ensure all buttons are at least 44px
  document.querySelectorAll('button,a[href],.opt,.opt-check').forEach(function(el){
    var h = el.offsetHeight;
    if(h > 0 && h < 44) el.style.minHeight = '44px';
  });

  // 11. Haptic vibration on submit buttons
  document.addEventListener('click', function(e){
    var btn = e.target.closest('button[type="submit"],.send-btn,.start-btn,.action-btn,.closet-add,.next-btn,.builder-btn,.refresh-btn');
    if(btn && navigator.vibrate) navigator.vibrate(30);
  });

  // 13. Real activity notifications (only true stuff)
  async function showRealActivity(){
    var existing = document.getElementById('socialProof');
    if(existing) existing.remove();
    var msg = null;
    try{
      var token = localStorage.getItem('stuflover_token');
      if(!token) return;
      var base = window.STUFLOVER_API_URL || '';
      // Check for pending friend requests
      var res = await (window._origFetch||fetch).call(window, base+'/api/friends/requests',{
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}
      });
      if(res.ok){
        var data = await res.json();
        if(data.requests && data.requests.length > 0){
          msg = data.requests[0].username + ' wants to be your friend';
        }
      }
      // If no friend requests, check for new messages
      if(!msg){
        var fres = await (window._origFetch||fetch).call(window, base+'/api/friends',{
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}
        });
        if(fres.ok){
          var fdata = await fres.json();
          if(fdata.friends && fdata.friends.length > 0){
            msg = 'you have ' + fdata.friends.length + ' friend' + (fdata.friends.length>1?'s':'') + ' on stuflover';
          }
        }
      }
    }catch(e){}
    if(!msg) return; // Don't show anything fake
    var popup = document.createElement('div');
    popup.id = 'socialProof';
    popup.style.cssText = 'position:fixed;bottom:20px;left:20px;padding:12px 18px;border-radius:12px;background:rgba(42,26,20,0.85);color:white;font-size:0.78rem;z-index:500;backdrop-filter:blur(10px);animation:slideInLeft 0.4s ease;max-width:260px;line-height:1.5;box-shadow:0 4px 20px rgba(0,0,0,0.15);';
    popup.textContent = msg;
    document.body.appendChild(popup);
    setTimeout(function(){ popup.style.opacity='0'; popup.style.transition='opacity 0.3s'; }, 4000);
    setTimeout(function(){ popup.remove(); }, 4500);
  }
  // Show real activity after 8 seconds, then every 60 seconds
  setTimeout(showRealActivity, 8000);
  setInterval(showRealActivity, 60000);

  // 15. Easter egg — tap logo 3 times for confetti
  var logoTaps = 0;
  var logoTimer = null;
  document.querySelectorAll('.logo,.nav-logo').forEach(function(logo){
    logo.addEventListener('click', function(e){
      logoTaps++;
      clearTimeout(logoTimer);
      logoTimer = setTimeout(function(){ logoTaps = 0; }, 800);
      if(logoTaps >= 3){
        logoTaps = 0;
        // Confetti burst
        for(var i=0;i<30;i++){
          var dot = document.createElement('div');
          var colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#cc5de8','#ff922b'];
          dot.style.cssText = 'position:fixed;width:8px;height:8px;border-radius:50%;z-index:9999;pointer-events:none;background:'+colors[i%colors.length]+';left:50%;top:50%;transition:all 1s cubic-bezier(0.34,1.56,0.64,1);';
          document.body.appendChild(dot);
          var x = (Math.random()-0.5)*window.innerWidth*0.8;
          var y = (Math.random()-0.5)*window.innerHeight*0.8;
          setTimeout(function(d,xx,yy){
            d.style.transform='translate('+xx+'px,'+yy+'px) scale(0)';
            d.style.opacity='0';
          }.bind(null,dot,x,y), 20);
          setTimeout(function(d){d.remove();}.bind(null,dot), 1200);
        }
        if(navigator.vibrate) navigator.vibrate([50,30,50]);
      }
    });
  });

  // 16. Scroll progress bar
  var bar = document.createElement('div');
  bar.id = 'scrollProgress';
  bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;z-index:9999;transition:width 0.1s;width:0;pointer-events:none;background:linear-gradient(90deg,#c87860,#e8829a,#9070e0,#4d96ff);border-radius:0 2px 2px 0;box-shadow:0 0 8px rgba(200,120,96,0.4);';
  document.body.appendChild(bar);
  window.addEventListener('scroll', function(){
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var pct = h > 0 ? (window.scrollY / h) * 100 : 0;
    bar.style.width = pct + '%';
  });

  // CSS for animations
  var css = document.createElement('style');
  css.textContent = '@keyframes slideInLeft{from{transform:translateX(-100%);opacity:0;}to{transform:translateX(0);opacity:1;}}';
  document.head.appendChild(css);

})();
