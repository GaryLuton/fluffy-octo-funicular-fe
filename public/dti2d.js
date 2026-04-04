// ═══════════════════════════════════════════════════════════
// DTI 2D Avatar System — Fashion-illustration style canvas renderer
// Replaces dti3d.js (Three.js) with a layered 2D canvas approach
// ═══════════════════════════════════════════════════════════

var dti2D = {
  canvas: null,
  ctx: null,
  initialized: false,
  skinTone: null,
  clothing: {},
  animFrameId: null,
  breathPhase: 0,
  runwayAnim: false,
  runwayPhase: 0,
  width: 0,
  height: 0,
  scale: 1
};

// ── Helper: hex color manipulation ──
function dti2DShade(hex, amt) {
  try {
    var c = hex.slice(1).match(/.{2}/g).map(function(x){ return parseInt(x,16); });
    var r = Math.max(0, Math.min(255, c[0]+amt));
    var g = Math.max(0, Math.min(255, c[1]+amt));
    var b = Math.max(0, Math.min(255, c[2]+amt));
    return '#'+(r<16?'0':'')+r.toString(16)+(g<16?'0':'')+g.toString(16)+(b<16?'0':'')+b.toString(16);
  } catch(e) { return hex; }
}

function dti2DAlpha(hex, a) {
  try {
    var c = hex.slice(1).match(/.{2}/g).map(function(x){ return parseInt(x,16); });
    return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';
  } catch(e) { return hex; }
}

// Polyfill: rounded rectangle (ctx.roundRect not supported on all browsers)
function dti2DRoundRect(ctx, x, y, w, h, r) {
  var radii;
  if (typeof r === 'number') {
    radii = [r, r, r, r];
  } else if (Array.isArray(r)) {
    radii = [r[0]||0, r[1]||0, r[2]||0, r[3]||0];
  } else {
    radii = [0, 0, 0, 0];
  }
  var tl = radii[0], tr = radii[1], br = radii[2], bl = radii[3];
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

// ── Body Metrics ──
// Computes key body landmark coordinates scaled to canvas size
// Fashion croquis: ~8.5 head-tall figure
function dti2DComputeBodyMetrics(w, h, breathOffset) {
  var s = Math.min(w / 320, h / 580);
  var cx = w / 2;
  var bo = breathOffset || 0;

  // Head unit = total height / 8.5
  var hu = (h * 0.88) / 8.5;
  var topY = h * 0.04;

  var m = {
    s: s,
    cx: cx,
    hu: hu,
    // Head
    headCY: topY + hu * 0.5,
    headRX: hu * 0.38,
    headRY: hu * 0.48,
    // Neck
    neckTop: topY + hu * 0.95,
    neckBot: topY + hu * 1.2,
    neckW: hu * 0.18,
    // Shoulders
    shoulderY: topY + hu * 1.35 + bo * 0.3,
    shoulderW: hu * 0.95,
    // Bust
    bustY: topY + hu * 1.8,
    bustW: hu * 0.85,
    // Waist
    waistY: topY + hu * 2.6 + bo * 0.5,
    waistW: hu * 0.48,
    // Hip
    hipY: topY + hu * 3.2,
    hipW: hu * 0.82,
    // Crotch
    crotchY: topY + hu * 3.8,
    // Knee
    kneeY: topY + hu * 5.4,
    kneeW: hu * 0.22,
    // Ankle
    ankleY: topY + hu * 7.2,
    ankleW: hu * 0.14,
    // Foot
    footY: topY + hu * 7.6,
    footW: hu * 0.28,
    footH: hu * 0.2,
    // Arms
    armOuterX: hu * 0.52,  // offset from cx
    elbowY: topY + hu * 2.8,
    wristY: topY + hu * 3.6,
    handY: topY + hu * 3.9,
    handW: hu * 0.15,
    // Misc
    topY: topY,
    botY: topY + hu * 8.0
  };
  return m;
}

// ── Init Scene ──
function dti2DInitScene() {
  var container = document.getElementById('dti3DContainer');
  if (!container) return;

  // Clean up existing
  if (dti2D.canvas) {
    if (dti2D.animFrameId) cancelAnimationFrame(dti2D.animFrameId);
    container.innerHTML = '';
  }

  var canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.borderRadius = '12px';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  // Get actual rendered size — use offsetWidth/Height as fallback
  var w = container.offsetWidth || container.clientWidth || 0;
  var h = container.offsetHeight || container.clientHeight || 0;

  // If container has no dimensions yet, retry after layout settles
  if (w < 10 || h < 10) {
    // Don't remove canvas — leave it so container has a child that can size
    setTimeout(function() {
      var w2 = container.offsetWidth || container.clientWidth || 0;
      var h2 = container.offsetHeight || container.clientHeight || 0;
      // Use fallback dimensions if still no size
      if (w2 < 10) w2 = 300;
      if (h2 < 10) h2 = 400;
      dti2DFinishInit(canvas, container, w2, h2);
    }, 500);
    return;
  }

  dti2DFinishInit(canvas, container, w, h);
}

function dti2DFinishInit(canvas, container, w, h) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;

  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  dti2D.canvas = canvas;
  dti2D.ctx = ctx;
  dti2D.width = w;
  dti2D.height = h;
  dti2D.scale = dpr;
  dti2D.initialized = true;
  dti2D.clothing = {};
  dti2D.breathPhase = 0;
  dti2D.runwayAnim = false;

  // Default skin
  if (!dti2D.skinTone) {
    dti2D.skinTone = { base: '#b88a60', hi: '#c89a70', lo: '#a87a50' };
  }

  // Resize observer
  var resizeObserver = new ResizeObserver(function() {
    var nw = container.offsetWidth || container.clientWidth;
    var nh = container.offsetHeight || container.clientHeight;
    if (nw > 10 && nh > 10 && (Math.abs(nw - dti2D.width) > 2 || Math.abs(nh - dti2D.height) > 2)) {
      var dp = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = nw * dp;
      canvas.height = nh * dp;
      ctx.setTransform(dp, 0, 0, dp, 0, 0);
      dti2D.width = nw;
      dti2D.height = nh;
    }
  });
  resizeObserver.observe(container);

  // Start animation loop (only if not already running)
  if (!dti2D.animFrameId) dti2DAnimate();
}

// ── Draw Body ──
function dti2DDrawBody(ctx, skin, m) {
  var cx = m.cx;
  var base = skin.base, hi = skin.hi, lo = skin.lo;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── Shadow on ground ──
  var shadowGrad = ctx.createRadialGradient(cx, m.botY, 0, cx, m.botY, m.hu * 0.6);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.1)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(cx, m.botY, m.hu * 0.6, m.hu * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Skin gradient (left highlight, right shadow)
  var skinGrad = ctx.createLinearGradient(cx - m.shoulderW, 0, cx + m.shoulderW, 0);
  skinGrad.addColorStop(0, hi);
  skinGrad.addColorStop(0.4, base);
  skinGrad.addColorStop(1, lo);

  // ── LEGS ──
  var legSpread = m.hu * 0.12;

  // Left leg
  ctx.fillStyle = skinGrad;
  ctx.beginPath();
  ctx.moveTo(cx - legSpread - m.hu * 0.18, m.crotchY);
  ctx.quadraticCurveTo(cx - legSpread - m.hu * 0.2, m.kneeY, cx - legSpread - m.kneeW, m.kneeY);
  ctx.quadraticCurveTo(cx - legSpread - m.hu * 0.16, (m.kneeY + m.ankleY) / 2, cx - legSpread - m.ankleW, m.ankleY);
  ctx.lineTo(cx - legSpread - m.ankleW, m.footY);
  ctx.lineTo(cx - legSpread + m.ankleW, m.footY);
  ctx.lineTo(cx - legSpread + m.ankleW, m.ankleY);
  ctx.quadraticCurveTo(cx - legSpread + m.hu * 0.16, (m.kneeY + m.ankleY) / 2, cx - legSpread + m.kneeW, m.kneeY);
  ctx.quadraticCurveTo(cx - legSpread + m.hu * 0.18, m.crotchY, cx - legSpread + m.hu * 0.14, m.crotchY);
  ctx.closePath();
  ctx.fill();

  // Right leg
  ctx.beginPath();
  ctx.moveTo(cx + legSpread + m.hu * 0.18, m.crotchY);
  ctx.quadraticCurveTo(cx + legSpread + m.hu * 0.2, m.kneeY, cx + legSpread + m.kneeW, m.kneeY);
  ctx.quadraticCurveTo(cx + legSpread + m.hu * 0.16, (m.kneeY + m.ankleY) / 2, cx + legSpread + m.ankleW, m.ankleY);
  ctx.lineTo(cx + legSpread + m.ankleW, m.footY);
  ctx.lineTo(cx + legSpread - m.ankleW, m.footY);
  ctx.lineTo(cx + legSpread - m.ankleW, m.ankleY);
  ctx.quadraticCurveTo(cx + legSpread - m.hu * 0.16, (m.kneeY + m.ankleY) / 2, cx + legSpread - m.kneeW, m.kneeY);
  ctx.quadraticCurveTo(cx + legSpread - m.hu * 0.18, m.crotchY, cx + legSpread - m.hu * 0.14, m.crotchY);
  ctx.closePath();
  ctx.fill();

  // ── FEET (bare) ──
  ctx.fillStyle = base;
  // Left foot
  ctx.beginPath();
  ctx.ellipse(cx - legSpread, m.footY, m.footW * 0.5, m.footH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Right foot
  ctx.beginPath();
  ctx.ellipse(cx + legSpread, m.footY, m.footW * 0.5, m.footH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── TORSO ──
  ctx.fillStyle = skinGrad;
  ctx.beginPath();
  // Start at left shoulder
  ctx.moveTo(cx - m.shoulderW / 2, m.shoulderY);
  // Shoulder to bust
  ctx.quadraticCurveTo(cx - m.bustW / 2 - m.hu * 0.05, m.bustY - m.hu * 0.2, cx - m.bustW / 2, m.bustY);
  // Bust to waist
  ctx.quadraticCurveTo(cx - m.bustW / 2 + m.hu * 0.05, (m.bustY + m.waistY) / 2, cx - m.waistW / 2, m.waistY);
  // Waist to hip
  ctx.quadraticCurveTo(cx - m.waistW / 2 - m.hu * 0.08, (m.waistY + m.hipY) / 2, cx - m.hipW / 2, m.hipY);
  // Hip to crotch
  ctx.quadraticCurveTo(cx - m.hipW / 2 + m.hu * 0.05, (m.hipY + m.crotchY) / 2, cx - legSpread, m.crotchY);
  // Across crotch
  ctx.lineTo(cx + legSpread, m.crotchY);
  // Right side up
  ctx.quadraticCurveTo(cx + m.hipW / 2 - m.hu * 0.05, (m.hipY + m.crotchY) / 2, cx + m.hipW / 2, m.hipY);
  ctx.quadraticCurveTo(cx + m.waistW / 2 + m.hu * 0.08, (m.waistY + m.hipY) / 2, cx + m.waistW / 2, m.waistY);
  ctx.quadraticCurveTo(cx + m.bustW / 2 - m.hu * 0.05, (m.bustY + m.waistY) / 2, cx + m.bustW / 2, m.bustY);
  ctx.quadraticCurveTo(cx + m.bustW / 2 + m.hu * 0.05, m.bustY - m.hu * 0.2, cx + m.shoulderW / 2, m.shoulderY);
  ctx.closePath();
  ctx.fill();

  // Bust line subtle shadow
  ctx.strokeStyle = dti2DAlpha(lo, 0.15);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - m.bustW / 2 + m.hu * 0.1, m.bustY + m.hu * 0.02);
  ctx.quadraticCurveTo(cx, m.bustY + m.hu * 0.08, cx + m.bustW / 2 - m.hu * 0.1, m.bustY + m.hu * 0.02);
  ctx.stroke();

  // ── ARMS ──
  var armW = m.hu * 0.12;

  // Left arm
  ctx.fillStyle = skinGrad;
  ctx.beginPath();
  ctx.moveTo(cx - m.shoulderW / 2, m.shoulderY);
  ctx.quadraticCurveTo(cx - m.armOuterX - armW, m.elbowY, cx - m.armOuterX - armW * 0.7, m.wristY);
  ctx.lineTo(cx - m.armOuterX - m.handW / 2, m.handY);
  // Hand
  ctx.quadraticCurveTo(cx - m.armOuterX - m.handW * 0.6, m.handY + m.hu * 0.15, cx - m.armOuterX + m.handW * 0.2, m.handY + m.hu * 0.12);
  ctx.lineTo(cx - m.armOuterX + armW * 0.5, m.wristY);
  ctx.quadraticCurveTo(cx - m.armOuterX + armW * 0.3, m.elbowY, cx - m.shoulderW / 2 + m.hu * 0.08, m.shoulderY + m.hu * 0.15);
  ctx.closePath();
  ctx.fill();

  // Right arm
  ctx.beginPath();
  ctx.moveTo(cx + m.shoulderW / 2, m.shoulderY);
  ctx.quadraticCurveTo(cx + m.armOuterX + armW, m.elbowY, cx + m.armOuterX + armW * 0.7, m.wristY);
  ctx.lineTo(cx + m.armOuterX + m.handW / 2, m.handY);
  ctx.quadraticCurveTo(cx + m.armOuterX + m.handW * 0.6, m.handY + m.hu * 0.15, cx + m.armOuterX - m.handW * 0.2, m.handY + m.hu * 0.12);
  ctx.lineTo(cx + m.armOuterX - armW * 0.5, m.wristY);
  ctx.quadraticCurveTo(cx + m.armOuterX - armW * 0.3, m.elbowY, cx + m.shoulderW / 2 - m.hu * 0.08, m.shoulderY + m.hu * 0.15);
  ctx.closePath();
  ctx.fill();

  // ── NECK ──
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(cx - m.neckW, m.neckTop);
  ctx.lineTo(cx - m.neckW * 1.2, m.neckBot);
  ctx.lineTo(cx + m.neckW * 1.2, m.neckBot);
  ctx.lineTo(cx + m.neckW, m.neckTop);
  ctx.closePath();
  ctx.fill();

  // Neck shadow
  ctx.fillStyle = dti2DAlpha(lo, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx, m.neckBot, m.neckW * 1.3, m.hu * 0.04, 0, 0, Math.PI);
  ctx.fill();

  // ── HEAD ──
  // Head gradient
  var headGrad = ctx.createRadialGradient(
    cx - m.headRX * 0.3, m.headCY - m.headRY * 0.2, m.headRX * 0.1,
    cx, m.headCY, m.headRY * 1.1
  );
  headGrad.addColorStop(0, hi);
  headGrad.addColorStop(0.5, base);
  headGrad.addColorStop(1, lo);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(cx, m.headCY, m.headRX, m.headRY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Jaw line (slight chin taper)
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(cx - m.headRX * 0.85, m.headCY + m.headRY * 0.3);
  ctx.quadraticCurveTo(cx - m.headRX * 0.5, m.headCY + m.headRY * 1.05, cx, m.headCY + m.headRY * 1.08);
  ctx.quadraticCurveTo(cx + m.headRX * 0.5, m.headCY + m.headRY * 1.05, cx + m.headRX * 0.85, m.headCY + m.headRY * 0.3);
  ctx.lineTo(cx + m.headRX * 0.85, m.headCY + m.headRY * 0.6);
  ctx.quadraticCurveTo(cx, m.headCY + m.headRY * 0.9, cx - m.headRX * 0.85, m.headCY + m.headRY * 0.6);
  ctx.closePath();
  ctx.fill();

  // ── EARS ──
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(cx - m.headRX * 0.97, m.headCY + m.headRY * 0.05, m.hu * 0.04, m.hu * 0.07, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + m.headRX * 0.97, m.headCY + m.headRY * 0.05, m.hu * 0.04, m.hu * 0.07, 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Underwear (base layer under clothing) ──
function dti2DDrawUnderwear(ctx, skin, m) {
  var cx = m.cx;
  var lo = skin.lo;
  // Simple dark base underwear
  var uwColor = dti2DShade(lo, -40);
  ctx.save();
  ctx.fillStyle = uwColor;
  // Bra
  ctx.beginPath();
  ctx.moveTo(cx - m.bustW / 2 + m.hu * 0.06, m.bustY - m.hu * 0.06);
  ctx.quadraticCurveTo(cx - m.bustW / 4, m.bustY + m.hu * 0.06, cx, m.bustY);
  ctx.quadraticCurveTo(cx + m.bustW / 4, m.bustY + m.hu * 0.06, cx + m.bustW / 2 - m.hu * 0.06, m.bustY - m.hu * 0.06);
  ctx.lineTo(cx + m.bustW / 2 - m.hu * 0.06, m.bustY - m.hu * 0.12);
  ctx.lineTo(cx - m.bustW / 2 + m.hu * 0.06, m.bustY - m.hu * 0.12);
  ctx.closePath();
  ctx.fill();
  // Brief
  ctx.beginPath();
  ctx.moveTo(cx - m.hipW / 2 + m.hu * 0.05, m.hipY + m.hu * 0.02);
  ctx.quadraticCurveTo(cx, m.crotchY + m.hu * 0.05, cx + m.hipW / 2 - m.hu * 0.05, m.hipY + m.hu * 0.02);
  ctx.lineTo(cx + m.hipW / 2 - m.hu * 0.05, m.hipY - m.hu * 0.08);
  ctx.quadraticCurveTo(cx, m.hipY - m.hu * 0.04, cx - m.hipW / 2 + m.hu * 0.05, m.hipY - m.hu * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Draw Face ──
function dti2DDrawFace(ctx, skin, m) {
  var cx = m.cx;
  var hu = m.hu;
  var headCY = m.headCY;
  var headRX = m.headRX;
  var headRY = m.headRY;
  var base = skin.base, lo = skin.lo;

  ctx.save();

  // Eye positions
  var eyeY = headCY - headRY * 0.05;
  var eyeSpacing = headRX * 0.42;
  var eyeW = hu * 0.09;
  var eyeH = hu * 0.04;

  // ── EYEBROWS ──
  ctx.strokeStyle = dti2DShade(skin.base, -60);
  ctx.lineWidth = hu * 0.025;
  ctx.lineCap = 'round';
  // Left brow
  ctx.beginPath();
  ctx.moveTo(cx - eyeSpacing - eyeW * 0.8, eyeY - eyeH * 2.2);
  ctx.quadraticCurveTo(cx - eyeSpacing, eyeY - eyeH * 3.2, cx - eyeSpacing + eyeW * 0.9, eyeY - eyeH * 2.5);
  ctx.stroke();
  // Right brow
  ctx.beginPath();
  ctx.moveTo(cx + eyeSpacing + eyeW * 0.8, eyeY - eyeH * 2.2);
  ctx.quadraticCurveTo(cx + eyeSpacing, eyeY - eyeH * 3.2, cx + eyeSpacing - eyeW * 0.9, eyeY - eyeH * 2.5);
  ctx.stroke();

  // ── EYES ──
  // Eye whites
  ctx.fillStyle = '#f8f5f0';
  ctx.beginPath();
  ctx.ellipse(cx - eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Irises
  ctx.fillStyle = '#5a3a20';
  var irisR = eyeH * 0.85;
  ctx.beginPath();
  ctx.arc(cx - eyeSpacing, eyeY + eyeH * 0.1, irisR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeSpacing, eyeY + eyeH * 0.1, irisR, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = '#1a0a00';
  var pupilR = irisR * 0.5;
  ctx.beginPath();
  ctx.arc(cx - eyeSpacing, eyeY + eyeH * 0.1, pupilR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeSpacing, eyeY + eyeH * 0.1, pupilR, 0, Math.PI * 2);
  ctx.fill();

  // Eye highlights
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(cx - eyeSpacing - irisR * 0.3, eyeY - eyeH * 0.1, pupilR * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeSpacing - irisR * 0.3, eyeY - eyeH * 0.1, pupilR * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyeliner / lash line
  ctx.strokeStyle = '#1a0a05';
  ctx.lineWidth = hu * 0.015;
  // Left eye
  ctx.beginPath();
  ctx.moveTo(cx - eyeSpacing - eyeW * 1.05, eyeY + eyeH * 0.1);
  ctx.quadraticCurveTo(cx - eyeSpacing, eyeY - eyeH * 1.15, cx - eyeSpacing + eyeW * 1.1, eyeY - eyeH * 0.1);
  ctx.stroke();
  // Right eye
  ctx.beginPath();
  ctx.moveTo(cx + eyeSpacing - eyeW * 1.1, eyeY - eyeH * 0.1);
  ctx.quadraticCurveTo(cx + eyeSpacing, eyeY - eyeH * 1.15, cx + eyeSpacing + eyeW * 1.05, eyeY + eyeH * 0.1);
  ctx.stroke();

  // Lashes (small strokes)
  ctx.lineWidth = hu * 0.01;
  for (var li = 0; li < 4; li++) {
    var lx = cx - eyeSpacing - eyeW * 0.6 + (eyeW * 1.2 / 3) * li;
    var ly = eyeY - eyeH * (0.9 + Math.sin(li * 0.8) * 0.2);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx - hu * 0.005, ly - hu * 0.02);
    ctx.stroke();
    var rx = cx + eyeSpacing - eyeW * 0.6 + (eyeW * 1.2 / 3) * li;
    ctx.beginPath();
    ctx.moveTo(rx, ly);
    ctx.lineTo(rx + hu * 0.005, ly - hu * 0.02);
    ctx.stroke();
  }

  // ── NOSE ──
  ctx.strokeStyle = dti2DAlpha(lo, 0.3);
  ctx.lineWidth = hu * 0.012;
  var noseY = headCY + headRY * 0.25;
  ctx.beginPath();
  ctx.moveTo(cx - hu * 0.02, noseY - hu * 0.06);
  ctx.quadraticCurveTo(cx - hu * 0.04, noseY, cx - hu * 0.025, noseY + hu * 0.01);
  ctx.stroke();
  // Nostril hints
  ctx.beginPath();
  ctx.arc(cx - hu * 0.02, noseY + hu * 0.005, hu * 0.01, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + hu * 0.02, noseY + hu * 0.005, hu * 0.01, 0, Math.PI * 2);
  ctx.stroke();

  // ── LIPS ──
  var lipY = headCY + headRY * 0.52;
  var lipW = hu * 0.1;
  var lipColor = dti2DShade(base, -20);
  var lipHi = dti2DShade(lipColor, 30);

  // Upper lip
  ctx.fillStyle = lipColor;
  ctx.beginPath();
  ctx.moveTo(cx - lipW, lipY);
  ctx.quadraticCurveTo(cx - lipW * 0.5, lipY - hu * 0.03, cx, lipY - hu * 0.02);
  ctx.quadraticCurveTo(cx + lipW * 0.5, lipY - hu * 0.03, cx + lipW, lipY);
  ctx.quadraticCurveTo(cx + lipW * 0.3, lipY + hu * 0.005, cx, lipY + hu * 0.005);
  ctx.quadraticCurveTo(cx - lipW * 0.3, lipY + hu * 0.005, cx - lipW, lipY);
  ctx.fill();

  // Lower lip
  ctx.fillStyle = lipHi;
  ctx.beginPath();
  ctx.moveTo(cx - lipW * 0.85, lipY + hu * 0.005);
  ctx.quadraticCurveTo(cx, lipY + hu * 0.055, cx + lipW * 0.85, lipY + hu * 0.005);
  ctx.quadraticCurveTo(cx, lipY + hu * 0.04, cx - lipW * 0.85, lipY + hu * 0.005);
  ctx.fill();

  // Lip highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.ellipse(cx, lipY + hu * 0.025, lipW * 0.3, hu * 0.01, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── CHEEK BLUSH ──
  var blushColor = dti2DAlpha(dti2DShade(base, -10), 0.08);
  ctx.fillStyle = blushColor;
  ctx.beginPath();
  ctx.ellipse(cx - headRX * 0.6, headCY + headRY * 0.2, hu * 0.06, hu * 0.04, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + headRX * 0.6, headCY + headRY * 0.2, hu * 0.06, hu * 0.04, 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// HAIR DRAWING — each style has drawBack + drawFront
// ═══════════════════════════════════════════════════════════

// Helper: draw strand lines for realism
function dti2DStrands(ctx, points, color, width) {
  ctx.strokeStyle = dti2DAlpha(color, 0.1);
  ctx.lineWidth = width || 0.8;
  ctx.lineCap = 'round';
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    if (p.length === 6) ctx.quadraticCurveTo(p[2], p[3], p[4], p[5]);
    else if (p.length === 8) ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
    else ctx.lineTo(p[2], p[3]);
    ctx.stroke();
  }
}

// Helper: hair cap (covers top of head)
function dti2DHairCap(ctx, color, m, volumeX, volumeY) {
  var cx = m.cx, hcy = m.headCY, hrx = m.headRX, hry = m.headRY;
  var vx = volumeX || 1.08;
  var vy = volumeY || 1.15;
  var hi = dti2DShade(color, 30);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, hcy - hry * 0.1, hrx * vx, hry * vy, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  // Shine highlight
  ctx.fillStyle = dti2DAlpha(hi, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx - hrx * 0.15, hcy - hry * 0.6, hrx * 0.45, hry * 0.25, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

// ── hair (Sleek Straight / Curtain Bangs) ──
var dti2DHair_straight = {
  drawBack: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -30);
    ctx.fillStyle = dti2DShade(color, -15);
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.85, hcy);
    ctx.quadraticCurveTo(cx - hrx * 0.9, m.waistY, cx - hrx * 0.6, m.waistY + hu * 0.3);
    ctx.lineTo(cx + hrx * 0.6, m.waistY + hu * 0.3);
    ctx.quadraticCurveTo(cx + hrx * 0.9, m.waistY, cx + hrx * 0.85, hcy);
    ctx.closePath();
    ctx.fill();
    dti2DStrands(ctx, [
      [cx - hrx * 0.7, hcy + hry, cx - hrx * 0.75, m.hipY, cx - hrx * 0.65, m.waistY + hu * 0.2],
      [cx + hrx * 0.7, hcy + hry, cx + hrx * 0.75, m.hipY, cx + hrx * 0.65, m.waistY + hu * 0.2]
    ], dk, 1);
  },
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -35);
    dti2DHairCap(ctx, color, m, 1.1, 1.18);
    ctx.fillStyle = color;
    // Left side
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 1.05, hcy - hry * 0.15);
    ctx.quadraticCurveTo(cx - hrx * 1.15, m.shoulderY, cx - hrx * 1.0, m.bustY);
    ctx.quadraticCurveTo(cx - hrx * 0.95, m.waistY, cx - hrx * 0.7, m.waistY + hu * 0.2);
    ctx.lineTo(cx - hrx * 0.55, m.waistY + hu * 0.1);
    ctx.quadraticCurveTo(cx - hrx * 0.65, m.bustY, cx - hrx * 0.75, m.shoulderY);
    ctx.quadraticCurveTo(cx - hrx * 0.8, hcy + hry * 0.3, cx - hrx * 0.85, hcy);
    ctx.closePath();
    ctx.fill();
    // Right side
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 1.05, hcy - hry * 0.15);
    ctx.quadraticCurveTo(cx + hrx * 1.15, m.shoulderY, cx + hrx * 1.0, m.bustY);
    ctx.quadraticCurveTo(cx + hrx * 0.95, m.waistY, cx + hrx * 0.7, m.waistY + hu * 0.2);
    ctx.lineTo(cx + hrx * 0.55, m.waistY + hu * 0.1);
    ctx.quadraticCurveTo(cx + hrx * 0.65, m.bustY, cx + hrx * 0.75, m.shoulderY);
    ctx.quadraticCurveTo(cx + hrx * 0.8, hcy + hry * 0.3, cx + hrx * 0.85, hcy);
    ctx.closePath();
    ctx.fill();
    // Curtain bangs
    ctx.fillStyle = dti2DShade(color, 5);
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.2, hcy - hry * 0.9);
    ctx.quadraticCurveTo(cx - hrx * 0.8, hcy - hry * 0.5, cx - hrx * 1.05, hcy + hry * 0.3);
    ctx.quadraticCurveTo(cx - hrx * 0.9, hcy + hry * 0.1, cx - hrx * 0.7, hcy - hry * 0.2);
    ctx.quadraticCurveTo(cx - hrx * 0.4, hcy - hry * 0.6, cx - hrx * 0.15, hcy - hry * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 0.2, hcy - hry * 0.9);
    ctx.quadraticCurveTo(cx + hrx * 0.8, hcy - hry * 0.5, cx + hrx * 1.05, hcy + hry * 0.3);
    ctx.quadraticCurveTo(cx + hrx * 0.9, hcy + hry * 0.1, cx + hrx * 0.7, hcy - hry * 0.2);
    ctx.quadraticCurveTo(cx + hrx * 0.4, hcy - hry * 0.6, cx + hrx * 0.15, hcy - hry * 0.75);
    ctx.closePath();
    ctx.fill();
    // Parting line
    ctx.strokeStyle = dti2DAlpha(dk, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, hcy - hry * 1.1);
    ctx.lineTo(cx, hcy - hry * 0.5);
    ctx.stroke();
  }
};

// ── hair_short (Pixie Cut / Short Layered Bob) ──
var dti2DHair_short = {
  drawBack: function(ctx, color, m) {},
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -35);
    dti2DHairCap(ctx, color, m, 1.12, 1.2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 1.08, hcy - hry * 0.1);
    ctx.quadraticCurveTo(cx - hrx * 1.15, hcy + hry * 0.5, cx - hrx * 0.9, hcy + hry * 0.9);
    ctx.quadraticCurveTo(cx - hrx * 0.75, hcy + hry * 1.0, cx - hrx * 0.7, hcy + hry * 0.8);
    ctx.quadraticCurveTo(cx - hrx * 0.8, hcy + hry * 0.4, cx - hrx * 0.88, hcy);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 1.08, hcy - hry * 0.1);
    ctx.quadraticCurveTo(cx + hrx * 1.15, hcy + hry * 0.5, cx + hrx * 0.9, hcy + hry * 0.9);
    ctx.quadraticCurveTo(cx + hrx * 0.75, hcy + hry * 1.0, cx + hrx * 0.7, hcy + hry * 0.8);
    ctx.quadraticCurveTo(cx + hrx * 0.8, hcy + hry * 0.4, cx + hrx * 0.88, hcy);
    ctx.closePath();
    ctx.fill();
    // Wispy bangs
    ctx.fillStyle = dti2DShade(color, 5);
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.6, hcy - hry * 0.95);
    ctx.quadraticCurveTo(cx - hrx * 1.0, hcy - hry * 0.3, cx - hrx * 1.05, hcy + hry * 0.15);
    ctx.quadraticCurveTo(cx - hrx * 0.85, hcy - hry * 0.1, cx - hrx * 0.5, hcy - hry * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 0.6, hcy - hry * 0.95);
    ctx.quadraticCurveTo(cx + hrx * 1.0, hcy - hry * 0.3, cx + hrx * 1.05, hcy + hry * 0.15);
    ctx.quadraticCurveTo(cx + hrx * 0.85, hcy - hry * 0.1, cx + hrx * 0.5, hcy - hry * 0.6);
    ctx.closePath();
    ctx.fill();
    dti2DStrands(ctx, [
      [cx - hrx * 0.9, hcy, cx - hrx * 0.95, hcy + hry * 0.4, cx - hrx * 0.85, hcy + hry * 0.85],
      [cx + hrx * 0.9, hcy, cx + hrx * 0.95, hcy + hry * 0.4, cx + hrx * 0.85, hcy + hry * 0.85]
    ], dk, 0.8);
  }
};

// ── hair_bun (Messy Bun) ──
var dti2DHair_bun = {
  drawBack: function(ctx, color, m) {},
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -35);
    var hi = dti2DShade(color, 25);
    dti2DHairCap(ctx, color, m, 1.06, 1.12);
    // Bun on top
    var bunCY = hcy - hry * 1.25;
    var bunR = hrx * 0.55;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, bunCY, bunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(cx - bunR * 0.2, bunCY - bunR * 0.2, bunR * 0.7, 0, Math.PI * 2);
    ctx.fill();
    // Messy wisp lines on bun
    ctx.strokeStyle = dti2DAlpha(dk, 0.15);
    ctx.lineWidth = 1;
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * bunR * 0.3, bunCY + Math.sin(a) * bunR * 0.3);
      ctx.quadraticCurveTo(
        cx + Math.cos(a + 0.5) * bunR * 0.9,
        bunCY + Math.sin(a + 0.5) * bunR * 0.9,
        cx + Math.cos(a + 1) * bunR * 0.5, bunCY + Math.sin(a + 1) * bunR * 0.5
      );
      ctx.stroke();
    }
    // Face-framing tendrils
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.9, hcy - hry * 0.2);
    ctx.quadraticCurveTo(cx - hrx * 1.0, hcy + hry * 0.4, cx - hrx * 0.8, hcy + hry * 0.85);
    ctx.quadraticCurveTo(cx - hrx * 0.7, hcy + hry * 0.7, cx - hrx * 0.75, hcy + hry * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 0.9, hcy - hry * 0.2);
    ctx.quadraticCurveTo(cx + hrx * 1.0, hcy + hry * 0.4, cx + hrx * 0.8, hcy + hry * 0.85);
    ctx.quadraticCurveTo(cx + hrx * 0.7, hcy + hry * 0.7, cx + hrx * 0.75, hcy + hry * 0.2);
    ctx.closePath();
    ctx.fill();
  }
};

// ── hair_long (Long Flowing Waves) ──
var dti2DHair_long = {
  drawBack: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hrx = m.headRX, hu = m.hu;
    ctx.fillStyle = dti2DShade(color, -15);
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.9, hcy);
    ctx.quadraticCurveTo(cx - hrx * 1.0, m.hipY, cx - hrx * 0.5, m.hipY + hu * 0.6);
    ctx.lineTo(cx + hrx * 0.5, m.hipY + hu * 0.6);
    ctx.quadraticCurveTo(cx + hrx * 1.0, m.hipY, cx + hrx * 0.9, hcy);
    ctx.closePath();
    ctx.fill();
  },
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -35);
    dti2DHairCap(ctx, color, m, 1.12, 1.2);
    ctx.fillStyle = color;
    // Left
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 1.1, hcy - hry * 0.15);
    ctx.quadraticCurveTo(cx - hrx * 1.2, m.shoulderY, cx - hrx * 1.15, m.bustY);
    ctx.bezierCurveTo(cx - hrx * 1.1, m.waistY, cx - hrx * 1.0, m.hipY, cx - hrx * 0.6, m.hipY + hu * 0.5);
    ctx.lineTo(cx - hrx * 0.4, m.hipY + hu * 0.35);
    ctx.quadraticCurveTo(cx - hrx * 0.7, m.waistY, cx - hrx * 0.75, m.shoulderY);
    ctx.quadraticCurveTo(cx - hrx * 0.8, hcy + hry * 0.3, cx - hrx * 0.88, hcy);
    ctx.closePath();
    ctx.fill();
    // Right
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 1.1, hcy - hry * 0.15);
    ctx.quadraticCurveTo(cx + hrx * 1.2, m.shoulderY, cx + hrx * 1.15, m.bustY);
    ctx.bezierCurveTo(cx + hrx * 1.1, m.waistY, cx + hrx * 1.0, m.hipY, cx + hrx * 0.6, m.hipY + hu * 0.5);
    ctx.lineTo(cx + hrx * 0.4, m.hipY + hu * 0.35);
    ctx.quadraticCurveTo(cx + hrx * 0.7, m.waistY, cx + hrx * 0.75, m.shoulderY);
    ctx.quadraticCurveTo(cx + hrx * 0.8, hcy + hry * 0.3, cx + hrx * 0.88, hcy);
    ctx.closePath();
    ctx.fill();
    // Strand details
    dti2DStrands(ctx, [
      [cx - hrx * 1.0, m.shoulderY, cx - hrx * 1.05, m.waistY, cx - hrx * 0.7, m.hipY + hu * 0.3],
      [cx - hrx * 0.9, m.bustY, cx - hrx * 0.85, m.hipY, cx - hrx * 0.55, m.hipY + hu * 0.4],
      [cx + hrx * 1.0, m.shoulderY, cx + hrx * 1.05, m.waistY, cx + hrx * 0.7, m.hipY + hu * 0.3],
      [cx + hrx * 0.9, m.bustY, cx + hrx * 0.85, m.hipY, cx + hrx * 0.55, m.hipY + hu * 0.4]
    ], dk, 1);
    // Curtain bangs
    ctx.fillStyle = dti2DShade(color, 5);
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.15, hcy - hry * 0.9);
    ctx.quadraticCurveTo(cx - hrx * 0.7, hcy - hry * 0.4, cx - hrx * 1.08, hcy + hry * 0.2);
    ctx.quadraticCurveTo(cx - hrx * 0.9, hcy, cx - hrx * 0.65, hcy - hry * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 0.15, hcy - hry * 0.9);
    ctx.quadraticCurveTo(cx + hrx * 0.7, hcy - hry * 0.4, cx + hrx * 1.08, hcy + hry * 0.2);
    ctx.quadraticCurveTo(cx + hrx * 0.9, hcy, cx + hrx * 0.65, hcy - hry * 0.3);
    ctx.closePath();
    ctx.fill();
  }
};

// ── hair_braids (Twin Braids) ──
var dti2DHair_braids = {
  drawBack: function(ctx, color, m) {},
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -35);
    var lt = dti2DShade(color, 15);
    dti2DHairCap(ctx, color, m, 1.06, 1.12);
    // Middle parting
    ctx.strokeStyle = dti2DAlpha(dk, 0.15);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, hcy - hry * 1.1);
    ctx.lineTo(cx, hcy - hry * 0.3);
    ctx.stroke();
    // Braid function
    function drawBraid(startX, dir) {
      var bw = hu * 0.1;
      var segH = hu * 0.15;
      var y = hcy + hry * 0.5;
      var x = startX;
      for (var i = 0; i < 8; i++) {
        var ny = y + segH;
        ctx.fillStyle = (i % 2 === 0) ? color : lt;
        ctx.beginPath();
        ctx.moveTo(x - bw / 2, y);
        ctx.quadraticCurveTo(x + dir * bw * 0.4, (y + ny) / 2, x - bw / 2, ny);
        ctx.lineTo(x + bw / 2, ny);
        ctx.quadraticCurveTo(x - dir * bw * 0.4, (y + ny) / 2, x + bw / 2, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = dti2DAlpha(dk, 0.08);
        ctx.lineWidth = 0.6;
        ctx.stroke();
        y = ny;
      }
      ctx.fillStyle = dk;
      ctx.beginPath();
      ctx.arc(x, y + hu * 0.02, bw * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    drawBraid(cx - hrx * 1.0, -1);
    drawBraid(cx + hrx * 1.0, 1);
    // Hair from cap to braid start
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.85, hcy + hry * 0.1);
    ctx.quadraticCurveTo(cx - hrx * 1.0, hcy + hry * 0.3, cx - hrx * 1.0 - hu * 0.05, hcy + hry * 0.5);
    ctx.lineTo(cx - hrx * 1.0 + hu * 0.05, hcy + hry * 0.5);
    ctx.quadraticCurveTo(cx - hrx * 0.85, hcy + hry * 0.3, cx - hrx * 0.75, hcy + hry * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 0.85, hcy + hry * 0.1);
    ctx.quadraticCurveTo(cx + hrx * 1.0, hcy + hry * 0.3, cx + hrx * 1.0 + hu * 0.05, hcy + hry * 0.5);
    ctx.lineTo(cx + hrx * 1.0 - hu * 0.05, hcy + hry * 0.5);
    ctx.quadraticCurveTo(cx + hrx * 0.85, hcy + hry * 0.3, cx + hrx * 0.75, hcy + hry * 0.1);
    ctx.closePath();
    ctx.fill();
  }
};

// ── hair_ponytail (High Ponytail) ──
var dti2DHair_ponytail = {
  drawBack: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -20);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - hu * 0.08, hcy - hry * 0.8);
    ctx.bezierCurveTo(cx + hrx * 0.5, hcy - hry * 1.2, cx + hrx * 0.3, m.waistY, cx + hrx * 0.1, m.hipY);
    ctx.quadraticCurveTo(cx, m.hipY + hu * 0.15, cx - hrx * 0.1, m.hipY);
    ctx.bezierCurveTo(cx - hrx * 0.1, m.waistY, cx + hrx * 0.3, hcy - hry * 0.8, cx + hu * 0.08, hcy - hry * 0.8);
    ctx.closePath();
    ctx.fill();
    dti2DStrands(ctx, [
      [cx, hcy - hry * 0.7, cx + hrx * 0.2, m.bustY, cx + hrx * 0.1, m.hipY - hu * 0.1],
      [cx + hu * 0.04, hcy - hry * 0.6, cx + hrx * 0.35, m.waistY, cx, m.hipY]
    ], dk, 0.8);
  },
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    dti2DHairCap(ctx, color, m, 1.04, 1.1);
    // Hair tie
    ctx.fillStyle = dti2DShade(color, -50);
    ctx.beginPath();
    ctx.ellipse(cx, hcy - hry * 0.9, hu * 0.06, hu * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

// ── hair_spacebuns (Space Buns) ──
var dti2DHair_spacebuns = {
  drawBack: function(ctx, color, m) {},
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -35);
    var hi = dti2DShade(color, 20);
    dti2DHairCap(ctx, color, m, 1.06, 1.12);
    // Parting
    ctx.strokeStyle = dti2DAlpha(dk, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, hcy - hry * 1.05);
    ctx.lineTo(cx, hcy - hry * 0.3);
    ctx.stroke();
    // Left bun
    var bunR = hrx * 0.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx - hrx * 0.65, hcy - hry * 1.0, bunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(cx - hrx * 0.7, hcy - hry * 1.1, bunR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // Right bun
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + hrx * 0.65, hcy - hry * 1.0, bunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(cx + hrx * 0.7, hcy - hry * 1.1, bunR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // Loose face strands
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.88, hcy);
    ctx.quadraticCurveTo(cx - hrx * 0.95, hcy + hry * 0.4, cx - hrx * 0.8, hcy + hry * 0.75);
    ctx.quadraticCurveTo(cx - hrx * 0.7, hcy + hry * 0.5, cx - hrx * 0.75, hcy + hry * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 0.88, hcy);
    ctx.quadraticCurveTo(cx + hrx * 0.95, hcy + hry * 0.4, cx + hrx * 0.8, hcy + hry * 0.75);
    ctx.quadraticCurveTo(cx + hrx * 0.7, hcy + hry * 0.5, cx + hrx * 0.75, hcy + hry * 0.1);
    ctx.closePath();
    ctx.fill();
  }
};

// ── hair_wolfcut (Wolf Cut) ──
var dti2DHair_wolfcut = {
  drawBack: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hrx = m.headRX, hu = m.hu;
    ctx.fillStyle = dti2DShade(color, -15);
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.85, hcy);
    ctx.quadraticCurveTo(cx - hrx * 0.95, m.bustY, cx - hrx * 0.7, m.bustY + hu * 0.3);
    ctx.lineTo(cx + hrx * 0.7, m.bustY + hu * 0.3);
    ctx.quadraticCurveTo(cx + hrx * 0.95, m.bustY, cx + hrx * 0.85, hcy);
    ctx.closePath();
    ctx.fill();
  },
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -35);
    dti2DHairCap(ctx, color, m, 1.18, 1.25);
    ctx.fillStyle = color;
    // Left choppy layers
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 1.15, hcy - hry * 0.15);
    ctx.quadraticCurveTo(cx - hrx * 1.25, hcy + hry * 0.5, cx - hrx * 1.1, m.shoulderY);
    ctx.lineTo(cx - hrx * 0.95, m.shoulderY + hu * 0.15);
    ctx.lineTo(cx - hrx * 1.05, m.bustY);
    ctx.lineTo(cx - hrx * 0.85, m.bustY + hu * 0.2);
    ctx.lineTo(cx - hrx * 0.6, m.bustY + hu * 0.1);
    ctx.quadraticCurveTo(cx - hrx * 0.7, m.shoulderY, cx - hrx * 0.85, hcy + hry * 0.1);
    ctx.closePath();
    ctx.fill();
    // Right
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 1.15, hcy - hry * 0.15);
    ctx.quadraticCurveTo(cx + hrx * 1.25, hcy + hry * 0.5, cx + hrx * 1.1, m.shoulderY);
    ctx.lineTo(cx + hrx * 0.95, m.shoulderY + hu * 0.15);
    ctx.lineTo(cx + hrx * 1.05, m.bustY);
    ctx.lineTo(cx + hrx * 0.85, m.bustY + hu * 0.2);
    ctx.lineTo(cx + hrx * 0.6, m.bustY + hu * 0.1);
    ctx.quadraticCurveTo(cx + hrx * 0.7, m.shoulderY, cx + hrx * 0.85, hcy + hry * 0.1);
    ctx.closePath();
    ctx.fill();
    // Heavy curtain bangs
    ctx.fillStyle = dti2DShade(color, 5);
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 0.3, hcy - hry * 1.0);
    ctx.quadraticCurveTo(cx - hrx * 1.0, hcy - hry * 0.3, cx - hrx * 1.2, hcy + hry * 0.25);
    ctx.quadraticCurveTo(cx - hrx * 1.0, hcy, cx - hrx * 0.6, hcy - hry * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 0.3, hcy - hry * 1.0);
    ctx.quadraticCurveTo(cx + hrx * 1.0, hcy - hry * 0.3, cx + hrx * 1.2, hcy + hry * 0.25);
    ctx.quadraticCurveTo(cx + hrx * 1.0, hcy, cx + hrx * 0.6, hcy - hry * 0.4);
    ctx.closePath();
    ctx.fill();
  }
};

// ── hair_curls (Long Curls) ──
var dti2DHair_curls = {
  drawBack: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hrx = m.headRX, hu = m.hu;
    ctx.fillStyle = dti2DShade(color, -15);
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 1.0, hcy);
    ctx.quadraticCurveTo(cx - hrx * 1.1, m.hipY, cx - hrx * 0.6, m.hipY + hu * 0.5);
    ctx.lineTo(cx + hrx * 0.6, m.hipY + hu * 0.5);
    ctx.quadraticCurveTo(cx + hrx * 1.1, m.hipY, cx + hrx * 1.0, hcy);
    ctx.closePath();
    ctx.fill();
  },
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    var dk = dti2DShade(color, -35);
    dti2DHairCap(ctx, color, m, 1.2, 1.22);
    ctx.fillStyle = color;
    // Left curly side
    ctx.beginPath();
    ctx.moveTo(cx - hrx * 1.18, hcy - hry * 0.1);
    ctx.bezierCurveTo(cx - hrx * 1.35, hcy + hry, cx - hrx * 1.2, m.bustY, cx - hrx * 1.3, m.waistY);
    ctx.bezierCurveTo(cx - hrx * 1.15, m.hipY, cx - hrx * 1.25, m.hipY + hu * 0.2, cx - hrx * 0.7, m.hipY + hu * 0.4);
    ctx.lineTo(cx - hrx * 0.5, m.hipY + hu * 0.25);
    ctx.quadraticCurveTo(cx - hrx * 0.6, m.waistY, cx - hrx * 0.7, m.shoulderY);
    ctx.quadraticCurveTo(cx - hrx * 0.8, hcy + hry * 0.3, cx - hrx * 0.9, hcy);
    ctx.closePath();
    ctx.fill();
    // Right curly side
    ctx.beginPath();
    ctx.moveTo(cx + hrx * 1.18, hcy - hry * 0.1);
    ctx.bezierCurveTo(cx + hrx * 1.35, hcy + hry, cx + hrx * 1.2, m.bustY, cx + hrx * 1.3, m.waistY);
    ctx.bezierCurveTo(cx + hrx * 1.15, m.hipY, cx + hrx * 1.25, m.hipY + hu * 0.2, cx + hrx * 0.7, m.hipY + hu * 0.4);
    ctx.lineTo(cx + hrx * 0.5, m.hipY + hu * 0.25);
    ctx.quadraticCurveTo(cx + hrx * 0.6, m.waistY, cx + hrx * 0.7, m.shoulderY);
    ctx.quadraticCurveTo(cx + hrx * 0.8, hcy + hry * 0.3, cx + hrx * 0.9, hcy);
    ctx.closePath();
    ctx.fill();
    // Curl wave detail lines
    ctx.strokeStyle = dti2DAlpha(dk, 0.12);
    ctx.lineWidth = 1.2;
    for (var side = -1; side <= 1; side += 2) {
      for (var i = 0; i < 4; i++) {
        var sy = m.shoulderY + i * hu * 0.35;
        var sx = cx + side * hrx * (0.9 + i * 0.05);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + side * hu * 0.12, sy + hu * 0.1, sx - side * hu * 0.08, sy + hu * 0.2, sx + side * hu * 0.06, sy + hu * 0.3);
        ctx.stroke();
      }
    }
  }
};

// ── hair_ribbon (Ribbon Bow Hair) ──
var dti2DHair_ribbon = {
  drawBack: function(ctx, color, m) {
    dti2DHair_straight.drawBack(ctx, color, m);
  },
  drawFront: function(ctx, color, m) {
    var cx = m.cx, hcy = m.headCY, hry = m.headRY, hrx = m.headRX, hu = m.hu;
    dti2DHair_straight.drawFront(ctx, color, m);
    // Add ribbon bow on top
    var bowY = hcy - hry * 0.75;
    var bowX = cx + hrx * 0.3;
    var bowW = hu * 0.15;
    var bowH = hu * 0.1;
    var ribbonColor = '#e8607a';
    ctx.fillStyle = ribbonColor;
    // Left loop
    ctx.beginPath();
    ctx.moveTo(bowX, bowY);
    ctx.quadraticCurveTo(bowX - bowW, bowY - bowH, bowX - bowW * 0.8, bowY);
    ctx.quadraticCurveTo(bowX - bowW * 0.5, bowY + bowH * 0.6, bowX, bowY);
    ctx.fill();
    // Right loop
    ctx.beginPath();
    ctx.moveTo(bowX, bowY);
    ctx.quadraticCurveTo(bowX + bowW, bowY - bowH, bowX + bowW * 0.8, bowY);
    ctx.quadraticCurveTo(bowX + bowW * 0.5, bowY + bowH * 0.6, bowX, bowY);
    ctx.fill();
    // Center knot
    ctx.fillStyle = dti2DShade(ribbonColor, -20);
    ctx.beginPath();
    ctx.arc(bowX, bowY, hu * 0.025, 0, Math.PI * 2);
    ctx.fill();
    // Tails
    ctx.fillStyle = ribbonColor;
    ctx.beginPath();
    ctx.moveTo(bowX - hu * 0.01, bowY + hu * 0.01);
    ctx.quadraticCurveTo(bowX - hu * 0.04, bowY + hu * 0.08, bowX - hu * 0.06, bowY + hu * 0.12);
    ctx.lineTo(bowX - hu * 0.03, bowY + hu * 0.1);
    ctx.quadraticCurveTo(bowX - hu * 0.01, bowY + hu * 0.06, bowX, bowY + hu * 0.01);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bowX + hu * 0.01, bowY + hu * 0.01);
    ctx.quadraticCurveTo(bowX + hu * 0.04, bowY + hu * 0.08, bowX + hu * 0.06, bowY + hu * 0.12);
    ctx.lineTo(bowX + hu * 0.03, bowY + hu * 0.1);
    ctx.quadraticCurveTo(bowX + hu * 0.01, bowY + hu * 0.06, bowX, bowY + hu * 0.01);
    ctx.fill();
  }
};

// Hair style lookup
var DTI_2D_HAIR = {
  hair: dti2DHair_straight,
  hair_short: dti2DHair_short,
  hair_bun: dti2DHair_bun,
  hair_long: dti2DHair_long,
  hair_braids: dti2DHair_braids,
  hair_ponytail: dti2DHair_ponytail,
  hair_spacebuns: dti2DHair_spacebuns,
  hair_wolfcut: dti2DHair_wolfcut,
  hair_curls: dti2DHair_curls,
  hair_ribbon: dti2DHair_ribbon
};

// ═══════════════════════════════════════════════════════════
// CLOTHING — TOPS
// ═══════════════════════════════════════════════════════════

// Helper: fabric gradient fill based on style
function dti2DFabricFill(ctx, color, style, x1, y1, x2, y2) {
  var hi = dti2DShade(color, 25);
  var lo = dti2DShade(color, -25);
  var grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, hi);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, lo);
  return grad;
}

// top_fitted: Fitted top (shoulder to hip, follows curves)
function dti2DDrawTopFitted(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02; // slight offset from body
  ctx.save();
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.shoulderW / 2, m.shoulderY, cx + m.shoulderW / 2, m.waistY);
  ctx.beginPath();
  // Neckline (crew neck)
  ctx.moveTo(cx - m.neckW * 1.0, m.neckBot + hu * 0.02);
  ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.06, cx + m.neckW * 1.0, m.neckBot + hu * 0.02);
  // Right shoulder & sleeve
  ctx.lineTo(cx + m.shoulderW / 2 + pad, m.shoulderY);
  ctx.lineTo(cx + m.shoulderW / 2 + pad, m.shoulderY + hu * 0.3);
  // Right side down
  ctx.quadraticCurveTo(cx + m.bustW / 2 + pad, m.bustY, cx + m.bustW / 2 + pad, m.bustY + hu * 0.05);
  ctx.quadraticCurveTo(cx + m.waistW / 2 + pad + hu * 0.05, m.waistY, cx + m.hipW / 2 + pad, m.hipY);
  ctx.lineTo(cx + m.hipW / 2 + pad, m.hipY + hu * 0.05);
  // Bottom hem
  ctx.quadraticCurveTo(cx, m.hipY + hu * 0.08, cx - m.hipW / 2 - pad, m.hipY + hu * 0.05);
  // Left side up
  ctx.lineTo(cx - m.hipW / 2 - pad, m.hipY);
  ctx.quadraticCurveTo(cx - m.waistW / 2 - pad - hu * 0.05, m.waistY, cx - m.bustW / 2 - pad, m.bustY + hu * 0.05);
  ctx.quadraticCurveTo(cx - m.bustW / 2 - pad, m.bustY, cx - m.shoulderW / 2 - pad, m.shoulderY + hu * 0.3);
  ctx.lineTo(cx - m.shoulderW / 2 - pad, m.shoulderY);
  ctx.closePath();
  ctx.fill();
  // Fabric fold lines
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.1);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.bustW / 4, m.bustY + hu * 0.05);
  ctx.quadraticCurveTo(cx - m.waistW / 3, m.waistY, cx - m.hipW / 4, m.hipY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + m.bustW / 4, m.bustY + hu * 0.05);
  ctx.quadraticCurveTo(cx + m.waistW / 3, m.waistY, cx + m.hipW / 4, m.hipY);
  ctx.stroke();
  ctx.restore();
}

// top_crop: Crop top (shoulder to just below bust)
function dti2DDrawTopCrop(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var hemY = m.bustY + hu * 0.15;
  ctx.save();
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.shoulderW / 2, m.shoulderY, cx + m.shoulderW / 2, hemY);
  ctx.beginPath();
  // Scoop neckline
  ctx.moveTo(cx - m.neckW * 1.3, m.neckBot);
  ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.1, cx + m.neckW * 1.3, m.neckBot);
  // Right shoulder
  ctx.lineTo(cx + m.shoulderW / 2 + pad, m.shoulderY);
  ctx.lineTo(cx + m.shoulderW / 2 + pad, m.shoulderY + hu * 0.18);
  // Right side
  ctx.quadraticCurveTo(cx + m.bustW / 2 + pad, m.bustY, cx + m.bustW / 2 + pad - hu * 0.02, hemY);
  // Bottom hem
  ctx.quadraticCurveTo(cx, hemY + hu * 0.02, cx - m.bustW / 2 - pad + hu * 0.02, hemY);
  // Left side
  ctx.quadraticCurveTo(cx - m.bustW / 2 - pad, m.bustY, cx - m.shoulderW / 2 - pad, m.shoulderY + hu * 0.18);
  ctx.lineTo(cx - m.shoulderW / 2 - pad, m.shoulderY);
  ctx.closePath();
  ctx.fill();
  // Hem detail
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -30), 0.15);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - m.bustW / 2 - pad + hu * 0.02, hemY);
  ctx.quadraticCurveTo(cx, hemY + hu * 0.02, cx + m.bustW / 2 + pad - hu * 0.02, hemY);
  ctx.stroke();
  ctx.restore();
}

// top_oversized: Oversized/baggy top (wider, boxy)
function dti2DDrawTopOversized(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var extra = hu * 0.12;
  var hemY = m.hipY + hu * 0.12;
  ctx.save();
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.shoulderW / 2 - extra, m.shoulderY, cx + m.shoulderW / 2 + extra, hemY);
  ctx.beginPath();
  // Wide crew neck
  ctx.moveTo(cx - m.neckW * 1.2, m.neckBot);
  ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.05, cx + m.neckW * 1.2, m.neckBot);
  // Right — dropped shoulder, wide sleeve
  ctx.lineTo(cx + m.shoulderW / 2 + extra, m.shoulderY + hu * 0.08);
  ctx.lineTo(cx + m.shoulderW / 2 + extra + hu * 0.05, m.elbowY - hu * 0.2);
  ctx.lineTo(cx + m.shoulderW / 2 + extra - hu * 0.02, m.elbowY - hu * 0.15);
  // Right side — straight down (boxy)
  ctx.lineTo(cx + m.hipW / 2 + extra, hemY);
  // Bottom hem
  ctx.lineTo(cx - m.hipW / 2 - extra, hemY);
  // Left side up
  ctx.lineTo(cx - m.shoulderW / 2 - extra + hu * 0.02, m.elbowY - hu * 0.15);
  ctx.lineTo(cx - m.shoulderW / 2 - extra - hu * 0.05, m.elbowY - hu * 0.2);
  ctx.lineTo(cx - m.shoulderW / 2 - extra, m.shoulderY + hu * 0.08);
  ctx.closePath();
  ctx.fill();
  // Drape fold lines
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.08);
  ctx.lineWidth = 0.8;
  for (var i = -1; i <= 1; i += 2) {
    ctx.beginPath();
    ctx.moveTo(cx + i * m.waistW / 3, m.bustY);
    ctx.quadraticCurveTo(cx + i * m.waistW / 2.5, m.waistY, cx + i * m.hipW / 3, hemY);
    ctx.stroke();
  }
  ctx.restore();
}

// top_offsh: Off-shoulder top
function dti2DDrawTopOffShoulder(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var hemY = m.waistY + hu * 0.1;
  var necklineY = m.shoulderY + hu * 0.12;
  ctx.save();
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.shoulderW / 2, necklineY, cx + m.shoulderW / 2, hemY);
  ctx.beginPath();
  // Off-shoulder neckline (dips below shoulders)
  ctx.moveTo(cx - m.shoulderW / 2 - pad, necklineY);
  ctx.quadraticCurveTo(cx - m.bustW / 3, m.bustY - hu * 0.15, cx, m.bustY - hu * 0.12);
  ctx.quadraticCurveTo(cx + m.bustW / 3, m.bustY - hu * 0.15, cx + m.shoulderW / 2 + pad, necklineY);
  // Right side down
  ctx.quadraticCurveTo(cx + m.bustW / 2 + pad, m.bustY, cx + m.bustW / 2 + pad, m.bustY + hu * 0.05);
  ctx.quadraticCurveTo(cx + m.waistW / 2 + pad + hu * 0.04, m.waistY, cx + m.waistW / 2 + pad + hu * 0.06, hemY);
  // Bottom
  ctx.quadraticCurveTo(cx, hemY + hu * 0.03, cx - m.waistW / 2 - pad - hu * 0.06, hemY);
  // Left side up
  ctx.quadraticCurveTo(cx - m.waistW / 2 - pad - hu * 0.04, m.waistY, cx - m.bustW / 2 - pad, m.bustY + hu * 0.05);
  ctx.quadraticCurveTo(cx - m.bustW / 2 - pad, m.bustY, cx - m.shoulderW / 2 - pad, necklineY);
  ctx.closePath();
  ctx.fill();
  // Ruffle detail on neckline
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -20), 0.15);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - m.shoulderW / 2, necklineY + hu * 0.01);
  ctx.quadraticCurveTo(cx - m.bustW / 3, m.bustY - hu * 0.13, cx, m.bustY - hu * 0.1);
  ctx.quadraticCurveTo(cx + m.bustW / 3, m.bustY - hu * 0.13, cx + m.shoulderW / 2, necklineY + hu * 0.01);
  ctx.stroke();
  ctx.restore();
}

var DTI_2D_TOPS = {
  top_fitted: dti2DDrawTopFitted,
  top_crop: dti2DDrawTopCrop,
  top_oversized: dti2DDrawTopOversized,
  top_offsh: dti2DDrawTopOffShoulder
};

// ═══════════════════════════════════════════════════════════
// CLOTHING — BOTTOMS
// ═══════════════════════════════════════════════════════════

// bottom_skirt: Midi/maxi skirt (waist to below knee with flare)
function dti2DDrawBottomSkirt(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var hemY = m.kneeY + hu * 0.4;
  ctx.save();
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.hipW / 2, m.waistY, cx + m.hipW / 2, hemY);
  ctx.beginPath();
  // Waistband
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  // Right side flares out
  ctx.quadraticCurveTo(cx + m.hipW / 2 + pad + hu * 0.05, m.hipY, cx + m.hipW / 2 + hu * 0.15, hemY);
  // Hem
  ctx.quadraticCurveTo(cx, hemY + hu * 0.03, cx - m.hipW / 2 - hu * 0.15, hemY);
  // Left side up
  ctx.quadraticCurveTo(cx - m.hipW / 2 - pad - hu * 0.05, m.hipY, cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.closePath();
  ctx.fill();
  // Fabric drape folds
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.08);
  ctx.lineWidth = 0.8;
  for (var i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * hu * 0.08, m.hipY);
    ctx.quadraticCurveTo(cx + i * hu * 0.1, (m.hipY + hemY) / 2, cx + i * hu * 0.12, hemY);
    ctx.stroke();
  }
  // Waistband line
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -30), 0.12);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY + hu * 0.02);
  ctx.quadraticCurveTo(cx, m.waistY + hu * 0.04, cx + m.waistW / 2 + pad, m.waistY + hu * 0.02);
  ctx.stroke();
  ctx.restore();
}

// bottom_mini: Mini skirt (waist to mid-thigh)
function dti2DDrawBottomMini(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var hemY = m.crotchY + hu * 0.1;
  ctx.save();
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.hipW / 2, m.waistY, cx + m.hipW / 2, hemY);
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  ctx.quadraticCurveTo(cx + m.hipW / 2 + pad, m.hipY, cx + m.hipW / 2 + hu * 0.06, hemY);
  ctx.quadraticCurveTo(cx, hemY + hu * 0.02, cx - m.hipW / 2 - hu * 0.06, hemY);
  ctx.quadraticCurveTo(cx - m.hipW / 2 - pad, m.hipY, cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.closePath();
  ctx.fill();
  // Pleat lines
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -35), 0.1);
  ctx.lineWidth = 0.6;
  for (var i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * hu * 0.1, m.hipY - hu * 0.02);
    ctx.lineTo(cx + i * hu * 0.12, hemY);
    ctx.stroke();
  }
  ctx.restore();
}

// bottom_pants: Straight/slim pants (waist to ankle)
function dti2DDrawBottomPants(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var legSpread = hu * 0.12;
  ctx.save();
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.hipW / 2, m.waistY, cx + m.hipW / 2, m.ankleY);
  // Draw as single shape: waist -> hips -> split into two legs
  ctx.beginPath();
  // Waistband
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  // Right hip
  ctx.quadraticCurveTo(cx + m.hipW / 2 + pad, m.hipY, cx + legSpread + m.hu * 0.2, m.crotchY);
  // Right leg outer
  ctx.quadraticCurveTo(cx + legSpread + m.kneeW + pad, m.kneeY, cx + legSpread + m.ankleW + pad, m.ankleY);
  // Right ankle
  ctx.lineTo(cx + legSpread - m.ankleW - pad, m.ankleY);
  // Right leg inner
  ctx.quadraticCurveTo(cx + legSpread - m.kneeW, m.kneeY, cx + legSpread - hu * 0.05, m.crotchY);
  // Crotch
  ctx.lineTo(cx - legSpread + hu * 0.05, m.crotchY);
  // Left leg inner
  ctx.quadraticCurveTo(cx - legSpread + m.kneeW, m.kneeY, cx - legSpread + m.ankleW + pad, m.ankleY);
  // Left ankle
  ctx.lineTo(cx - legSpread - m.ankleW - pad, m.ankleY);
  // Left leg outer
  ctx.quadraticCurveTo(cx - legSpread - m.kneeW - pad, m.kneeY, cx - legSpread - m.hu * 0.2, m.crotchY);
  // Left hip
  ctx.quadraticCurveTo(cx - m.hipW / 2 - pad, m.hipY, cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.closePath();
  ctx.fill();
  // Crease lines
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -35), 0.08);
  ctx.lineWidth = 0.7;
  for (var side = -1; side <= 1; side += 2) {
    ctx.beginPath();
    ctx.moveTo(cx + side * legSpread, m.crotchY + hu * 0.1);
    ctx.lineTo(cx + side * legSpread, m.ankleY - hu * 0.1);
    ctx.stroke();
  }
  ctx.restore();
}

// bottom_wide: Wide-leg pants/jeans
function dti2DDrawBottomWide(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var legSpread = hu * 0.12;
  var flare = hu * 0.18;
  ctx.save();
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.hipW / 2, m.waistY, cx + m.hipW / 2, m.ankleY);
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  // Right hip
  ctx.quadraticCurveTo(cx + m.hipW / 2 + pad, m.hipY, cx + legSpread + m.hu * 0.2, m.crotchY);
  // Right leg — flares out from knee
  ctx.quadraticCurveTo(cx + legSpread + m.kneeW + pad + hu * 0.02, m.kneeY, cx + legSpread + m.ankleW + flare, m.ankleY);
  ctx.lineTo(cx + legSpread - m.ankleW - flare * 0.3, m.ankleY);
  ctx.quadraticCurveTo(cx + legSpread - m.kneeW, m.kneeY, cx + legSpread - hu * 0.05, m.crotchY);
  // Crotch
  ctx.lineTo(cx - legSpread + hu * 0.05, m.crotchY);
  // Left leg
  ctx.quadraticCurveTo(cx - legSpread + m.kneeW, m.kneeY, cx - legSpread + m.ankleW + flare * 0.3, m.ankleY);
  ctx.lineTo(cx - legSpread - m.ankleW - flare, m.ankleY);
  ctx.quadraticCurveTo(cx - legSpread - m.kneeW - pad - hu * 0.02, m.kneeY, cx - legSpread - m.hu * 0.2, m.crotchY);
  // Left hip
  ctx.quadraticCurveTo(cx - m.hipW / 2 - pad, m.hipY, cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.closePath();
  ctx.fill();
  // Drape fold lines
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -35), 0.08);
  ctx.lineWidth = 0.7;
  for (var side = -1; side <= 1; side += 2) {
    ctx.beginPath();
    ctx.moveTo(cx + side * legSpread - side * hu * 0.03, m.kneeY);
    ctx.quadraticCurveTo(cx + side * legSpread + side * hu * 0.02, (m.kneeY + m.ankleY) / 2, cx + side * (legSpread + flare * 0.5), m.ankleY);
    ctx.stroke();
  }
  ctx.restore();
}

var DTI_2D_BOTTOMS = {
  bottom_skirt: dti2DDrawBottomSkirt,
  bottom_mini: dti2DDrawBottomMini,
  bottom_pants: dti2DDrawBottomPants,
  bottom_wide: dti2DDrawBottomWide
};

// ═══════════════════════════════════════════════════════════
// CLOTHING — SHOES
// ═══════════════════════════════════════════════════════════

function dti2DDrawShoesBoots(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var legSpread = hu * 0.12;
  var dk = dti2DShade(color, -30);
  var hi = dti2DShade(color, 20);
  var bootTop = m.kneeY + hu * 0.2;
  ctx.save();
  for (var side = -1; side <= 1; side += 2) {
    var fx = cx + side * legSpread;
    ctx.fillStyle = color;
    ctx.beginPath();
    // Boot shaft
    ctx.moveTo(fx - m.ankleW - hu * 0.04, bootTop);
    ctx.lineTo(fx - m.ankleW - hu * 0.04, m.footY - hu * 0.02);
    // Sole
    ctx.lineTo(fx - m.footW * 0.5, m.footY + hu * 0.02);
    ctx.lineTo(fx + m.footW * 0.55, m.footY + hu * 0.02);
    ctx.lineTo(fx + m.ankleW + hu * 0.04, m.footY - hu * 0.02);
    ctx.lineTo(fx + m.ankleW + hu * 0.04, bootTop);
    ctx.closePath();
    ctx.fill();
    // Boot top trim
    ctx.strokeStyle = dk;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW - hu * 0.04, bootTop);
    ctx.lineTo(fx + m.ankleW + hu * 0.04, bootTop);
    ctx.stroke();
    // Sole line
    ctx.strokeStyle = dti2DAlpha(dk, 0.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx - m.footW * 0.5, m.footY + hu * 0.02);
    ctx.lineTo(fx + m.footW * 0.55, m.footY + hu * 0.02);
    ctx.stroke();
    // Highlight
    ctx.strokeStyle = dti2DAlpha(hi, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW * 0.5, bootTop + hu * 0.05);
    ctx.lineTo(fx - m.ankleW * 0.5, m.footY - hu * 0.05);
    ctx.stroke();
  }
  ctx.restore();
}

function dti2DDrawShoesHeels(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var legSpread = hu * 0.12;
  var dk = dti2DShade(color, -30);
  ctx.save();
  for (var side = -1; side <= 1; side += 2) {
    var fx = cx + side * legSpread;
    // Shoe body (pointed toe)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW, m.ankleY + hu * 0.02);
    ctx.quadraticCurveTo(fx - m.footW * 0.4, m.footY, fx + m.footW * 0.6, m.footY - hu * 0.01);
    ctx.lineTo(fx + m.ankleW, m.ankleY + hu * 0.02);
    ctx.closePath();
    ctx.fill();
    // Heel
    ctx.fillStyle = dk;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW * 0.3, m.ankleY + hu * 0.02);
    ctx.lineTo(fx - m.ankleW * 0.5, m.footY + hu * 0.04);
    ctx.lineTo(fx - m.ankleW * 0.2, m.footY + hu * 0.04);
    ctx.lineTo(fx - m.ankleW * 0.1, m.ankleY + hu * 0.04);
    ctx.closePath();
    ctx.fill();
    // Strap
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW * 0.3, m.ankleY);
    ctx.quadraticCurveTo(fx, m.ankleY - hu * 0.02, fx + m.ankleW * 0.3, m.ankleY);
    ctx.stroke();
  }
  ctx.restore();
}

function dti2DDrawShoesSneakers(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var legSpread = hu * 0.12;
  var dk = dti2DShade(color, -25);
  var hi = dti2DShade(color, 30);
  ctx.save();
  for (var side = -1; side <= 1; side += 2) {
    var fx = cx + side * legSpread;
    // Chunky sole
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.moveTo(fx - m.footW * 0.55, m.footY + hu * 0.03);
    ctx.lineTo(fx + m.footW * 0.6, m.footY + hu * 0.03);
    ctx.lineTo(fx + m.footW * 0.6, m.footY + hu * 0.06);
    ctx.quadraticCurveTo(fx, m.footY + hu * 0.07, fx - m.footW * 0.55, m.footY + hu * 0.06);
    ctx.closePath();
    ctx.fill();
    // Shoe body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW - hu * 0.02, m.ankleY + hu * 0.01);
    ctx.lineTo(fx - m.footW * 0.5, m.footY + hu * 0.03);
    ctx.lineTo(fx + m.footW * 0.55, m.footY + hu * 0.03);
    ctx.lineTo(fx + m.ankleW + hu * 0.02, m.ankleY + hu * 0.01);
    ctx.closePath();
    ctx.fill();
    // Toe cap
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.moveTo(fx + m.footW * 0.2, m.footY + hu * 0.03);
    ctx.quadraticCurveTo(fx + m.footW * 0.5, m.footY - hu * 0.01, fx + m.footW * 0.55, m.footY + hu * 0.03);
    ctx.closePath();
    ctx.fill();
    // Lace detail
    ctx.strokeStyle = dti2DAlpha('#ffffff', 0.4);
    ctx.lineWidth = 0.8;
    for (var li = 0; li < 3; li++) {
      var ly = m.ankleY + hu * 0.02 + li * hu * 0.02;
      ctx.beginPath();
      ctx.moveTo(fx - hu * 0.02, ly);
      ctx.lineTo(fx + hu * 0.02, ly);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function dti2DDrawShoesFlats(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var legSpread = hu * 0.12;
  var dk = dti2DShade(color, -25);
  ctx.save();
  for (var side = -1; side <= 1; side += 2) {
    var fx = cx + side * legSpread;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW * 0.8, m.footY - hu * 0.01);
    ctx.quadraticCurveTo(fx - m.footW * 0.3, m.footY + hu * 0.01, fx + m.footW * 0.5, m.footY);
    ctx.quadraticCurveTo(fx + m.footW * 0.5, m.footY - hu * 0.02, fx + m.ankleW * 0.8, m.footY - hu * 0.015);
    ctx.closePath();
    ctx.fill();
    // Strap (Mary Jane style)
    ctx.strokeStyle = dk;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW * 0.5, m.footY - hu * 0.01);
    ctx.quadraticCurveTo(fx, m.footY - hu * 0.03, fx + m.ankleW * 0.5, m.footY - hu * 0.01);
    ctx.stroke();
    // Sole
    ctx.strokeStyle = dti2DAlpha(dk, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fx - m.footW * 0.4, m.footY + hu * 0.01);
    ctx.lineTo(fx + m.footW * 0.5, m.footY + hu * 0.01);
    ctx.stroke();
  }
  ctx.restore();
}

var DTI_2D_SHOES = {
  shoes_boots: dti2DDrawShoesBoots,
  shoes_heels: dti2DDrawShoesHeels,
  shoes_sneakers: dti2DDrawShoesSneakers,
  shoes_flats: dti2DDrawShoesFlats
};

// ═══════════════════════════════════════════════════════════
// CLOTHING — ACCESSORIES
// ═══════════════════════════════════════════════════════════

function dti2DDrawAccNecklace(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  // Chain
  ctx.beginPath();
  ctx.moveTo(cx - m.neckW * 1.2, m.neckBot + hu * 0.01);
  ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.1, cx + m.neckW * 1.2, m.neckBot + hu * 0.01);
  ctx.stroke();
  // Pendant
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, m.neckBot + hu * 0.12, hu * 0.025, 0, Math.PI * 2);
  ctx.fill();
  // Second chain (layered)
  ctx.strokeStyle = dti2DAlpha(color, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - m.neckW * 1.0, m.neckBot + hu * 0.02);
  ctx.quadraticCurveTo(cx, m.shoulderY + hu * 0.05, cx + m.neckW * 1.0, m.neckBot + hu * 0.02);
  ctx.stroke();
  ctx.restore();
}

function dti2DDrawAccBag(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var dk = dti2DShade(color, -25);
  var hi = dti2DShade(color, 15);
  var bagX = cx + m.armOuterX + hu * 0.15;
  var bagY = m.hipY;
  var bagW = hu * 0.22;
  var bagH = hu * 0.28;
  ctx.save();
  // Strap
  ctx.strokeStyle = dk;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + m.shoulderW / 2 - hu * 0.05, m.shoulderY + hu * 0.05);
  ctx.quadraticCurveTo(bagX, m.waistY, bagX, bagY - bagH * 0.1);
  ctx.stroke();
  // Bag body
  ctx.fillStyle = color;
  ctx.beginPath();
  dti2DRoundRect(ctx,bagX - bagW / 2, bagY, bagW, bagH, hu * 0.03);
  ctx.fill();
  // Flap
  ctx.fillStyle = dk;
  ctx.beginPath();
  dti2DRoundRect(ctx,bagX - bagW / 2, bagY, bagW, bagH * 0.35, [hu * 0.03, hu * 0.03, 0, 0]);
  ctx.fill();
  // Clasp
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(bagX, bagY + bagH * 0.35, hu * 0.015, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function dti2DDrawAccHat(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var hcy = m.headCY, hry = m.headRY, hrx = m.headRX;
  var dk = dti2DShade(color, -20);
  var hi = dti2DShade(color, 15);
  ctx.save();
  // Brim
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, hcy - hry * 0.85, hrx * 1.5, hu * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  // Crown
  ctx.beginPath();
  ctx.moveTo(cx - hrx * 0.85, hcy - hry * 0.85);
  ctx.quadraticCurveTo(cx - hrx * 0.9, hcy - hry * 1.6, cx, hcy - hry * 1.7);
  ctx.quadraticCurveTo(cx + hrx * 0.9, hcy - hry * 1.6, cx + hrx * 0.85, hcy - hry * 0.85);
  ctx.closePath();
  ctx.fill();
  // Brim shadow
  ctx.fillStyle = dti2DAlpha(dk, 0.1);
  ctx.beginPath();
  ctx.ellipse(cx, hcy - hry * 0.82, hrx * 1.5, hu * 0.03, 0, 0, Math.PI);
  ctx.fill();
  // Highlight
  ctx.fillStyle = dti2DAlpha(hi, 0.08);
  ctx.beginPath();
  ctx.ellipse(cx - hrx * 0.2, hcy - hry * 1.35, hrx * 0.4, hu * 0.08, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function dti2DDrawAccBelt(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var dk = dti2DShade(color, -30);
  var hi = dti2DShade(color, 20);
  var beltH = hu * 0.04;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - hu * 0.03, m.waistY - beltH / 2);
  ctx.quadraticCurveTo(cx, m.waistY - beltH / 2 + hu * 0.01, cx + m.waistW / 2 + hu * 0.03, m.waistY - beltH / 2);
  ctx.lineTo(cx + m.waistW / 2 + hu * 0.03, m.waistY + beltH / 2);
  ctx.quadraticCurveTo(cx, m.waistY + beltH / 2 + hu * 0.01, cx - m.waistW / 2 - hu * 0.03, m.waistY + beltH / 2);
  ctx.closePath();
  ctx.fill();
  // Buckle
  ctx.fillStyle = dk;
  ctx.beginPath();
  dti2DRoundRect(ctx,cx - hu * 0.03, m.waistY - beltH * 0.7, hu * 0.06, beltH * 1.4, hu * 0.008);
  ctx.fill();
  ctx.fillStyle = hi;
  ctx.beginPath();
  dti2DRoundRect(ctx,cx - hu * 0.02, m.waistY - beltH * 0.45, hu * 0.04, beltH * 0.9, hu * 0.005);
  ctx.fill();
  ctx.restore();
}

function dti2DDrawAccEarrings(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var hcy = m.headCY, hry = m.headRY, hrx = m.headRX;
  var hi = dti2DShade(color, 30);
  ctx.save();
  // Earring posts
  for (var side = -1; side <= 1; side += 2) {
    var ex = cx + side * hrx * 0.97;
    var ey = hcy + hry * 0.1;
    // Post
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex, ey + hu * 0.02);
    ctx.stroke();
    // Earring drop
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ex, ey + hu * 0.04, hu * 0.025, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = dti2DAlpha(hi, 0.3);
    ctx.beginPath();
    ctx.arc(ex - hu * 0.008, ey + hu * 0.035, hu * 0.01, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

var DTI_2D_ACCESSORIES = {
  acc_necklace: dti2DDrawAccNecklace,
  acc_bag: dti2DDrawAccBag,
  acc_hat: dti2DDrawAccHat,
  acc_belt: dti2DDrawAccBelt,
  acc_earrings: dti2DDrawAccEarrings
};

// ═══════════════════════════════════════════════════════════
// MASTER DTI_2D LOOKUP — maps svg keys to drawing capability
// ═══════════════════════════════════════════════════════════

var DTI_2D = {};
// Register all clothing types
(function() {
  var k;
  for (k in DTI_2D_HAIR) DTI_2D[k] = true;
  for (k in DTI_2D_TOPS) DTI_2D[k] = true;
  for (k in DTI_2D_BOTTOMS) DTI_2D[k] = true;
  for (k in DTI_2D_SHOES) DTI_2D[k] = true;
  for (k in DTI_2D_ACCESSORIES) DTI_2D[k] = true;
})();

// ═══════════════════════════════════════════════════════════
// RENDER PIPELINE
// ═══════════════════════════════════════════════════════════

function dti2DRender() {
  if (!dti2D.initialized || !dti2D.ctx) return;
  var ctx = dti2D.ctx;
  var w = dti2D.width;
  var h = dti2D.height;
  var skin = dti2D.skinTone;
  var clothing = dti2D.clothing;

  // Breathing offset (subtle idle animation)
  var bo = Math.sin(dti2D.breathPhase) * 1.2;
  var m = dti2DComputeBodyMetrics(w, h, bo);

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Background — soft warm gradient
  var bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#f5f0ea');
  bgGrad.addColorStop(1, '#ece4da');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 1. Back hair
  if (clothing.hair) {
    var hairStyle = DTI_2D_HAIR[clothing.hair.svg];
    if (hairStyle) hairStyle.drawBack(ctx, clothing.hair.color, m);
  }

  // 2. Body
  dti2DDrawBody(ctx, skin, m);
  dti2DDrawUnderwear(ctx, skin, m);

  // 3. Shoes (drawn before clothing so pants/skirts overlap tops of boots)
  if (clothing.shoes && DTI_2D_SHOES[clothing.shoes.svg]) {
    DTI_2D_SHOES[clothing.shoes.svg](ctx, clothing.shoes.color, clothing.shoes.style, m);
  }

  // 4. Bottoms
  if (clothing.bottoms && DTI_2D_BOTTOMS[clothing.bottoms.svg]) {
    DTI_2D_BOTTOMS[clothing.bottoms.svg](ctx, clothing.bottoms.color, clothing.bottoms.style, m);
  }

  // 5. Tops
  if (clothing.tops && DTI_2D_TOPS[clothing.tops.svg]) {
    DTI_2D_TOPS[clothing.tops.svg](ctx, clothing.tops.color, clothing.tops.style, m);
  }

  // 6. Belt (over top)
  if (clothing.accessories && clothing.accessories.svg === 'acc_belt') {
    dti2DDrawAccBelt(ctx, clothing.accessories.color, clothing.accessories.style, m);
  }

  // 7. Face (always on top of clothing necklines)
  dti2DDrawFace(ctx, skin, m);

  // 8. Front hair
  if (clothing.hair) {
    var hairStyle2 = DTI_2D_HAIR[clothing.hair.svg];
    if (hairStyle2) hairStyle2.drawFront(ctx, clothing.hair.color, m);
  }

  // 9. Hat (on top of hair)
  if (clothing.accessories && clothing.accessories.svg === 'acc_hat') {
    dti2DDrawAccHat(ctx, clothing.accessories.color, clothing.accessories.style, m);
  }

  // 10. Other accessories (necklace, earrings, bag)
  if (clothing.accessories) {
    var accSvg = clothing.accessories.svg;
    if (accSvg === 'acc_necklace') dti2DDrawAccNecklace(ctx, clothing.accessories.color, clothing.accessories.style, m);
    if (accSvg === 'acc_earrings') dti2DDrawAccEarrings(ctx, clothing.accessories.color, clothing.accessories.style, m);
    if (accSvg === 'acc_bag') dti2DDrawAccBag(ctx, clothing.accessories.color, clothing.accessories.style, m);
  }

  // 11. Runway sparkle overlay
  if (dti2D.runwayAnim) {
    dti2DDrawSparkles(ctx, w, h, dti2D.runwayPhase);
  }
}

// ── Sparkle effect for runway ──
function dti2DDrawSparkles(ctx, w, h, phase) {
  ctx.save();
  var count = 12;
  for (var i = 0; i < count; i++) {
    var seed = i * 137.508;
    var x = (w * 0.15) + ((seed * 7.3) % (w * 0.7));
    var baseY = h * 0.1 + ((seed * 3.7) % (h * 0.8));
    var y = baseY - phase * 30 + Math.sin(seed) * 20;
    var size = 2 + (seed % 4);
    var alpha = Math.max(0, 1 - phase * 0.8) * (0.3 + (seed % 5) * 0.1);

    ctx.fillStyle = 'rgba(255, 215, 100, ' + alpha + ')';
    // 4-point star
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.3, y - size * 0.3);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size * 0.3, y + size * 0.3);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.3, y + size * 0.3);
    ctx.lineTo(x - size, y);
    ctx.lineTo(x - size * 0.3, y - size * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════

function dti2DAnimate() {
  dti2D.breathPhase += 0.03;
  if (dti2D.breathPhase > Math.PI * 200) dti2D.breathPhase = 0;

  if (dti2D.runwayAnim) {
    dti2D.runwayPhase += 0.02;
    if (dti2D.runwayPhase > 1.5) {
      dti2D.runwayAnim = false;
      dti2D.runwayPhase = 0;
    }
  }

  try { dti2DRender(); } catch(e) { console.error('DTI 2D render error:', e); }
  dti2D.animFrameId = requestAnimationFrame(dti2DAnimate);
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API — called from lifestyle.html
// ═══════════════════════════════════════════════════════════

function dti2DUpdateSkin(skinTone) {
  dti2D.skinTone = { base: skinTone.base, hi: skinTone.hi, lo: skinTone.lo };
}

function dti2DClearClothing() {
  dti2D.clothing = {};
}

function dti2DAddClothing(svgKey, color, style) {
  // Determine category from key prefix
  var cat = null;
  if (svgKey.indexOf('hair') === 0) cat = 'hair';
  else if (svgKey.indexOf('top_') === 0) cat = 'tops';
  else if (svgKey.indexOf('bottom_') === 0) cat = 'bottoms';
  else if (svgKey.indexOf('shoes_') === 0) cat = 'shoes';
  else if (svgKey.indexOf('acc_') === 0) cat = 'accessories';

  if (cat) {
    dti2D.clothing[cat] = { svg: svgKey, color: color, style: style };
  }
}

function dti2DRunwaySpin() {
  dti2D.runwayAnim = true;
  dti2D.runwayPhase = 0;
}

function dti2DDestroy() {
  if (dti2D.animFrameId) {
    cancelAnimationFrame(dti2D.animFrameId);
    dti2D.animFrameId = null;
  }
  dti2D.initialized = false;
}
