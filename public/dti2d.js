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
// 7.5-head figure for realistic proportions that fill mobile canvas
function dti2DComputeBodyMetrics(w, h, breathOffset) {
  var s = Math.min(w / 320, h / 520);
  var cx = w / 2;
  var bo = breathOffset || 0;

  // Head unit = total height / 7.5 (using 92% of canvas)
  var hu = (h * 0.92) / 7.5;
  var topY = h * 0.03;

  var m = {
    s: s,
    cx: cx,
    hu: hu,
    // Head
    headCY: topY + hu * 0.5,
    headRX: hu * 0.42,
    headRY: hu * 0.5,
    // Neck
    neckTop: topY + hu * 0.95,
    neckBot: topY + hu * 1.15,
    neckW: hu * 0.18,
    // Shoulders
    shoulderY: topY + hu * 1.3 + bo * 0.3,
    shoulderW: hu * 1.0,
    // Bust
    bustY: topY + hu * 1.7,
    bustW: hu * 0.9,
    // Waist
    waistY: topY + hu * 2.4 + bo * 0.5,
    waistW: hu * 0.52,
    // Hip
    hipY: topY + hu * 2.9,
    hipW: hu * 0.88,
    // Crotch
    crotchY: topY + hu * 3.4,
    // Knee
    kneeY: topY + hu * 4.8,
    kneeW: hu * 0.24,
    // Ankle
    ankleY: topY + hu * 6.4,
    ankleW: hu * 0.15,
    // Foot
    footY: topY + hu * 6.8,
    footW: hu * 0.3,
    footH: hu * 0.22,
    // Arms
    armOuterX: hu * 0.54,  // offset from cx
    elbowY: topY + hu * 2.5,
    wristY: topY + hu * 3.2,
    handY: topY + hu * 3.45,
    handW: hu * 0.18,
    // Misc
    topY: topY,
    botY: topY + hu * 7.1
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
  // Set canvas internal resolution
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  // Let CSS control display size — do NOT set style.width/height in px
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  dti2D.canvas = canvas;
  dti2D.ctx = ctx;
  dti2D.width = w;
  dti2D.height = h;
  dti2D.dpr = dpr;
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

  for (var legSide = -1; legSide <= 1; legSide += 2) {
    var lx = cx + legSide * legSpread;
    var thighW = m.hu * 0.2;
    var calfW = m.hu * 0.16;

    // Leg gradient
    var legGrad = ctx.createLinearGradient(lx - thighW, 0, lx + thighW, 0);
    if (legSide < 0) {
      legGrad.addColorStop(0, lo);
      legGrad.addColorStop(0.4, base);
      legGrad.addColorStop(0.8, hi);
    } else {
      legGrad.addColorStop(0.2, hi);
      legGrad.addColorStop(0.6, base);
      legGrad.addColorStop(1, lo);
    }
    ctx.fillStyle = legGrad;

    ctx.beginPath();
    // Outer edge: thigh to knee (smooth curve with slight thigh fullness)
    ctx.moveTo(lx + legSide * thighW, m.crotchY);
    ctx.bezierCurveTo(
      lx + legSide * (thighW + m.hu * 0.02), m.crotchY + (m.kneeY - m.crotchY) * 0.4,
      lx + legSide * (m.kneeW + m.hu * 0.03), m.kneeY - m.hu * 0.1,
      lx + legSide * m.kneeW, m.kneeY
    );
    // Outer edge: knee to ankle (calf taper with subtle calf curve)
    ctx.bezierCurveTo(
      lx + legSide * (m.kneeW + m.hu * 0.01), m.kneeY + (m.ankleY - m.kneeY) * 0.3,
      lx + legSide * (m.ankleW + m.hu * 0.04), m.ankleY - m.hu * 0.2,
      lx + legSide * (m.ankleW + m.hu * 0.01), m.ankleY
    );
    // Ankle to foot top
    ctx.lineTo(lx + legSide * (m.ankleW + m.hu * 0.01), m.footY - m.hu * 0.02);
    // Foot bottom
    ctx.lineTo(lx - legSide * (m.ankleW + m.hu * 0.01), m.footY - m.hu * 0.02);
    // Inner ankle
    ctx.lineTo(lx - legSide * (m.ankleW + m.hu * 0.01), m.ankleY);
    // Inner edge: ankle to knee
    ctx.bezierCurveTo(
      lx - legSide * (m.ankleW + m.hu * 0.03), m.ankleY - m.hu * 0.15,
      lx - legSide * (m.kneeW - m.hu * 0.02), m.kneeY + (m.ankleY - m.kneeY) * 0.3,
      lx - legSide * (m.kneeW - m.hu * 0.02), m.kneeY
    );
    // Inner edge: knee to crotch
    ctx.bezierCurveTo(
      lx - legSide * (m.kneeW - m.hu * 0.01), m.kneeY - m.hu * 0.1,
      lx - legSide * (thighW - m.hu * 0.04), m.crotchY + (m.kneeY - m.crotchY) * 0.3,
      lx - legSide * (thighW - m.hu * 0.04), m.crotchY
    );
    ctx.closePath();
    ctx.fill();

    // Kneecap highlight
    ctx.fillStyle = dti2DAlpha(hi, 0.06);
    ctx.beginPath();
    ctx.ellipse(lx, m.kneeY, m.kneeW * 0.5, m.hu * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shin highlight
    ctx.strokeStyle = dti2DAlpha(hi, 0.05);
    ctx.lineWidth = m.hu * 0.02;
    ctx.beginPath();
    ctx.moveTo(lx + legSide * m.hu * 0.01, m.kneeY + m.hu * 0.05);
    ctx.lineTo(lx + legSide * m.hu * 0.005, m.ankleY - m.hu * 0.1);
    ctx.stroke();
  }

  // ── FEET (bare) ──
  for (var footSide = -1; footSide <= 1; footSide += 2) {
    var fx = cx + footSide * legSpread;
    // Foot shadow
    ctx.fillStyle = dti2DAlpha(lo, 0.08);
    ctx.beginPath();
    ctx.ellipse(fx + footSide * m.hu * 0.02, m.footY + m.hu * 0.01, m.footW * 0.55, m.footH * 0.4, footSide * 0.15, 0, Math.PI * 2);
    ctx.fill();
    // Foot body
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(fx + footSide * m.hu * 0.02, m.footY, m.footW * 0.52, m.footH * 0.38, footSide * 0.15, 0, Math.PI * 2);
    ctx.fill();
    // Toe line
    ctx.strokeStyle = dti2DAlpha(lo, 0.08);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(fx + footSide * m.hu * 0.04, m.footY - m.hu * 0.005, m.footW * 0.2, 0, Math.PI);
    ctx.stroke();
    // Ankle bone bump
    ctx.fillStyle = dti2DAlpha(hi, 0.08);
    ctx.beginPath();
    ctx.ellipse(fx + footSide * (m.ankleW + m.hu * 0.005), m.ankleY + m.hu * 0.01, m.hu * 0.015, m.hu * 0.02, 0, 0, Math.PI * 2);
    ctx.fill();
  }

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

  // Torso contour shading (adds 3D depth)
  ctx.save();
  // Re-trace torso for clipping
  ctx.beginPath();
  ctx.moveTo(cx - m.shoulderW / 2, m.shoulderY);
  ctx.quadraticCurveTo(cx - m.bustW / 2 - m.hu * 0.05, m.bustY - m.hu * 0.2, cx - m.bustW / 2, m.bustY);
  ctx.quadraticCurveTo(cx - m.bustW / 2 + m.hu * 0.05, (m.bustY + m.waistY) / 2, cx - m.waistW / 2, m.waistY);
  ctx.quadraticCurveTo(cx - m.waistW / 2 - m.hu * 0.08, (m.waistY + m.hipY) / 2, cx - m.hipW / 2, m.hipY);
  ctx.quadraticCurveTo(cx - m.hipW / 2 + m.hu * 0.05, (m.hipY + m.crotchY) / 2, cx - legSpread, m.crotchY);
  ctx.lineTo(cx + legSpread, m.crotchY);
  ctx.quadraticCurveTo(cx + m.hipW / 2 - m.hu * 0.05, (m.hipY + m.crotchY) / 2, cx + m.hipW / 2, m.hipY);
  ctx.quadraticCurveTo(cx + m.waistW / 2 + m.hu * 0.08, (m.waistY + m.hipY) / 2, cx + m.waistW / 2, m.waistY);
  ctx.quadraticCurveTo(cx + m.bustW / 2 - m.hu * 0.05, (m.bustY + m.waistY) / 2, cx + m.bustW / 2, m.bustY);
  ctx.quadraticCurveTo(cx + m.bustW / 2 + m.hu * 0.05, m.bustY - m.hu * 0.2, cx + m.shoulderW / 2, m.shoulderY);
  ctx.closePath();
  ctx.clip();
  // Left edge contour shadow
  var contourL = ctx.createLinearGradient(cx - m.shoulderW / 2 - m.hu * 0.05, 0, cx - m.waistW / 3, 0);
  contourL.addColorStop(0, dti2DAlpha(lo, 0.2));
  contourL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = contourL;
  ctx.fillRect(cx - m.shoulderW / 2 - m.hu * 0.1, m.shoulderY, m.shoulderW / 2, m.crotchY - m.shoulderY);
  // Right edge contour shadow
  var contourR = ctx.createLinearGradient(cx + m.shoulderW / 2 + m.hu * 0.05, 0, cx + m.waistW / 3, 0);
  contourR.addColorStop(0, dti2DAlpha(lo, 0.2));
  contourR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = contourR;
  ctx.fillRect(cx, m.shoulderY, m.shoulderW / 2 + m.hu * 0.1, m.crotchY - m.shoulderY);
  // Center highlight (light hits the front of torso)
  var centerHi = ctx.createRadialGradient(cx - m.hu * 0.05, m.bustY, 0, cx, m.waistY, m.bustW / 2);
  centerHi.addColorStop(0, dti2DAlpha(hi, 0.12));
  centerHi.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = centerHi;
  ctx.fillRect(cx - m.bustW / 2, m.shoulderY, m.bustW, m.hipY - m.shoulderY);
  ctx.restore();

  // Bust line shadow (defined under-bust crease)
  ctx.strokeStyle = dti2DAlpha(lo, 0.15);
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(cx - m.bustW / 2 + m.hu * 0.12, m.bustY + m.hu * 0.03);
  ctx.quadraticCurveTo(cx - m.bustW / 4, m.bustY + m.hu * 0.07, cx, m.bustY + m.hu * 0.05);
  ctx.quadraticCurveTo(cx + m.bustW / 4, m.bustY + m.hu * 0.07, cx + m.bustW / 2 - m.hu * 0.12, m.bustY + m.hu * 0.03);
  ctx.stroke();
  // Center cleavage shadow
  ctx.strokeStyle = dti2DAlpha(lo, 0.1);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.hu * 0.015, m.bustY - m.hu * 0.06);
  ctx.quadraticCurveTo(cx, m.bustY + m.hu * 0.04, cx + m.hu * 0.015, m.bustY - m.hu * 0.06);
  ctx.stroke();
  // Bust volume highlights (subtle roundness)
  ctx.fillStyle = dti2DAlpha(hi, 0.06);
  ctx.beginPath();
  ctx.ellipse(cx - m.bustW / 4, m.bustY - m.hu * 0.01, m.hu * 0.08, m.hu * 0.06, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + m.bustW / 4, m.bustY - m.hu * 0.01, m.hu * 0.08, m.hu * 0.06, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Collarbone detail
  ctx.strokeStyle = dti2DAlpha(lo, 0.12);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.shoulderW / 2 + m.hu * 0.05, m.shoulderY + m.hu * 0.02);
  ctx.quadraticCurveTo(cx - m.neckW * 1.2, m.shoulderY - m.hu * 0.02, cx - m.neckW * 0.8, m.neckBot + m.hu * 0.03);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + m.shoulderW / 2 - m.hu * 0.05, m.shoulderY + m.hu * 0.02);
  ctx.quadraticCurveTo(cx + m.neckW * 1.2, m.shoulderY - m.hu * 0.02, cx + m.neckW * 0.8, m.neckBot + m.hu * 0.03);
  ctx.stroke();

  // Navel hint
  ctx.strokeStyle = dti2DAlpha(lo, 0.1);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(cx, m.waistY + m.hu * 0.08, m.hu * 0.012, 0.3, Math.PI - 0.3);
  ctx.stroke();

  // ── ARMS ──
  var armW = m.hu * 0.15;

  // Draw arms with proper tapering and muscle definition
  for (var armSide = -1; armSide <= 1; armSide += 2) {
    var sDir = armSide;
    var armOutX = m.armOuterX;

    // Arm gradient (follows body gradient direction)
    var armGrad = ctx.createLinearGradient(cx + sDir * (armOutX - armW), 0, cx + sDir * (armOutX + armW), 0);
    if (sDir < 0) {
      armGrad.addColorStop(0, lo);
      armGrad.addColorStop(0.5, base);
      armGrad.addColorStop(1, hi);
    } else {
      armGrad.addColorStop(0, hi);
      armGrad.addColorStop(0.5, base);
      armGrad.addColorStop(1, lo);
    }
    ctx.fillStyle = armGrad;

    ctx.beginPath();
    // Shoulder connection (smooth blend into torso)
    ctx.moveTo(cx + sDir * m.shoulderW / 2, m.shoulderY);
    // Upper arm outer edge (slight bicep curve)
    ctx.bezierCurveTo(
      cx + sDir * (armOutX + armW * 0.6), m.shoulderY + m.hu * 0.15,
      cx + sDir * (armOutX + armW * 1.1), m.elbowY - m.hu * 0.15,
      cx + sDir * (armOutX + armW * 0.8), m.elbowY
    );
    // Forearm outer edge (slight taper)
    ctx.quadraticCurveTo(
      cx + sDir * (armOutX + armW * 0.7), (m.elbowY + m.wristY) / 2,
      cx + sDir * (armOutX + armW * 0.5), m.wristY
    );
    // Wrist to hand
    ctx.lineTo(cx + sDir * (armOutX + m.handW * 0.5), m.handY - m.hu * 0.01);
    // Hand — graceful, slightly curved fingers
    ctx.quadraticCurveTo(
      cx + sDir * (armOutX + m.handW * 0.55), m.handY + m.hu * 0.06,
      cx + sDir * (armOutX + m.handW * 0.15), m.handY + m.hu * 0.1
    );
    // Fingertip curve
    ctx.quadraticCurveTo(
      cx + sDir * (armOutX - m.handW * 0.15), m.handY + m.hu * 0.12,
      cx + sDir * (armOutX - m.handW * 0.2), m.handY + m.hu * 0.08
    );
    // Hand inner edge back up
    ctx.quadraticCurveTo(
      cx + sDir * (armOutX - m.handW * 0.3), m.handY + m.hu * 0.02,
      cx + sDir * (armOutX - armW * 0.3), m.wristY
    );
    // Forearm inner edge
    ctx.quadraticCurveTo(
      cx + sDir * (armOutX - armW * 0.2), (m.elbowY + m.wristY) / 2,
      cx + sDir * (armOutX - armW * 0.1), m.elbowY
    );
    // Upper arm inner edge back to shoulder
    ctx.quadraticCurveTo(
      cx + sDir * (armOutX + armW * 0.1), m.elbowY - m.hu * 0.2,
      cx + sDir * (m.shoulderW / 2 - m.hu * 0.06), m.shoulderY + m.hu * 0.18
    );
    ctx.closePath();
    ctx.fill();

    // Elbow dimple
    ctx.fillStyle = dti2DAlpha(lo, 0.06);
    ctx.beginPath();
    ctx.arc(cx + sDir * armOutX, m.elbowY, armW * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Wrist line
    ctx.strokeStyle = dti2DAlpha(lo, 0.1);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx + sDir * (armOutX - armW * 0.25), m.wristY + m.hu * 0.005);
    ctx.lineTo(cx + sDir * (armOutX + armW * 0.45), m.wristY + m.hu * 0.005);
    ctx.stroke();

    // Finger separation lines (subtle)
    ctx.strokeStyle = dti2DAlpha(lo, 0.07);
    ctx.lineWidth = 0.4;
    var fingerBase = m.handY + m.hu * 0.04;
    for (var fi = 0; fi < 3; fi++) {
      var fOff = (fi - 1) * m.handW * 0.18;
      ctx.beginPath();
      ctx.moveTo(cx + sDir * (armOutX + fOff), fingerBase);
      ctx.lineTo(cx + sDir * (armOutX + fOff), fingerBase + m.hu * 0.03);
      ctx.stroke();
    }
  }

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

  // Jaw line (elegant V-shaped chin taper)
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(cx - m.headRX * 0.82, m.headCY + m.headRY * 0.25);
  ctx.quadraticCurveTo(cx - m.headRX * 0.6, m.headCY + m.headRY * 0.85, cx - m.headRX * 0.2, m.headCY + m.headRY * 1.05);
  ctx.quadraticCurveTo(cx, m.headCY + m.headRY * 1.1, cx + m.headRX * 0.2, m.headCY + m.headRY * 1.05);
  ctx.quadraticCurveTo(cx + m.headRX * 0.6, m.headCY + m.headRY * 0.85, cx + m.headRX * 0.82, m.headCY + m.headRY * 0.25);
  ctx.lineTo(cx + m.headRX * 0.82, m.headCY + m.headRY * 0.55);
  ctx.quadraticCurveTo(cx, m.headCY + m.headRY * 0.85, cx - m.headRX * 0.82, m.headCY + m.headRY * 0.55);
  ctx.closePath();
  ctx.fill();
  // Jaw contour shadow
  ctx.strokeStyle = dti2DAlpha(lo, 0.06);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.headRX * 0.65, m.headCY + m.headRY * 0.65);
  ctx.quadraticCurveTo(cx - m.headRX * 0.35, m.headCY + m.headRY * 0.95, cx, m.headCY + m.headRY * 1.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + m.headRX * 0.65, m.headCY + m.headRY * 0.65);
  ctx.quadraticCurveTo(cx + m.headRX * 0.35, m.headCY + m.headRY * 0.95, cx, m.headCY + m.headRY * 1.05);
  ctx.stroke();

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

  // Eye positions — larger, more expressive
  var eyeY = headCY - headRY * 0.02;
  var eyeSpacing = headRX * 0.42;
  var eyeW = hu * 0.11;
  var eyeH = hu * 0.055;

  // ── EYEBROWS ── (gradient filled, not just strokes)
  var browColor = dti2DShade(skin.base, -65);
  ctx.lineCap = 'round';
  for (var side = -1; side <= 1; side += 2) {
    var bx = cx + side * eyeSpacing;
    // Filled brow shape
    ctx.fillStyle = browColor;
    ctx.beginPath();
    ctx.moveTo(bx - side * eyeW * 0.85, eyeY - eyeH * 2.4);
    ctx.quadraticCurveTo(bx, eyeY - eyeH * 3.5, bx + side * eyeW * 0.95, eyeY - eyeH * 2.7);
    ctx.quadraticCurveTo(bx + side * eyeW * 0.5, eyeY - eyeH * 2.2, bx - side * eyeW * 0.7, eyeY - eyeH * 2.1);
    ctx.closePath();
    ctx.fill();
    // Brow hair strokes
    ctx.strokeStyle = dti2DAlpha(browColor, 0.3);
    ctx.lineWidth = hu * 0.008;
    for (var bi = 0; bi < 5; bi++) {
      var bt = bi / 4;
      var bsx = bx - side * eyeW * 0.6 + side * eyeW * 1.3 * bt;
      var bsy = eyeY - eyeH * (2.2 + Math.sin(bt * Math.PI) * 0.9);
      ctx.beginPath();
      ctx.moveTo(bsx, bsy + hu * 0.008);
      ctx.lineTo(bsx + side * hu * 0.015, bsy - hu * 0.005);
      ctx.stroke();
    }
  }

  // ── EYES ── (almond-shaped with lid crease)
  for (var es = -1; es <= 1; es += 2) {
    var ex = cx + es * eyeSpacing;

    // Eyelid crease
    ctx.strokeStyle = dti2DAlpha(lo, 0.15);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(ex - eyeW * 0.9, eyeY - eyeH * 1.2);
    ctx.quadraticCurveTo(ex, eyeY - eyeH * 1.8, ex + eyeW * 0.9, eyeY - eyeH * 1.0);
    ctx.stroke();

    // Eye whites (almond shape)
    ctx.fillStyle = '#faf7f2';
    ctx.beginPath();
    ctx.moveTo(ex - eyeW, eyeY + eyeH * 0.1);
    ctx.quadraticCurveTo(ex - eyeW * 0.3, eyeY - eyeH * 1.1, ex + eyeW * 0.6, eyeY - eyeH * 0.6);
    ctx.quadraticCurveTo(ex + eyeW * 1.05, eyeY - eyeH * 0.2, ex + eyeW, eyeY + eyeH * 0.15);
    ctx.quadraticCurveTo(ex + eyeW * 0.3, eyeY + eyeH * 1.1, ex - eyeW * 0.3, eyeY + eyeH * 0.7);
    ctx.quadraticCurveTo(ex - eyeW * 0.9, eyeY + eyeH * 0.5, ex - eyeW, eyeY + eyeH * 0.1);
    ctx.closePath();
    ctx.fill();

    // Iris with gradient
    var irisR = eyeH * 0.9;
    var irisGrad = ctx.createRadialGradient(ex, eyeY + eyeH * 0.1, 0, ex, eyeY + eyeH * 0.1, irisR);
    irisGrad.addColorStop(0, '#3a2510');
    irisGrad.addColorStop(0.3, '#5a3a20');
    irisGrad.addColorStop(0.7, '#6a4a2a');
    irisGrad.addColorStop(1, '#4a3018');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(ex, eyeY + eyeH * 0.1, irisR, 0, Math.PI * 2);
    ctx.fill();
    // Iris ring
    ctx.strokeStyle = '#3a2010';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Pupil
    var pupilR = irisR * 0.45;
    ctx.fillStyle = '#0a0500';
    ctx.beginPath();
    ctx.arc(ex, eyeY + eyeH * 0.1, pupilR, 0, Math.PI * 2);
    ctx.fill();

    // Large catchlight
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(ex - irisR * 0.3, eyeY - eyeH * 0.15, pupilR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // Small secondary catchlight
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(ex + irisR * 0.25, eyeY + eyeH * 0.3, pupilR * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Upper eyelid shadow (on the white)
    ctx.fillStyle = dti2DAlpha(lo, 0.08);
    ctx.beginPath();
    ctx.moveTo(ex - eyeW, eyeY + eyeH * 0.1);
    ctx.quadraticCurveTo(ex, eyeY - eyeH * 0.8, ex + eyeW, eyeY + eyeH * 0.15);
    ctx.quadraticCurveTo(ex, eyeY - eyeH * 0.3, ex - eyeW, eyeY + eyeH * 0.1);
    ctx.fill();

    // Eyeliner (thicker at outer corner)
    ctx.strokeStyle = '#1a0a05';
    ctx.lineWidth = hu * 0.018;
    ctx.beginPath();
    ctx.moveTo(ex - eyeW * 1.05, eyeY + eyeH * 0.15);
    ctx.quadraticCurveTo(ex, eyeY - eyeH * 1.15, ex + eyeW * 1.1, eyeY - eyeH * 0.05);
    ctx.stroke();

    // Individual lashes (upper)
    ctx.strokeStyle = '#1a0a05';
    ctx.lineWidth = hu * 0.008;
    for (var li = 0; li < 6; li++) {
      var lt = li / 5;
      var lx = ex - eyeW * 0.8 + eyeW * 1.6 * lt;
      var ly = eyeY - eyeH * (0.7 + Math.sin(lt * Math.PI) * 0.4);
      var lAngle = -1.2 + lt * 0.6;
      var lLen = hu * (0.018 + Math.sin(lt * Math.PI) * 0.01);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + Math.cos(lAngle) * lLen * es * 0.3, ly - lLen);
      ctx.stroke();
    }

    // Lower lash line (subtle)
    ctx.strokeStyle = dti2DAlpha('#1a0a05', 0.4);
    ctx.lineWidth = hu * 0.008;
    ctx.beginPath();
    ctx.moveTo(ex - eyeW * 0.6, eyeY + eyeH * 0.55);
    ctx.quadraticCurveTo(ex, eyeY + eyeH * 0.95, ex + eyeW * 0.8, eyeY + eyeH * 0.25);
    ctx.stroke();
  }

  // ── NOSE ── (shadow-based, more defined)
  var noseY = headCY + headRY * 0.25;
  // Nose bridge shadow
  ctx.fillStyle = dti2DAlpha(lo, 0.08);
  ctx.beginPath();
  ctx.moveTo(cx - hu * 0.015, headCY - headRY * 0.1);
  ctx.quadraticCurveTo(cx - hu * 0.025, noseY - hu * 0.02, cx - hu * 0.035, noseY);
  ctx.lineTo(cx + hu * 0.01, noseY);
  ctx.quadraticCurveTo(cx + hu * 0.005, noseY - hu * 0.02, cx + hu * 0.005, headCY - headRY * 0.1);
  ctx.closePath();
  ctx.fill();
  // Nose tip
  ctx.fillStyle = dti2DAlpha(lo, 0.1);
  ctx.beginPath();
  ctx.ellipse(cx, noseY + hu * 0.005, hu * 0.025, hu * 0.015, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = dti2DAlpha(lo, 0.18);
  ctx.beginPath();
  ctx.ellipse(cx - hu * 0.018, noseY + hu * 0.01, hu * 0.01, hu * 0.007, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + hu * 0.018, noseY + hu * 0.01, hu * 0.01, hu * 0.007, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Nose highlight
  ctx.fillStyle = dti2DAlpha(hi, 0.1);
  ctx.beginPath();
  ctx.ellipse(cx - hu * 0.005, noseY - hu * 0.02, hu * 0.008, hu * 0.02, 0, 0, Math.PI * 2);
  ctx.fill();

  // Philtrum (groove between nose and lip)
  ctx.strokeStyle = dti2DAlpha(lo, 0.08);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - hu * 0.008, noseY + hu * 0.02);
  ctx.lineTo(cx - hu * 0.01, noseY + hu * 0.055);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + hu * 0.008, noseY + hu * 0.02);
  ctx.lineTo(cx + hu * 0.01, noseY + hu * 0.055);
  ctx.stroke();

  // ── LIPS ── (fuller, more defined with cupid's bow)
  var lipY = headCY + headRY * 0.52;
  var lipW = hu * 0.12;
  var lipColor = dti2DShade(base, -20);
  var lipHi = dti2DShade(lipColor, 25);
  var lipDk = dti2DShade(lipColor, -15);

  // Upper lip with cupid's bow
  ctx.fillStyle = lipColor;
  ctx.beginPath();
  ctx.moveTo(cx - lipW, lipY);
  ctx.quadraticCurveTo(cx - lipW * 0.6, lipY - hu * 0.025, cx - lipW * 0.2, lipY - hu * 0.015);
  // Cupid's bow dip
  ctx.quadraticCurveTo(cx, lipY - hu * 0.005, cx + lipW * 0.2, lipY - hu * 0.015);
  ctx.quadraticCurveTo(cx + lipW * 0.6, lipY - hu * 0.025, cx + lipW, lipY);
  // Lower edge of upper lip
  ctx.quadraticCurveTo(cx + lipW * 0.4, lipY + hu * 0.01, cx, lipY + hu * 0.012);
  ctx.quadraticCurveTo(cx - lipW * 0.4, lipY + hu * 0.01, cx - lipW, lipY);
  ctx.fill();

  // Upper lip cupid's bow peaks
  ctx.fillStyle = lipDk;
  ctx.beginPath();
  ctx.moveTo(cx - lipW * 0.15, lipY - hu * 0.015);
  ctx.quadraticCurveTo(cx, lipY - hu * 0.03, cx + lipW * 0.15, lipY - hu * 0.015);
  ctx.quadraticCurveTo(cx, lipY - hu * 0.02, cx - lipW * 0.15, lipY - hu * 0.015);
  ctx.fill();

  // Lower lip (fuller)
  var lowerLipGrad = ctx.createRadialGradient(cx, lipY + hu * 0.035, 0, cx, lipY + hu * 0.03, lipW * 0.8);
  lowerLipGrad.addColorStop(0, lipHi);
  lowerLipGrad.addColorStop(0.6, lipColor);
  lowerLipGrad.addColorStop(1, lipDk);
  ctx.fillStyle = lowerLipGrad;
  ctx.beginPath();
  ctx.moveTo(cx - lipW * 0.9, lipY + hu * 0.01);
  ctx.quadraticCurveTo(cx - lipW * 0.5, lipY + hu * 0.06, cx, lipY + hu * 0.065);
  ctx.quadraticCurveTo(cx + lipW * 0.5, lipY + hu * 0.06, cx + lipW * 0.9, lipY + hu * 0.01);
  ctx.quadraticCurveTo(cx + lipW * 0.3, lipY + hu * 0.045, cx, lipY + hu * 0.05);
  ctx.quadraticCurveTo(cx - lipW * 0.3, lipY + hu * 0.045, cx - lipW * 0.9, lipY + hu * 0.01);
  ctx.fill();

  // Lip shine highlight
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx - hu * 0.01, lipY + hu * 0.03, lipW * 0.25, hu * 0.01, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Lip line (between upper and lower)
  ctx.strokeStyle = dti2DAlpha(lipDk, 0.3);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - lipW * 0.85, lipY + hu * 0.005);
  ctx.quadraticCurveTo(cx, lipY + hu * 0.015, cx + lipW * 0.85, lipY + hu * 0.005);
  ctx.stroke();

  // Shadow under lower lip
  ctx.strokeStyle = dti2DAlpha(lo, 0.1);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx - lipW * 0.6, lipY + hu * 0.07);
  ctx.quadraticCurveTo(cx, lipY + hu * 0.08, cx + lipW * 0.6, lipY + hu * 0.07);
  ctx.stroke();

  // ── CHEEK BLUSH ── (softer, more visible)
  var blushGrad = ctx.createRadialGradient(cx - headRX * 0.55, headCY + headRY * 0.18, 0, cx - headRX * 0.55, headCY + headRY * 0.18, hu * 0.08);
  blushGrad.addColorStop(0, dti2DAlpha(dti2DShade(base, -10), 0.12));
  blushGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = blushGrad;
  ctx.beginPath();
  ctx.ellipse(cx - headRX * 0.55, headCY + headRY * 0.18, hu * 0.08, hu * 0.05, -0.1, 0, Math.PI * 2);
  ctx.fill();
  var blushGrad2 = ctx.createRadialGradient(cx + headRX * 0.55, headCY + headRY * 0.18, 0, cx + headRX * 0.55, headCY + headRY * 0.18, hu * 0.08);
  blushGrad2.addColorStop(0, dti2DAlpha(dti2DShade(base, -10), 0.12));
  blushGrad2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = blushGrad2;
  ctx.beginPath();
  ctx.ellipse(cx + headRX * 0.55, headCY + headRY * 0.18, hu * 0.08, hu * 0.05, 0.1, 0, Math.PI * 2);
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

// Helper: fabric gradient fill based on style (richer, multi-stop)
function dti2DFabricFill(ctx, color, style, x1, y1, x2, y2) {
  var hi = dti2DShade(color, 40);
  var lo = dti2DShade(color, -40);
  var mid = dti2DShade(color, 12);
  var grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, hi);
  grad.addColorStop(0.15, dti2DShade(color, 25));
  grad.addColorStop(0.35, mid);
  grad.addColorStop(0.55, color);
  grad.addColorStop(0.75, dti2DShade(color, -18));
  grad.addColorStop(0.9, dti2DShade(color, -30));
  grad.addColorStop(1, lo);
  return grad;
}

// Helper: draw fabric wrinkle/fold lines that are actually visible
function dti2DFabricFolds(ctx, color, folds, width) {
  var dk = dti2DShade(color, -55);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (var i = 0; i < folds.length; i++) {
    var f = folds[i];
    // Draw each fold with double-stroke for depth
    // Shadow line (darker, wider)
    ctx.strokeStyle = dti2DAlpha(dk, 0.18);
    ctx.lineWidth = (width || 0.9) + 0.4;
    ctx.beginPath();
    ctx.moveTo(f[0], f[1]);
    if (f.length === 6) ctx.quadraticCurveTo(f[2], f[3], f[4], f[5]);
    else if (f.length === 8) ctx.bezierCurveTo(f[2], f[3], f[4], f[5], f[6], f[7]);
    else ctx.lineTo(f[2], f[3]);
    ctx.stroke();
    // Main fold line
    ctx.strokeStyle = dti2DAlpha(dk, 0.28);
    ctx.lineWidth = width || 0.9;
    ctx.beginPath();
    ctx.moveTo(f[0], f[1]);
    if (f.length === 6) ctx.quadraticCurveTo(f[2], f[3], f[4], f[5]);
    else if (f.length === 8) ctx.bezierCurveTo(f[2], f[3], f[4], f[5], f[6], f[7]);
    else ctx.lineTo(f[2], f[3]);
    ctx.stroke();
  }
  ctx.restore();
}

// Helper: draw a highlight fold line (light crease where fabric catches light)
function dti2DFabricHighlights(ctx, color, folds, width) {
  var hi = dti2DShade(color, 50);
  ctx.save();
  ctx.strokeStyle = dti2DAlpha(hi, 0.22);
  ctx.lineWidth = width || 0.8;
  ctx.lineCap = 'round';
  for (var i = 0; i < folds.length; i++) {
    var f = folds[i];
    ctx.beginPath();
    ctx.moveTo(f[0], f[1]);
    if (f.length === 6) ctx.quadraticCurveTo(f[2], f[3], f[4], f[5]);
    else if (f.length === 8) ctx.bezierCurveTo(f[2], f[3], f[4], f[5], f[6], f[7]);
    else ctx.lineTo(f[2], f[3]);
    ctx.stroke();
  }
  ctx.restore();
}

// Helper: draw hem (thick bottom edge with shadow)
function dti2DDrawHem(ctx, color, points, thickness) {
  var dk = dti2DShade(color, -40);
  ctx.save();
  // Shadow line just above hem
  ctx.strokeStyle = dti2DAlpha(dk, 0.18);
  ctx.lineWidth = thickness || 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (var i = 2; i < points.length; i += 2) {
    ctx.lineTo(points[i], points[i + 1]);
  }
  ctx.stroke();
  ctx.restore();
}

// Helper: draw seam stitch marks
function dti2DDrawStitching(ctx, color, x1, y1, x2, y2, count) {
  var dk = dti2DShade(color, -45);
  ctx.save();
  ctx.strokeStyle = dti2DAlpha(dk, 0.18);
  ctx.lineWidth = 0.5;
  var n = count || 8;
  for (var i = 0; i <= n; i++) {
    var t = i / n;
    var x = x1 + (x2 - x1) * t;
    var y = y1 + (y2 - y1) * t;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 1);
    ctx.lineTo(x + 1, y + 1);
    ctx.stroke();
  }
  ctx.restore();
}

// top_fitted: Fitted top (shoulder to hip, follows curves)
function dti2DDrawTopFitted(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  ctx.save();

  // Main shape path (reusable)
  function topPath() {
    ctx.beginPath();
    ctx.moveTo(cx - m.neckW * 1.0, m.neckBot + hu * 0.02);
    ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.06, cx + m.neckW * 1.0, m.neckBot + hu * 0.02);
    ctx.lineTo(cx + m.shoulderW / 2 + pad, m.shoulderY);
    ctx.lineTo(cx + m.shoulderW / 2 + pad, m.shoulderY + hu * 0.3);
    ctx.quadraticCurveTo(cx + m.bustW / 2 + pad, m.bustY, cx + m.bustW / 2 + pad, m.bustY + hu * 0.05);
    ctx.quadraticCurveTo(cx + m.waistW / 2 + pad + hu * 0.05, m.waistY, cx + m.hipW / 2 + pad, m.hipY);
    ctx.lineTo(cx + m.hipW / 2 + pad, m.hipY + hu * 0.05);
    ctx.quadraticCurveTo(cx, m.hipY + hu * 0.08, cx - m.hipW / 2 - pad, m.hipY + hu * 0.05);
    ctx.lineTo(cx - m.hipW / 2 - pad, m.hipY);
    ctx.quadraticCurveTo(cx - m.waistW / 2 - pad - hu * 0.05, m.waistY, cx - m.bustW / 2 - pad, m.bustY + hu * 0.05);
    ctx.quadraticCurveTo(cx - m.bustW / 2 - pad, m.bustY, cx - m.shoulderW / 2 - pad, m.shoulderY + hu * 0.3);
    ctx.lineTo(cx - m.shoulderW / 2 - pad, m.shoulderY);
    ctx.closePath();
  }

  // Base fill
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.shoulderW / 2, m.shoulderY, cx + m.shoulderW / 2, m.hipY);
  topPath();
  ctx.fill();

  // Side shadow overlay (gives 3D roundness)
  ctx.save();
  topPath();
  ctx.clip();
  var sideShadowR = ctx.createLinearGradient(cx - m.shoulderW / 2 - pad, 0, cx - m.waistW / 2, 0);
  sideShadowR.addColorStop(0, dti2DAlpha(dti2DShade(color, -50), 0.2));
  sideShadowR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideShadowR;
  ctx.fillRect(cx - m.shoulderW / 2 - pad - hu * 0.1, m.shoulderY, m.shoulderW / 2, m.hipY - m.shoulderY + hu * 0.1);
  var sideShadowL = ctx.createLinearGradient(cx + m.shoulderW / 2 + pad, 0, cx + m.waistW / 2, 0);
  sideShadowL.addColorStop(0, dti2DAlpha(dti2DShade(color, -50), 0.2));
  sideShadowL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideShadowL;
  ctx.fillRect(cx, m.shoulderY, m.shoulderW / 2 + pad + hu * 0.1, m.hipY - m.shoulderY + hu * 0.1);
  // Bust shadow
  var bustShadow = ctx.createRadialGradient(cx, m.bustY + hu * 0.05, 0, cx, m.bustY + hu * 0.05, m.bustW / 2);
  bustShadow.addColorStop(0, 'rgba(0,0,0,0)');
  bustShadow.addColorStop(0.7, 'rgba(0,0,0,0)');
  bustShadow.addColorStop(1, dti2DAlpha(dti2DShade(color, -40), 0.12));
  ctx.fillStyle = bustShadow;
  ctx.fillRect(cx - m.bustW / 2, m.bustY - hu * 0.1, m.bustW, hu * 0.3);
  ctx.restore();

  // Visible wrinkle fold lines
  dti2DFabricFolds(ctx, color, [
    // Diagonal folds from bust to waist
    [cx - m.bustW / 4, m.bustY + hu * 0.05, cx - m.waistW / 3, m.waistY - hu * 0.05, cx - m.waistW / 4 - hu * 0.02, m.waistY + hu * 0.08],
    [cx + m.bustW / 4, m.bustY + hu * 0.05, cx + m.waistW / 3, m.waistY - hu * 0.05, cx + m.waistW / 4 + hu * 0.02, m.waistY + hu * 0.08],
    // Waist gather folds
    [cx - m.waistW / 3, m.waistY, cx - m.hipW / 3 - hu * 0.01, (m.waistY + m.hipY) / 2, cx - m.hipW / 4, m.hipY],
    [cx + m.waistW / 3, m.waistY, cx + m.hipW / 3 + hu * 0.01, (m.waistY + m.hipY) / 2, cx + m.hipW / 4, m.hipY],
    // Center crease
    [cx, m.bustY + hu * 0.08, cx - hu * 0.01, m.waistY, cx + hu * 0.01, m.hipY - hu * 0.05],
    // Under-bust drape
    [cx - m.bustW / 3, m.bustY + hu * 0.02, cx, m.bustY + hu * 0.1, cx + m.bustW / 3, m.bustY + hu * 0.02],
    // Shoulder tension lines
    [cx - m.shoulderW / 2, m.shoulderY + hu * 0.02, cx - m.shoulderW / 3, m.shoulderY + hu * 0.12],
    [cx + m.shoulderW / 2, m.shoulderY + hu * 0.02, cx + m.shoulderW / 3, m.shoulderY + hu * 0.12]
  ], 0.9);

  // Light fabric highlights between folds
  dti2DFabricHighlights(ctx, color, [
    [cx - m.bustW / 6, m.bustY, cx - m.waistW / 5, (m.bustY + m.waistY) / 2, cx - m.waistW / 4, m.waistY],
    [cx + m.bustW / 6, m.bustY, cx + m.waistW / 5, (m.bustY + m.waistY) / 2, cx + m.waistW / 4, m.waistY]
  ], 1);

  // Neckline seam
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -45), 0.25);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - m.neckW * 1.0, m.neckBot + hu * 0.02);
  ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.06, cx + m.neckW * 1.0, m.neckBot + hu * 0.02);
  ctx.stroke();

  // Hem with thickness
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.25);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.hipW / 2 - pad, m.hipY + hu * 0.05);
  ctx.quadraticCurveTo(cx, m.hipY + hu * 0.08, cx + m.hipW / 2 + pad, m.hipY + hu * 0.05);
  ctx.stroke();

  // Sleeve cuff seam
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - m.shoulderW / 2 - pad, m.shoulderY + hu * 0.29);
  ctx.lineTo(cx - m.bustW / 2 - pad, m.shoulderY + hu * 0.29);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + m.shoulderW / 2 + pad, m.shoulderY + hu * 0.29);
  ctx.lineTo(cx + m.bustW / 2 + pad, m.shoulderY + hu * 0.29);
  ctx.stroke();

  ctx.restore();
}

// top_crop: Crop top (shoulder to just below bust)
function dti2DDrawTopCrop(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var hemY = m.bustY + hu * 0.15;
  ctx.save();

  function cropPath() {
    ctx.beginPath();
    ctx.moveTo(cx - m.neckW * 1.3, m.neckBot);
    ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.1, cx + m.neckW * 1.3, m.neckBot);
    ctx.lineTo(cx + m.shoulderW / 2 + pad, m.shoulderY);
    ctx.lineTo(cx + m.shoulderW / 2 + pad, m.shoulderY + hu * 0.18);
    ctx.quadraticCurveTo(cx + m.bustW / 2 + pad, m.bustY, cx + m.bustW / 2 + pad - hu * 0.02, hemY);
    ctx.quadraticCurveTo(cx, hemY + hu * 0.02, cx - m.bustW / 2 - pad + hu * 0.02, hemY);
    ctx.quadraticCurveTo(cx - m.bustW / 2 - pad, m.bustY, cx - m.shoulderW / 2 - pad, m.shoulderY + hu * 0.18);
    ctx.lineTo(cx - m.shoulderW / 2 - pad, m.shoulderY);
    ctx.closePath();
  }

  // Base fill
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.shoulderW / 2, m.shoulderY, cx + m.shoulderW / 2, hemY);
  cropPath();
  ctx.fill();

  // Side shadow overlay
  ctx.save();
  cropPath();
  ctx.clip();
  var ss = ctx.createLinearGradient(cx - m.shoulderW / 2 - pad, 0, cx - m.bustW / 3, 0);
  ss.addColorStop(0, dti2DAlpha(dti2DShade(color, -45), 0.18));
  ss.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ss;
  ctx.fillRect(cx - m.shoulderW / 2 - pad - hu * 0.05, m.shoulderY, m.shoulderW / 2, hemY - m.shoulderY + hu * 0.05);
  var ss2 = ctx.createLinearGradient(cx + m.shoulderW / 2 + pad, 0, cx + m.bustW / 3, 0);
  ss2.addColorStop(0, dti2DAlpha(dti2DShade(color, -45), 0.18));
  ss2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ss2;
  ctx.fillRect(cx, m.shoulderY, m.shoulderW / 2 + pad + hu * 0.05, hemY - m.shoulderY + hu * 0.05);
  ctx.restore();

  // Wrinkle folds
  dti2DFabricFolds(ctx, color, [
    [cx - m.bustW / 4, m.bustY - hu * 0.05, cx - m.bustW / 3, m.bustY + hu * 0.05, cx - m.bustW / 4 - hu * 0.01, hemY - hu * 0.02],
    [cx + m.bustW / 4, m.bustY - hu * 0.05, cx + m.bustW / 3, m.bustY + hu * 0.05, cx + m.bustW / 4 + hu * 0.01, hemY - hu * 0.02],
    [cx - m.bustW / 3, m.bustY, cx, m.bustY + hu * 0.08, cx + m.bustW / 3, m.bustY],
    [cx - m.shoulderW / 3, m.shoulderY + hu * 0.03, cx - m.shoulderW / 4, m.shoulderY + hu * 0.1]
  ], 0.9);

  // Neckline seam
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.25);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - m.neckW * 1.3, m.neckBot);
  ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.1, cx + m.neckW * 1.3, m.neckBot);
  ctx.stroke();

  // Hem with visible thickness
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.28);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - m.bustW / 2 - pad + hu * 0.02, hemY);
  ctx.quadraticCurveTo(cx, hemY + hu * 0.02, cx + m.bustW / 2 + pad - hu * 0.02, hemY);
  ctx.stroke();

  // Elastic gather at hem (small scallops)
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -35), 0.15);
  ctx.lineWidth = 0.6;
  var hemLeft = cx - m.bustW / 2 - pad + hu * 0.04;
  var hemRight = cx + m.bustW / 2 + pad - hu * 0.04;
  var hemSegs = 6;
  for (var i = 0; i < hemSegs; i++) {
    var sx = hemLeft + (hemRight - hemLeft) * (i / hemSegs);
    var ex = hemLeft + (hemRight - hemLeft) * ((i + 1) / hemSegs);
    ctx.beginPath();
    ctx.moveTo(sx, hemY - hu * 0.005);
    ctx.quadraticCurveTo((sx + ex) / 2, hemY + hu * 0.015, ex, hemY - hu * 0.005);
    ctx.stroke();
  }

  ctx.restore();
}

// top_oversized: Oversized/baggy top (wider, boxy)
function dti2DDrawTopOversized(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var extra = hu * 0.12;
  var hemY = m.hipY + hu * 0.12;
  ctx.save();

  function oversizePath() {
    ctx.beginPath();
    ctx.moveTo(cx - m.neckW * 1.2, m.neckBot);
    ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.05, cx + m.neckW * 1.2, m.neckBot);
    ctx.lineTo(cx + m.shoulderW / 2 + extra, m.shoulderY + hu * 0.08);
    ctx.lineTo(cx + m.shoulderW / 2 + extra + hu * 0.05, m.elbowY - hu * 0.2);
    ctx.lineTo(cx + m.shoulderW / 2 + extra - hu * 0.02, m.elbowY - hu * 0.15);
    ctx.lineTo(cx + m.hipW / 2 + extra, hemY);
    ctx.lineTo(cx - m.hipW / 2 - extra, hemY);
    ctx.lineTo(cx - m.shoulderW / 2 - extra + hu * 0.02, m.elbowY - hu * 0.15);
    ctx.lineTo(cx - m.shoulderW / 2 - extra - hu * 0.05, m.elbowY - hu * 0.2);
    ctx.lineTo(cx - m.shoulderW / 2 - extra, m.shoulderY + hu * 0.08);
    ctx.closePath();
  }

  // Base fill
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.shoulderW / 2 - extra, m.shoulderY, cx + m.shoulderW / 2 + extra, hemY);
  oversizePath();
  ctx.fill();

  // Shadow overlay for depth
  ctx.save();
  oversizePath();
  ctx.clip();
  // Vertical center drape shadow (fabric hangs from shoulders)
  var drapeShadow = ctx.createRadialGradient(cx, m.waistY, m.waistW / 3, cx, m.waistY, m.hipW / 2 + extra);
  drapeShadow.addColorStop(0, 'rgba(0,0,0,0)');
  drapeShadow.addColorStop(0.6, 'rgba(0,0,0,0)');
  drapeShadow.addColorStop(1, dti2DAlpha(dti2DShade(color, -40), 0.15));
  ctx.fillStyle = drapeShadow;
  ctx.fillRect(cx - m.hipW / 2 - extra, m.shoulderY, m.hipW + extra * 2, hemY - m.shoulderY);
  ctx.restore();

  // Heavy drape fold lines (oversized = more folds)
  dti2DFabricFolds(ctx, color, [
    [cx - m.waistW / 3, m.bustY, cx - m.waistW / 2.5, m.waistY, cx - m.hipW / 3, hemY],
    [cx + m.waistW / 3, m.bustY, cx + m.waistW / 2.5, m.waistY, cx + m.hipW / 3, hemY],
    [cx - m.waistW / 6, m.bustY + hu * 0.1, cx - m.waistW / 5, m.waistY + hu * 0.1, cx - m.hipW / 5, hemY - hu * 0.02],
    [cx + m.waistW / 6, m.bustY + hu * 0.1, cx + m.waistW / 5, m.waistY + hu * 0.1, cx + m.hipW / 5, hemY - hu * 0.02],
    // Sleeve drape folds
    [cx + m.shoulderW / 2 + extra * 0.5, m.shoulderY + hu * 0.1, cx + m.shoulderW / 2 + extra * 0.3, m.elbowY - hu * 0.25],
    [cx - m.shoulderW / 2 - extra * 0.5, m.shoulderY + hu * 0.1, cx - m.shoulderW / 2 - extra * 0.3, m.elbowY - hu * 0.25],
    // Horizontal wrinkles at gather points
    [cx - m.waistW / 2, m.waistY + hu * 0.05, cx, m.waistY + hu * 0.08, cx + m.waistW / 2, m.waistY + hu * 0.05],
    [cx - m.hipW / 3, m.hipY, cx, m.hipY + hu * 0.03, cx + m.hipW / 3, m.hipY]
  ], 1.0);

  // Highlights between folds
  dti2DFabricHighlights(ctx, color, [
    [cx, m.bustY + hu * 0.05, cx - hu * 0.02, m.waistY, cx + hu * 0.02, hemY - hu * 0.1],
    [cx - m.waistW / 4, m.bustY, cx - m.waistW / 3, m.waistY],
    [cx + m.waistW / 4, m.bustY, cx + m.waistW / 3, m.waistY]
  ], 1.2);

  // Neckline seam (ribbed collar)
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.22);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - m.neckW * 1.2, m.neckBot);
  ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.05, cx + m.neckW * 1.2, m.neckBot);
  ctx.stroke();

  // Hem with thickness
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.25);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - m.hipW / 2 - extra, hemY);
  ctx.lineTo(cx + m.hipW / 2 + extra, hemY);
  ctx.stroke();

  // Sleeve cuff seams
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx + m.shoulderW / 2 + extra - hu * 0.02, m.elbowY - hu * 0.15);
  ctx.lineTo(cx + m.shoulderW / 2 + extra + hu * 0.05, m.elbowY - hu * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - m.shoulderW / 2 - extra + hu * 0.02, m.elbowY - hu * 0.15);
  ctx.lineTo(cx - m.shoulderW / 2 - extra - hu * 0.05, m.elbowY - hu * 0.2);
  ctx.stroke();

  ctx.restore();
}

// top_offsh: Off-shoulder top
function dti2DDrawTopOffShoulder(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var hemY = m.waistY + hu * 0.1;
  var necklineY = m.shoulderY + hu * 0.12;
  ctx.save();

  function offshPath() {
    ctx.beginPath();
    ctx.moveTo(cx - m.shoulderW / 2 - pad, necklineY);
    ctx.quadraticCurveTo(cx - m.bustW / 3, m.bustY - hu * 0.15, cx, m.bustY - hu * 0.12);
    ctx.quadraticCurveTo(cx + m.bustW / 3, m.bustY - hu * 0.15, cx + m.shoulderW / 2 + pad, necklineY);
    ctx.quadraticCurveTo(cx + m.bustW / 2 + pad, m.bustY, cx + m.bustW / 2 + pad, m.bustY + hu * 0.05);
    ctx.quadraticCurveTo(cx + m.waistW / 2 + pad + hu * 0.04, m.waistY, cx + m.waistW / 2 + pad + hu * 0.06, hemY);
    ctx.quadraticCurveTo(cx, hemY + hu * 0.03, cx - m.waistW / 2 - pad - hu * 0.06, hemY);
    ctx.quadraticCurveTo(cx - m.waistW / 2 - pad - hu * 0.04, m.waistY, cx - m.bustW / 2 - pad, m.bustY + hu * 0.05);
    ctx.quadraticCurveTo(cx - m.bustW / 2 - pad, m.bustY, cx - m.shoulderW / 2 - pad, necklineY);
    ctx.closePath();
  }

  // Base fill
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.shoulderW / 2, necklineY, cx + m.shoulderW / 2, hemY);
  offshPath();
  ctx.fill();

  // Side shadow overlay
  ctx.save();
  offshPath();
  ctx.clip();
  var ss = ctx.createLinearGradient(cx - m.bustW / 2 - pad, 0, cx - m.bustW / 4, 0);
  ss.addColorStop(0, dti2DAlpha(dti2DShade(color, -45), 0.18));
  ss.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ss;
  ctx.fillRect(cx - m.shoulderW / 2 - pad, necklineY, m.shoulderW / 2, hemY - necklineY);
  var ss2 = ctx.createLinearGradient(cx + m.bustW / 2 + pad, 0, cx + m.bustW / 4, 0);
  ss2.addColorStop(0, dti2DAlpha(dti2DShade(color, -45), 0.18));
  ss2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ss2;
  ctx.fillRect(cx, necklineY, m.shoulderW / 2 + pad, hemY - necklineY);
  ctx.restore();

  // Wrinkle folds
  dti2DFabricFolds(ctx, color, [
    [cx - m.bustW / 4, m.bustY - hu * 0.05, cx - m.waistW / 3, m.bustY + hu * 0.08, cx - m.waistW / 3, hemY - hu * 0.02],
    [cx + m.bustW / 4, m.bustY - hu * 0.05, cx + m.waistW / 3, m.bustY + hu * 0.08, cx + m.waistW / 3, hemY - hu * 0.02],
    [cx, m.bustY - hu * 0.08, cx, m.bustY + hu * 0.03, cx - hu * 0.01, hemY - hu * 0.03]
  ], 0.9);

  // Ruffle detail on neckline (multiple layers for realism)
  var ruffleColor = dti2DShade(color, -25);
  ctx.strokeStyle = dti2DAlpha(ruffleColor, 0.28);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - m.shoulderW / 2, necklineY + hu * 0.01);
  ctx.quadraticCurveTo(cx - m.bustW / 3, m.bustY - hu * 0.13, cx, m.bustY - hu * 0.1);
  ctx.quadraticCurveTo(cx + m.bustW / 3, m.bustY - hu * 0.13, cx + m.shoulderW / 2, necklineY + hu * 0.01);
  ctx.stroke();
  // Ruffle scallops
  ctx.strokeStyle = dti2DAlpha(ruffleColor, 0.2);
  ctx.lineWidth = 0.8;
  var ruffleSegs = 8;
  var rStart = cx - m.shoulderW / 2;
  var rEnd = cx + m.shoulderW / 2;
  for (var ri = 0; ri < ruffleSegs; ri++) {
    var rx1 = rStart + (rEnd - rStart) * (ri / ruffleSegs);
    var rx2 = rStart + (rEnd - rStart) * ((ri + 1) / ruffleSegs);
    var ry = necklineY + hu * 0.005 + Math.sin(ri * 1.2) * hu * 0.008;
    ctx.beginPath();
    ctx.moveTo(rx1, ry);
    ctx.quadraticCurveTo((rx1 + rx2) / 2, ry + hu * 0.02, rx2, ry);
    ctx.stroke();
  }

  // Hem
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.25);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad - hu * 0.06, hemY);
  ctx.quadraticCurveTo(cx, hemY + hu * 0.03, cx + m.waistW / 2 + pad + hu * 0.06, hemY);
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

  function skirtPath() {
    ctx.beginPath();
    ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
    ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
    ctx.quadraticCurveTo(cx + m.hipW / 2 + pad + hu * 0.05, m.hipY, cx + m.hipW / 2 + hu * 0.15, hemY);
    ctx.quadraticCurveTo(cx, hemY + hu * 0.03, cx - m.hipW / 2 - hu * 0.15, hemY);
    ctx.quadraticCurveTo(cx - m.hipW / 2 - pad - hu * 0.05, m.hipY, cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
    ctx.closePath();
  }

  // Base fill
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.hipW / 2, m.waistY, cx + m.hipW / 2, hemY);
  skirtPath();
  ctx.fill();

  // Side shadow overlay
  ctx.save();
  skirtPath();
  ctx.clip();
  var ss = ctx.createLinearGradient(cx - m.hipW / 2 - hu * 0.15, 0, cx - m.hipW / 4, 0);
  ss.addColorStop(0, dti2DAlpha(dti2DShade(color, -45), 0.2));
  ss.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ss;
  ctx.fillRect(cx - m.hipW / 2 - hu * 0.2, m.waistY, m.hipW / 2, hemY - m.waistY + hu * 0.05);
  var ss2 = ctx.createLinearGradient(cx + m.hipW / 2 + hu * 0.15, 0, cx + m.hipW / 4, 0);
  ss2.addColorStop(0, dti2DAlpha(dti2DShade(color, -45), 0.2));
  ss2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ss2;
  ctx.fillRect(cx, m.waistY, m.hipW / 2 + hu * 0.2, hemY - m.waistY + hu * 0.05);
  ctx.restore();

  // Visible drape folds (radiating from waist)
  dti2DFabricFolds(ctx, color, [
    [cx - hu * 0.16, m.hipY - hu * 0.05, cx - hu * 0.2, (m.hipY + hemY) / 2, cx - hu * 0.24, hemY],
    [cx - hu * 0.06, m.hipY - hu * 0.03, cx - hu * 0.08, (m.hipY + hemY) / 2, cx - hu * 0.1, hemY],
    [cx + hu * 0.06, m.hipY - hu * 0.03, cx + hu * 0.08, (m.hipY + hemY) / 2, cx + hu * 0.1, hemY],
    [cx + hu * 0.16, m.hipY - hu * 0.05, cx + hu * 0.2, (m.hipY + hemY) / 2, cx + hu * 0.24, hemY],
    // Between-leg shadow
    [cx - hu * 0.02, m.crotchY - hu * 0.05, cx, m.kneeY, cx + hu * 0.02, hemY - hu * 0.05]
  ], 1.0);

  // Highlights between folds
  dti2DFabricHighlights(ctx, color, [
    [cx - hu * 0.11, m.hipY, cx - hu * 0.13, (m.hipY + hemY) / 2, cx - hu * 0.16, hemY - hu * 0.05],
    [cx + hu * 0.11, m.hipY, cx + hu * 0.13, (m.hipY + hemY) / 2, cx + hu * 0.16, hemY - hu * 0.05],
    [cx, m.hipY, cx, (m.hipY + hemY) / 2]
  ], 1.0);

  // Waistband (thicker, more defined)
  ctx.fillStyle = dti2DShade(color, -15);
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY + hu * 0.03);
  ctx.quadraticCurveTo(cx, m.waistY + hu * 0.045, cx - m.waistW / 2 - pad, m.waistY + hu * 0.03);
  ctx.closePath();
  ctx.fill();
  // Waistband seam lines
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -45), 0.22);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY + hu * 0.03);
  ctx.quadraticCurveTo(cx, m.waistY + hu * 0.045, cx + m.waistW / 2 + pad, m.waistY + hu * 0.03);
  ctx.stroke();

  // Hem with thickness
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.25);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - m.hipW / 2 - hu * 0.15, hemY);
  ctx.quadraticCurveTo(cx, hemY + hu * 0.03, cx + m.hipW / 2 + hu * 0.15, hemY);
  ctx.stroke();

  ctx.restore();
}

// bottom_mini: Mini skirt (waist to mid-thigh)
function dti2DDrawBottomMini(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var hemY = m.crotchY + hu * 0.1;
  ctx.save();

  function miniPath() {
    ctx.beginPath();
    ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
    ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
    ctx.quadraticCurveTo(cx + m.hipW / 2 + pad, m.hipY, cx + m.hipW / 2 + hu * 0.06, hemY);
    ctx.quadraticCurveTo(cx, hemY + hu * 0.02, cx - m.hipW / 2 - hu * 0.06, hemY);
    ctx.quadraticCurveTo(cx - m.hipW / 2 - pad, m.hipY, cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
    ctx.closePath();
  }

  // Base fill
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.hipW / 2, m.waistY, cx + m.hipW / 2, hemY);
  miniPath();
  ctx.fill();

  // Side shadows
  ctx.save();
  miniPath();
  ctx.clip();
  var ss = ctx.createLinearGradient(cx - m.hipW / 2 - hu * 0.06, 0, cx - m.hipW / 3, 0);
  ss.addColorStop(0, dti2DAlpha(dti2DShade(color, -45), 0.2));
  ss.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ss;
  ctx.fillRect(cx - m.hipW / 2 - hu * 0.1, m.waistY, m.hipW / 2, hemY - m.waistY + hu * 0.05);
  var ss2 = ctx.createLinearGradient(cx + m.hipW / 2 + hu * 0.06, 0, cx + m.hipW / 3, 0);
  ss2.addColorStop(0, dti2DAlpha(dti2DShade(color, -45), 0.2));
  ss2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ss2;
  ctx.fillRect(cx, m.waistY, m.hipW / 2 + hu * 0.1, hemY - m.waistY + hu * 0.05);
  ctx.restore();

  // Pleat fold lines (more visible)
  dti2DFabricFolds(ctx, color, [
    [cx - hu * 0.1, m.hipY - hu * 0.02, cx - hu * 0.12, hemY],
    [cx, m.hipY - hu * 0.02, cx, hemY],
    [cx + hu * 0.1, m.hipY - hu * 0.02, cx + hu * 0.12, hemY],
    [cx - hu * 0.05, m.hipY, cx - hu * 0.06, hemY - hu * 0.02],
    [cx + hu * 0.05, m.hipY, cx + hu * 0.06, hemY - hu * 0.02]
  ], 0.8);

  // Waistband
  ctx.fillStyle = dti2DShade(color, -12);
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY + hu * 0.025);
  ctx.quadraticCurveTo(cx, m.waistY + hu * 0.035, cx - m.waistW / 2 - pad, m.waistY + hu * 0.025);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -45), 0.22);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY + hu * 0.025);
  ctx.quadraticCurveTo(cx, m.waistY + hu * 0.035, cx + m.waistW / 2 + pad, m.waistY + hu * 0.025);
  ctx.stroke();

  // Hem
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.25);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.hipW / 2 - hu * 0.06, hemY);
  ctx.quadraticCurveTo(cx, hemY + hu * 0.02, cx + m.hipW / 2 + hu * 0.06, hemY);
  ctx.stroke();

  ctx.restore();
}

// bottom_pants: Straight/slim pants (waist to ankle)
function dti2DDrawBottomPants(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var pad = hu * 0.02;
  var legSpread = hu * 0.12;
  ctx.save();

  function pantsPath() {
    ctx.beginPath();
    ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
    ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
    ctx.quadraticCurveTo(cx + m.hipW / 2 + pad, m.hipY, cx + legSpread + m.hu * 0.2, m.crotchY);
    ctx.quadraticCurveTo(cx + legSpread + m.kneeW + pad, m.kneeY, cx + legSpread + m.ankleW + pad, m.ankleY);
    ctx.lineTo(cx + legSpread - m.ankleW - pad, m.ankleY);
    ctx.quadraticCurveTo(cx + legSpread - m.kneeW, m.kneeY, cx + legSpread - hu * 0.05, m.crotchY);
    ctx.lineTo(cx - legSpread + hu * 0.05, m.crotchY);
    ctx.quadraticCurveTo(cx - legSpread + m.kneeW, m.kneeY, cx - legSpread + m.ankleW + pad, m.ankleY);
    ctx.lineTo(cx - legSpread - m.ankleW - pad, m.ankleY);
    ctx.quadraticCurveTo(cx - legSpread - m.kneeW - pad, m.kneeY, cx - legSpread - m.hu * 0.2, m.crotchY);
    ctx.quadraticCurveTo(cx - m.hipW / 2 - pad, m.hipY, cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
    ctx.closePath();
  }

  // Base fill
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.hipW / 2, m.waistY, cx + m.hipW / 2, m.ankleY);
  pantsPath();
  ctx.fill();

  // Side shadow + inner leg shadow
  ctx.save();
  pantsPath();
  ctx.clip();
  // Outer side shadows
  for (var side = -1; side <= 1; side += 2) {
    var outerX = cx + side * (legSpread + m.kneeW + pad);
    var innerX = cx + side * legSpread;
    var legShadow = ctx.createLinearGradient(outerX, 0, innerX, 0);
    legShadow.addColorStop(0, dti2DAlpha(dti2DShade(color, -45), 0.18));
    legShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = legShadow;
    ctx.fillRect(Math.min(outerX, innerX), m.crotchY, Math.abs(outerX - innerX) + hu * 0.05, m.ankleY - m.crotchY);
  }
  // Inner leg shadow (between legs)
  var innerShadow = ctx.createLinearGradient(cx - legSpread, 0, cx + legSpread, 0);
  innerShadow.addColorStop(0, 'rgba(0,0,0,0)');
  innerShadow.addColorStop(0.35, dti2DAlpha(dti2DShade(color, -40), 0.15));
  innerShadow.addColorStop(0.5, dti2DAlpha(dti2DShade(color, -50), 0.2));
  innerShadow.addColorStop(0.65, dti2DAlpha(dti2DShade(color, -40), 0.15));
  innerShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = innerShadow;
  ctx.fillRect(cx - legSpread - hu * 0.05, m.crotchY - hu * 0.05, legSpread * 2 + hu * 0.1, m.ankleY - m.crotchY + hu * 0.05);
  ctx.restore();

  // Center crease lines (pressed pants)
  dti2DFabricFolds(ctx, color, [
    // Front creases (each leg)
    [cx - legSpread, m.crotchY + hu * 0.08, cx - legSpread, m.kneeY, cx - legSpread, m.ankleY - hu * 0.05],
    [cx + legSpread, m.crotchY + hu * 0.08, cx + legSpread, m.kneeY, cx + legSpread, m.ankleY - hu * 0.05],
    // Knee wrinkles
    [cx - legSpread - m.kneeW * 0.5, m.kneeY - hu * 0.03, cx - legSpread, m.kneeY + hu * 0.01, cx - legSpread + m.kneeW * 0.5, m.kneeY - hu * 0.03],
    [cx + legSpread - m.kneeW * 0.5, m.kneeY - hu * 0.03, cx + legSpread, m.kneeY + hu * 0.01, cx + legSpread + m.kneeW * 0.5, m.kneeY - hu * 0.03],
    [cx - legSpread - m.kneeW * 0.4, m.kneeY + hu * 0.02, cx - legSpread, m.kneeY + hu * 0.04, cx - legSpread + m.kneeW * 0.4, m.kneeY + hu * 0.02],
    [cx + legSpread - m.kneeW * 0.4, m.kneeY + hu * 0.02, cx + legSpread, m.kneeY + hu * 0.04, cx + legSpread + m.kneeW * 0.4, m.kneeY + hu * 0.02],
    // Hip area diagonal tension lines
    [cx - m.hipW / 3, m.hipY, cx - legSpread - hu * 0.05, m.crotchY - hu * 0.08],
    [cx + m.hipW / 3, m.hipY, cx + legSpread + hu * 0.05, m.crotchY - hu * 0.08]
  ], 0.9);

  // Highlights on front of legs
  dti2DFabricHighlights(ctx, color, [
    [cx - legSpread + hu * 0.02, m.crotchY + hu * 0.15, cx - legSpread + hu * 0.02, m.kneeY - hu * 0.05],
    [cx + legSpread - hu * 0.02, m.crotchY + hu * 0.15, cx + legSpread - hu * 0.02, m.kneeY - hu * 0.05]
  ], 1.0);

  // Waistband
  ctx.fillStyle = dti2DShade(color, -12);
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY + hu * 0.03);
  ctx.quadraticCurveTo(cx, m.waistY + hu * 0.045, cx - m.waistW / 2 - pad, m.waistY + hu * 0.03);
  ctx.closePath();
  ctx.fill();
  // Waistband seams
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -45), 0.22);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY + hu * 0.03);
  ctx.quadraticCurveTo(cx, m.waistY + hu * 0.045, cx + m.waistW / 2 + pad, m.waistY + hu * 0.03);
  ctx.stroke();

  // Button/fly detail
  ctx.fillStyle = dti2DAlpha(dti2DShade(color, -30), 0.2);
  ctx.beginPath();
  ctx.arc(cx, m.waistY + hu * 0.01, hu * 0.012, 0, Math.PI * 2);
  ctx.fill();
  // Fly seam
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.18);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx, m.waistY + hu * 0.03);
  ctx.lineTo(cx, m.crotchY - hu * 0.05);
  ctx.stroke();

  // Ankle hems
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.25);
  ctx.lineWidth = 1.8;
  for (var s = -1; s <= 1; s += 2) {
    ctx.beginPath();
    ctx.moveTo(cx + s * legSpread - m.ankleW - pad, m.ankleY);
    ctx.lineTo(cx + s * legSpread + m.ankleW + pad, m.ankleY);
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

  function widePath() {
    ctx.beginPath();
    ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
    ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
    ctx.quadraticCurveTo(cx + m.hipW / 2 + pad, m.hipY, cx + legSpread + m.hu * 0.2, m.crotchY);
    ctx.quadraticCurveTo(cx + legSpread + m.kneeW + pad + hu * 0.02, m.kneeY, cx + legSpread + m.ankleW + flare, m.ankleY);
    ctx.lineTo(cx + legSpread - m.ankleW - flare * 0.3, m.ankleY);
    ctx.quadraticCurveTo(cx + legSpread - m.kneeW, m.kneeY, cx + legSpread - hu * 0.05, m.crotchY);
    ctx.lineTo(cx - legSpread + hu * 0.05, m.crotchY);
    ctx.quadraticCurveTo(cx - legSpread + m.kneeW, m.kneeY, cx - legSpread + m.ankleW + flare * 0.3, m.ankleY);
    ctx.lineTo(cx - legSpread - m.ankleW - flare, m.ankleY);
    ctx.quadraticCurveTo(cx - legSpread - m.kneeW - pad - hu * 0.02, m.kneeY, cx - legSpread - m.hu * 0.2, m.crotchY);
    ctx.quadraticCurveTo(cx - m.hipW / 2 - pad, m.hipY, cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
    ctx.closePath();
  }

  // Base fill
  ctx.fillStyle = dti2DFabricFill(ctx, color, style, cx - m.hipW / 2, m.waistY, cx + m.hipW / 2, m.ankleY);
  widePath();
  ctx.fill();

  // Shadow overlay
  ctx.save();
  widePath();
  ctx.clip();
  // Inner leg shadow
  var innerShadow = ctx.createLinearGradient(cx - legSpread, 0, cx + legSpread, 0);
  innerShadow.addColorStop(0, 'rgba(0,0,0,0)');
  innerShadow.addColorStop(0.35, dti2DAlpha(dti2DShade(color, -40), 0.15));
  innerShadow.addColorStop(0.5, dti2DAlpha(dti2DShade(color, -50), 0.2));
  innerShadow.addColorStop(0.65, dti2DAlpha(dti2DShade(color, -40), 0.15));
  innerShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = innerShadow;
  ctx.fillRect(cx - legSpread - hu * 0.1, m.crotchY - hu * 0.05, legSpread * 2 + hu * 0.2, m.ankleY - m.crotchY + hu * 0.1);
  ctx.restore();

  // Heavy drape folds (wide-leg = lots of fabric movement)
  dti2DFabricFolds(ctx, color, [
    // Outer drape lines flaring from knee
    [cx - legSpread - hu * 0.03, m.kneeY, cx - legSpread - hu * 0.06, (m.kneeY + m.ankleY) / 2, cx - legSpread - flare * 0.5, m.ankleY],
    [cx + legSpread + hu * 0.03, m.kneeY, cx + legSpread + hu * 0.06, (m.kneeY + m.ankleY) / 2, cx + legSpread + flare * 0.5, m.ankleY],
    // Inner drape
    [cx - legSpread + hu * 0.03, m.kneeY + hu * 0.05, cx - legSpread + hu * 0.05, (m.kneeY + m.ankleY) / 2, cx - legSpread + flare * 0.2, m.ankleY],
    [cx + legSpread - hu * 0.03, m.kneeY + hu * 0.05, cx + legSpread - hu * 0.05, (m.kneeY + m.ankleY) / 2, cx + legSpread - flare * 0.2, m.ankleY],
    // Center front creases
    [cx - legSpread, m.crotchY + hu * 0.1, cx - legSpread, m.kneeY],
    [cx + legSpread, m.crotchY + hu * 0.1, cx + legSpread, m.kneeY],
    // Hip tension lines
    [cx - m.hipW / 3, m.hipY, cx - legSpread - hu * 0.06, m.crotchY - hu * 0.06],
    [cx + m.hipW / 3, m.hipY, cx + legSpread + hu * 0.06, m.crotchY - hu * 0.06],
    // Knee area wrinkles
    [cx - legSpread - m.kneeW * 0.6, m.kneeY, cx - legSpread, m.kneeY + hu * 0.02, cx - legSpread + m.kneeW * 0.6, m.kneeY],
    [cx + legSpread - m.kneeW * 0.6, m.kneeY, cx + legSpread, m.kneeY + hu * 0.02, cx + legSpread + m.kneeW * 0.6, m.kneeY]
  ], 1.0);

  // Highlights
  dti2DFabricHighlights(ctx, color, [
    [cx - legSpread, m.crotchY + hu * 0.15, cx - legSpread - hu * 0.01, m.kneeY - hu * 0.08],
    [cx + legSpread, m.crotchY + hu * 0.15, cx + legSpread + hu * 0.01, m.kneeY - hu * 0.08]
  ], 1.0);

  // Waistband
  ctx.fillStyle = dti2DShade(color, -12);
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY - hu * 0.02);
  ctx.lineTo(cx + m.waistW / 2 + pad, m.waistY + hu * 0.03);
  ctx.quadraticCurveTo(cx, m.waistY + hu * 0.045, cx - m.waistW / 2 - pad, m.waistY + hu * 0.03);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -45), 0.22);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - pad, m.waistY + hu * 0.03);
  ctx.quadraticCurveTo(cx, m.waistY + hu * 0.045, cx + m.waistW / 2 + pad, m.waistY + hu * 0.03);
  ctx.stroke();

  // Button
  ctx.fillStyle = dti2DAlpha(dti2DShade(color, -30), 0.2);
  ctx.beginPath();
  ctx.arc(cx, m.waistY + hu * 0.01, hu * 0.012, 0, Math.PI * 2);
  ctx.fill();

  // Ankle hems
  ctx.strokeStyle = dti2DAlpha(dti2DShade(color, -40), 0.25);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - legSpread - m.ankleW - flare, m.ankleY);
  ctx.lineTo(cx - legSpread + m.ankleW + flare * 0.3, m.ankleY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + legSpread - m.ankleW - flare * 0.3, m.ankleY);
  ctx.lineTo(cx + legSpread + m.ankleW + flare, m.ankleY);
  ctx.stroke();

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
  var dk = dti2DShade(color, -40);
  var hi = dti2DShade(color, 30);
  var vdk = dti2DShade(color, -60);
  var bootTop = m.kneeY + hu * 0.15;
  ctx.save();
  for (var side = -1; side <= 1; side += 2) {
    var fx = cx + side * legSpread;
    var bLeft = fx - m.ankleW - hu * 0.06;
    var bRight = fx + m.ankleW + hu * 0.06;
    var toeExtend = side * hu * 0.03;

    // Boot shaft with richer gradient
    var bootGrad = ctx.createLinearGradient(bLeft, 0, bRight, 0);
    bootGrad.addColorStop(0, dk);
    bootGrad.addColorStop(0.2, dti2DShade(color, -10));
    bootGrad.addColorStop(0.35, hi);
    bootGrad.addColorStop(0.5, color);
    bootGrad.addColorStop(0.7, dti2DShade(color, -10));
    bootGrad.addColorStop(1, dk);
    ctx.fillStyle = bootGrad;
    ctx.beginPath();
    ctx.moveTo(bLeft, bootTop);
    // Slight calf shape on shaft
    ctx.quadraticCurveTo(bLeft - hu * 0.01, (bootTop + m.ankleY) / 2, bLeft, m.ankleY);
    ctx.lineTo(bLeft, m.footY - hu * 0.01);
    // Toe with rounded shape
    ctx.quadraticCurveTo(bLeft, m.footY + hu * 0.03, fx - hu * 0.01 + toeExtend, m.footY + hu * 0.035);
    ctx.lineTo(fx + m.footW * 0.5 + toeExtend, m.footY + hu * 0.03);
    ctx.quadraticCurveTo(bRight + hu * 0.01, m.footY + hu * 0.01, bRight, m.footY - hu * 0.02);
    // Right side up
    ctx.lineTo(bRight, m.ankleY);
    ctx.quadraticCurveTo(bRight + hu * 0.01, (bootTop + m.ankleY) / 2, bRight, bootTop);
    ctx.closePath();
    ctx.fill();

    // Ankle crease wrinkles (multiple for realism)
    var ankleY = m.ankleY;
    ctx.strokeStyle = dti2DAlpha(dk, 0.25);
    ctx.lineWidth = hu * 0.008;
    for (var wi = 0; wi < 3; wi++) {
      var wy = ankleY - hu * 0.025 + wi * hu * 0.018;
      ctx.beginPath();
      ctx.moveTo(bLeft + hu * 0.015, wy);
      ctx.quadraticCurveTo(fx, wy + hu * 0.012, bRight - hu * 0.015, wy);
      ctx.stroke();
    }

    // Boot top rim (folded leather effect)
    ctx.fillStyle = dti2DShade(color, -15);
    ctx.beginPath();
    ctx.moveTo(bLeft - hu * 0.005, bootTop);
    ctx.lineTo(bRight + hu * 0.005, bootTop);
    ctx.lineTo(bRight + hu * 0.005, bootTop + hu * 0.025);
    ctx.quadraticCurveTo(fx, bootTop + hu * 0.035, bLeft - hu * 0.005, bootTop + hu * 0.025);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = dti2DAlpha(vdk, 0.2);
    ctx.lineWidth = hu * 0.006;
    ctx.beginPath();
    ctx.moveTo(bLeft - hu * 0.005, bootTop);
    ctx.lineTo(bRight + hu * 0.005, bootTop);
    ctx.stroke();

    // Sole (chunky, visible)
    ctx.fillStyle = vdk;
    ctx.beginPath();
    ctx.moveTo(bLeft - hu * 0.005, m.footY + hu * 0.025);
    ctx.lineTo(fx + m.footW * 0.52 + toeExtend, m.footY + hu * 0.03);
    ctx.lineTo(fx + m.footW * 0.52 + toeExtend, m.footY + hu * 0.06);
    ctx.quadraticCurveTo(fx + toeExtend, m.footY + hu * 0.065, bLeft - hu * 0.005, m.footY + hu * 0.055);
    ctx.closePath();
    ctx.fill();
    // Sole edge highlight
    ctx.strokeStyle = dti2DAlpha(dk, 0.3);
    ctx.lineWidth = hu * 0.005;
    ctx.beginPath();
    ctx.moveTo(bLeft, m.footY + hu * 0.025);
    ctx.lineTo(fx + m.footW * 0.5 + toeExtend, m.footY + hu * 0.03);
    ctx.stroke();

    // Heel (slight block heel)
    ctx.fillStyle = dti2DShade(vdk, -5);
    ctx.beginPath();
    ctx.moveTo(bLeft, m.footY + hu * 0.02);
    ctx.lineTo(bLeft - hu * 0.008, m.footY + hu * 0.06);
    ctx.lineTo(bLeft + hu * 0.04, m.footY + hu * 0.06);
    ctx.lineTo(bLeft + hu * 0.03, m.footY + hu * 0.02);
    ctx.closePath();
    ctx.fill();

    // Vertical highlight streak (leather sheen)
    ctx.strokeStyle = dti2DAlpha(hi, 0.12);
    ctx.lineWidth = hu * 0.02;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW * 0.2, bootTop + hu * 0.04);
    ctx.lineTo(fx - m.ankleW * 0.2, m.ankleY - hu * 0.03);
    ctx.stroke();

    // Side seam stitching
    ctx.strokeStyle = dti2DAlpha(dk, 0.12);
    ctx.lineWidth = hu * 0.004;
    ctx.setLineDash([hu * 0.008, hu * 0.006]);
    ctx.beginPath();
    ctx.moveTo(bRight - hu * 0.015, bootTop + hu * 0.03);
    ctx.lineTo(bRight - hu * 0.015, m.footY - hu * 0.01);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pull tab at top
    ctx.strokeStyle = dti2DAlpha(dk, 0.2);
    ctx.lineWidth = hu * 0.008;
    ctx.beginPath();
    ctx.moveTo(fx - hu * 0.015, bootTop + hu * 0.005);
    ctx.lineTo(fx - hu * 0.015, bootTop - hu * 0.01);
    ctx.quadraticCurveTo(fx, bootTop - hu * 0.02, fx + hu * 0.015, bootTop - hu * 0.01);
    ctx.lineTo(fx + hu * 0.015, bootTop + hu * 0.005);
    ctx.stroke();
  }
  ctx.restore();
}

function dti2DDrawShoesHeels(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var legSpread = hu * 0.12;
  var dk = dti2DShade(color, -35);
  var hi = dti2DShade(color, 25);
  var vdk = dti2DShade(color, -55);
  ctx.save();
  for (var side = -1; side <= 1; side += 2) {
    var fx = cx + side * legSpread;
    var toeDir = side;

    // Shoe body gradient (pointed toe pump)
    var shoeGrad = ctx.createLinearGradient(fx - m.ankleW, 0, fx + m.ankleW, 0);
    shoeGrad.addColorStop(0, dk);
    shoeGrad.addColorStop(0.3, color);
    shoeGrad.addColorStop(0.5, hi);
    shoeGrad.addColorStop(0.7, color);
    shoeGrad.addColorStop(1, dk);
    ctx.fillStyle = shoeGrad;
    ctx.beginPath();
    // Back of shoe at ankle
    ctx.moveTo(fx - m.ankleW * 0.9, m.ankleY + hu * 0.01);
    // Sole curve to pointed toe
    ctx.quadraticCurveTo(fx - m.footW * 0.3, m.footY + hu * 0.01, fx + toeDir * m.footW * 0.55, m.footY - hu * 0.015);
    // Top of shoe (vamp)
    ctx.quadraticCurveTo(fx + toeDir * m.footW * 0.2, m.footY - hu * 0.04, fx + m.ankleW * 0.3, m.ankleY + hu * 0.02);
    // Back top
    ctx.lineTo(fx - m.ankleW * 0.9, m.ankleY + hu * 0.01);
    ctx.closePath();
    ctx.fill();

    // Inner opening
    ctx.fillStyle = dti2DAlpha(vdk, 0.15);
    ctx.beginPath();
    ctx.ellipse(fx - m.ankleW * 0.1, m.ankleY + hu * 0.01, m.ankleW * 0.5, hu * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stiletto heel
    var heelX = fx - m.ankleW * 0.6;
    ctx.fillStyle = dk;
    ctx.beginPath();
    ctx.moveTo(heelX - hu * 0.008, m.ankleY + hu * 0.015);
    ctx.lineTo(heelX - hu * 0.015, m.footY + hu * 0.06);
    ctx.lineTo(heelX + hu * 0.01, m.footY + hu * 0.06);
    ctx.lineTo(heelX + hu * 0.012, m.ankleY + hu * 0.02);
    ctx.closePath();
    ctx.fill();
    // Heel tip
    ctx.fillStyle = vdk;
    ctx.beginPath();
    dti2DRoundRect(ctx, heelX - hu * 0.018, m.footY + hu * 0.055, hu * 0.032, hu * 0.01, hu * 0.003);
    ctx.fill();
    // Heel highlight
    ctx.strokeStyle = dti2DAlpha(hi, 0.15);
    ctx.lineWidth = hu * 0.005;
    ctx.beginPath();
    ctx.moveTo(heelX - hu * 0.005, m.ankleY + hu * 0.025);
    ctx.lineTo(heelX - hu * 0.01, m.footY + hu * 0.045);
    ctx.stroke();

    // Sole line
    ctx.strokeStyle = dti2DAlpha(vdk, 0.2);
    ctx.lineWidth = hu * 0.006;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW * 0.8, m.footY + hu * 0.015);
    ctx.quadraticCurveTo(fx, m.footY + hu * 0.02, fx + toeDir * m.footW * 0.55, m.footY - hu * 0.01);
    ctx.stroke();

    // Ankle strap
    ctx.strokeStyle = color;
    ctx.lineWidth = hu * 0.018;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW * 0.5, m.ankleY - hu * 0.01);
    ctx.quadraticCurveTo(fx, m.ankleY - hu * 0.03, fx + m.ankleW * 0.5, m.ankleY - hu * 0.01);
    ctx.stroke();
    // Strap buckle
    ctx.fillStyle = dti2DShade(hi, 10);
    ctx.beginPath();
    ctx.arc(fx + m.ankleW * 0.5, m.ankleY - hu * 0.01, hu * 0.01, 0, Math.PI * 2);
    ctx.fill();

    // Toe highlight
    ctx.fillStyle = dti2DAlpha(hi, 0.08);
    ctx.beginPath();
    ctx.ellipse(fx + toeDir * m.footW * 0.25, m.footY - hu * 0.01, m.footW * 0.15, hu * 0.012, toeDir * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function dti2DDrawShoesSneakers(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var legSpread = hu * 0.12;
  var dk = dti2DShade(color, -30);
  var hi = dti2DShade(color, 30);
  var vdk = dti2DShade(color, -50);
  ctx.save();
  for (var side = -1; side <= 1; side += 2) {
    var fx = cx + side * legSpread;
    var toeDir = side;

    // Chunky sole (white rubber)
    var soleGrad = ctx.createLinearGradient(0, m.footY + hu * 0.02, 0, m.footY + hu * 0.07);
    soleGrad.addColorStop(0, '#f8f8f8');
    soleGrad.addColorStop(0.5, '#e8e8e8');
    soleGrad.addColorStop(1, '#d0d0d0');
    ctx.fillStyle = soleGrad;
    ctx.beginPath();
    ctx.moveTo(fx - m.footW * 0.55, m.footY + hu * 0.02);
    ctx.lineTo(fx + toeDir * m.footW * 0.6, m.footY + hu * 0.02);
    ctx.quadraticCurveTo(fx + toeDir * m.footW * 0.65, m.footY + hu * 0.04, fx + toeDir * m.footW * 0.6, m.footY + hu * 0.065);
    ctx.quadraticCurveTo(fx, m.footY + hu * 0.075, fx - m.footW * 0.55, m.footY + hu * 0.065);
    ctx.closePath();
    ctx.fill();
    // Sole edge line
    ctx.strokeStyle = dti2DAlpha('#999999', 0.2);
    ctx.lineWidth = hu * 0.005;
    ctx.beginPath();
    ctx.moveTo(fx - m.footW * 0.55, m.footY + hu * 0.04);
    ctx.lineTo(fx + toeDir * m.footW * 0.6, m.footY + hu * 0.035);
    ctx.stroke();

    // Shoe body with gradient
    var sneakerGrad = ctx.createLinearGradient(fx - m.ankleW, 0, fx + m.ankleW, 0);
    sneakerGrad.addColorStop(0, dk);
    sneakerGrad.addColorStop(0.25, color);
    sneakerGrad.addColorStop(0.5, hi);
    sneakerGrad.addColorStop(0.75, color);
    sneakerGrad.addColorStop(1, dk);
    ctx.fillStyle = sneakerGrad;
    ctx.beginPath();
    ctx.moveTo(fx - m.ankleW - hu * 0.03, m.ankleY);
    // Back collar
    ctx.quadraticCurveTo(fx - m.ankleW - hu * 0.04, m.ankleY + hu * 0.02, fx - m.footW * 0.5, m.footY + hu * 0.02);
    // Sole
    ctx.lineTo(fx + toeDir * m.footW * 0.55, m.footY + hu * 0.02);
    // Toe up
    ctx.quadraticCurveTo(fx + toeDir * m.footW * 0.4, m.footY - hu * 0.02, fx + m.ankleW * 0.5, m.ankleY + hu * 0.02);
    // Tongue top
    ctx.quadraticCurveTo(fx, m.ankleY - hu * 0.02, fx - m.ankleW * 0.3, m.ankleY);
    ctx.closePath();
    ctx.fill();

    // Toe cap (rubber bumper)
    ctx.fillStyle = '#f0f0f0';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(fx + toeDir * m.footW * 0.15, m.footY + hu * 0.02);
    ctx.quadraticCurveTo(fx + toeDir * m.footW * 0.45, m.footY - hu * 0.015, fx + toeDir * m.footW * 0.55, m.footY + hu * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Tongue
    ctx.fillStyle = dti2DShade(color, 10);
    ctx.beginPath();
    ctx.moveTo(fx - hu * 0.025, m.ankleY);
    ctx.quadraticCurveTo(fx, m.ankleY - hu * 0.025, fx + hu * 0.025, m.ankleY);
    ctx.lineTo(fx + hu * 0.02, m.ankleY + hu * 0.03);
    ctx.lineTo(fx - hu * 0.02, m.ankleY + hu * 0.03);
    ctx.closePath();
    ctx.fill();

    // Laces (criss-cross)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = hu * 0.007;
    for (var li = 0; li < 3; li++) {
      var ly = m.ankleY + hu * 0.01 + li * hu * 0.015;
      ctx.beginPath();
      ctx.moveTo(fx - hu * 0.018, ly);
      ctx.lineTo(fx + hu * 0.018, ly + hu * 0.008);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx + hu * 0.018, ly);
      ctx.lineTo(fx - hu * 0.018, ly + hu * 0.008);
      ctx.stroke();
    }

    // Swoosh/stripe detail
    ctx.strokeStyle = dti2DAlpha(dk, 0.15);
    ctx.lineWidth = hu * 0.015;
    ctx.beginPath();
    ctx.moveTo(fx - m.footW * 0.3, m.footY + hu * 0.005);
    ctx.quadraticCurveTo(fx, m.footY - hu * 0.015, fx + m.ankleW * 0.3, m.ankleY + hu * 0.015);
    ctx.stroke();

    // Back tab
    ctx.fillStyle = dti2DShade(color, -20);
    ctx.beginPath();
    dti2DRoundRect(ctx, fx - m.ankleW - hu * 0.04, m.ankleY - hu * 0.01, hu * 0.025, hu * 0.03, hu * 0.005);
    ctx.fill();
  }
  ctx.restore();
}

function dti2DDrawShoesFlats(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var legSpread = hu * 0.12;
  var dk = dti2DShade(color, -30);
  var hi = dti2DShade(color, 20);
  var vdk = dti2DShade(color, -50);
  ctx.save();
  for (var side = -1; side <= 1; side += 2) {
    var fx = cx + side * legSpread;
    var toeDir = side;

    // Shoe body gradient
    var flatGrad = ctx.createLinearGradient(fx - m.ankleW, 0, fx + m.ankleW, 0);
    flatGrad.addColorStop(0, dk);
    flatGrad.addColorStop(0.3, color);
    flatGrad.addColorStop(0.5, hi);
    flatGrad.addColorStop(0.7, color);
    flatGrad.addColorStop(1, dk);
    ctx.fillStyle = flatGrad;
    ctx.beginPath();
    // Back of shoe
    ctx.moveTo(fx - m.ankleW * 0.7, m.footY - hu * 0.025);
    // Back rim curve down
    ctx.quadraticCurveTo(fx - m.ankleW * 0.8, m.footY - hu * 0.005, fx - m.footW * 0.35, m.footY + hu * 0.012);
    // Sole to toe (rounded)
    ctx.quadraticCurveTo(fx + toeDir * m.footW * 0.15, m.footY + hu * 0.018, fx + toeDir * m.footW * 0.48, m.footY + hu * 0.005);
    // Toe top curve
    ctx.quadraticCurveTo(fx + toeDir * m.footW * 0.42, m.footY - hu * 0.025, fx + m.ankleW * 0.3, m.footY - hu * 0.025);
    // Top opening back to start
    ctx.quadraticCurveTo(fx, m.footY - hu * 0.035, fx - m.ankleW * 0.7, m.footY - hu * 0.025);
    ctx.closePath();
    ctx.fill();

    // Inner rim (opening)
    ctx.fillStyle = dti2DAlpha(vdk, 0.1);
    ctx.beginPath();
    ctx.ellipse(fx - m.ankleW * 0.05, m.footY - hu * 0.02, m.ankleW * 0.4, hu * 0.008, toeDir * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Thin sole edge
    ctx.strokeStyle = dti2DAlpha(vdk, 0.2);
    ctx.lineWidth = hu * 0.008;
    ctx.beginPath();
    ctx.moveTo(fx - m.footW * 0.35, m.footY + hu * 0.015);
    ctx.quadraticCurveTo(fx + toeDir * m.footW * 0.15, m.footY + hu * 0.022, fx + toeDir * m.footW * 0.48, m.footY + hu * 0.008);
    ctx.stroke();

    // Bow decoration on top
    var bowX = fx + toeDir * m.footW * 0.1;
    var bowY = m.footY - hu * 0.02;
    ctx.fillStyle = dk;
    // Left loop
    ctx.beginPath();
    ctx.moveTo(bowX, bowY);
    ctx.quadraticCurveTo(bowX - hu * 0.02, bowY - hu * 0.015, bowX - hu * 0.015, bowY);
    ctx.quadraticCurveTo(bowX - hu * 0.01, bowY + hu * 0.008, bowX, bowY);
    ctx.fill();
    // Right loop
    ctx.beginPath();
    ctx.moveTo(bowX, bowY);
    ctx.quadraticCurveTo(bowX + hu * 0.02, bowY - hu * 0.015, bowX + hu * 0.015, bowY);
    ctx.quadraticCurveTo(bowX + hu * 0.01, bowY + hu * 0.008, bowX, bowY);
    ctx.fill();
    // Center knot
    ctx.beginPath();
    ctx.arc(bowX, bowY, hu * 0.005, 0, Math.PI * 2);
    ctx.fill();

    // Toe highlight
    ctx.fillStyle = dti2DAlpha(hi, 0.08);
    ctx.beginPath();
    ctx.ellipse(fx + toeDir * m.footW * 0.25, m.footY - hu * 0.005, m.footW * 0.12, hu * 0.008, toeDir * 0.3, 0, Math.PI * 2);
    ctx.fill();
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
  var dk = dti2DShade(color, -30);
  var hi = dti2DShade(color, 30);
  ctx.save();
  ctx.lineCap = 'round';

  // Outer chain (longer, sits on collarbone)
  ctx.strokeStyle = dti2DAlpha(color, 0.7);
  ctx.lineWidth = hu * 0.015;
  ctx.beginPath();
  ctx.moveTo(cx - m.shoulderW * 0.32, m.shoulderY + hu * 0.02);
  ctx.quadraticCurveTo(cx, m.shoulderY + hu * 0.18, cx + m.shoulderW * 0.32, m.shoulderY + hu * 0.02);
  ctx.stroke();
  // Small links on outer chain
  for (var ci = 0; ci < 5; ci++) {
    var ct = (ci + 1) / 6;
    var clx = cx - m.shoulderW * 0.32 + m.shoulderW * 0.64 * ct;
    var cly = m.shoulderY + hu * 0.02 + Math.sin(ct * Math.PI) * hu * 0.16;
    ctx.fillStyle = dti2DAlpha(hi, 0.3);
    ctx.beginPath();
    ctx.arc(clx, cly, hu * 0.008, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inner chain (choker-like, tighter to neck)
  ctx.strokeStyle = color;
  ctx.lineWidth = hu * 0.022;
  ctx.beginPath();
  ctx.moveTo(cx - m.neckW * 1.8, m.neckBot + hu * 0.01);
  ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.08, cx + m.neckW * 1.8, m.neckBot + hu * 0.01);
  ctx.stroke();
  // Chain highlight
  ctx.strokeStyle = dti2DAlpha(hi, 0.2);
  ctx.lineWidth = hu * 0.01;
  ctx.beginPath();
  ctx.moveTo(cx - m.neckW * 1.6, m.neckBot + hu * 0.01);
  ctx.quadraticCurveTo(cx, m.neckBot + hu * 0.06, cx + m.neckW * 1.6, m.neckBot + hu * 0.01);
  ctx.stroke();

  // Pendant
  var pendY = m.neckBot + hu * 0.12;
  var pendR = hu * 0.06;
  // Pendant shadow
  ctx.fillStyle = dti2DAlpha(dk, 0.15);
  ctx.beginPath();
  ctx.arc(cx + hu * 0.005, pendY + hu * 0.005, pendR * 1.1, 0, Math.PI * 2);
  ctx.fill();
  // Pendant body
  var pendGrad = ctx.createRadialGradient(cx - pendR * 0.3, pendY - pendR * 0.3, 0, cx, pendY, pendR);
  pendGrad.addColorStop(0, hi);
  pendGrad.addColorStop(0.6, color);
  pendGrad.addColorStop(1, dk);
  ctx.fillStyle = pendGrad;
  ctx.beginPath();
  ctx.arc(cx, pendY, pendR, 0, Math.PI * 2);
  ctx.fill();
  // Pendant shine
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(cx - pendR * 0.25, pendY - pendR * 0.25, pendR * 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Pendant outline
  ctx.strokeStyle = dti2DAlpha(dk, 0.3);
  ctx.lineWidth = hu * 0.008;
  ctx.beginPath();
  ctx.arc(cx, pendY, pendR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function dti2DDrawAccBag(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var dk = dti2DShade(color, -30);
  var hi = dti2DShade(color, 20);
  var vdk = dti2DShade(color, -50);
  var bagX = cx + m.armOuterX + hu * 0.22;
  var bagY = m.hipY - hu * 0.05;
  var bagW = hu * 0.35;
  var bagH = hu * 0.42;
  ctx.save();

  // Strap shadow
  ctx.strokeStyle = dti2DAlpha(vdk, 0.15);
  ctx.lineWidth = hu * 0.04;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + m.shoulderW / 2, m.shoulderY + hu * 0.06);
  ctx.quadraticCurveTo(bagX + hu * 0.02, m.waistY, bagX + hu * 0.02, bagY);
  ctx.stroke();
  // Strap
  ctx.strokeStyle = dk;
  ctx.lineWidth = hu * 0.03;
  ctx.beginPath();
  ctx.moveTo(cx + m.shoulderW / 2 - hu * 0.02, m.shoulderY + hu * 0.04);
  ctx.quadraticCurveTo(bagX, m.waistY, bagX, bagY);
  ctx.stroke();
  // Strap highlight
  ctx.strokeStyle = dti2DAlpha(hi, 0.2);
  ctx.lineWidth = hu * 0.012;
  ctx.beginPath();
  ctx.moveTo(cx + m.shoulderW / 2 - hu * 0.03, m.shoulderY + hu * 0.04);
  ctx.quadraticCurveTo(bagX - hu * 0.01, m.waistY, bagX - hu * 0.01, bagY);
  ctx.stroke();

  // Bag shadow
  ctx.fillStyle = dti2DAlpha(vdk, 0.12);
  ctx.beginPath();
  dti2DRoundRect(ctx, bagX - bagW / 2 + hu * 0.01, bagY + hu * 0.015, bagW, bagH, hu * 0.04);
  ctx.fill();

  // Bag body with gradient
  var bagGrad = ctx.createLinearGradient(bagX - bagW / 2, bagY, bagX + bagW / 2, bagY + bagH);
  bagGrad.addColorStop(0, hi);
  bagGrad.addColorStop(0.3, color);
  bagGrad.addColorStop(0.7, color);
  bagGrad.addColorStop(1, dk);
  ctx.fillStyle = bagGrad;
  ctx.beginPath();
  dti2DRoundRect(ctx, bagX - bagW / 2, bagY, bagW, bagH, hu * 0.04);
  ctx.fill();

  // Flap with gradient
  var flapGrad = ctx.createLinearGradient(0, bagY, 0, bagY + bagH * 0.4);
  flapGrad.addColorStop(0, dti2DShade(color, -10));
  flapGrad.addColorStop(1, dk);
  ctx.fillStyle = flapGrad;
  ctx.beginPath();
  dti2DRoundRect(ctx, bagX - bagW / 2, bagY, bagW, bagH * 0.38, [hu * 0.04, hu * 0.04, hu * 0.02, hu * 0.02]);
  ctx.fill();

  // Flap edge line
  ctx.strokeStyle = dti2DAlpha(vdk, 0.2);
  ctx.lineWidth = hu * 0.008;
  ctx.beginPath();
  ctx.moveTo(bagX - bagW / 2 + hu * 0.02, bagY + bagH * 0.38);
  ctx.lineTo(bagX + bagW / 2 - hu * 0.02, bagY + bagH * 0.38);
  ctx.stroke();

  // Clasp/buckle
  var claspY = bagY + bagH * 0.38;
  ctx.fillStyle = dti2DShade(hi, 15);
  ctx.beginPath();
  dti2DRoundRect(ctx, bagX - hu * 0.025, claspY - hu * 0.015, hu * 0.05, hu * 0.03, hu * 0.008);
  ctx.fill();
  ctx.strokeStyle = dti2DAlpha(vdk, 0.15);
  ctx.lineWidth = hu * 0.005;
  ctx.beginPath();
  dti2DRoundRect(ctx, bagX - hu * 0.025, claspY - hu * 0.015, hu * 0.05, hu * 0.03, hu * 0.008);
  ctx.stroke();

  // Stitching along edges
  ctx.strokeStyle = dti2DAlpha(dk, 0.15);
  ctx.lineWidth = hu * 0.004;
  ctx.setLineDash([hu * 0.01, hu * 0.008]);
  ctx.beginPath();
  ctx.moveTo(bagX - bagW / 2 + hu * 0.03, bagY + hu * 0.03);
  ctx.lineTo(bagX - bagW / 2 + hu * 0.03, bagY + bagH - hu * 0.03);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bagX + bagW / 2 - hu * 0.03, bagY + hu * 0.03);
  ctx.lineTo(bagX + bagW / 2 - hu * 0.03, bagY + bagH - hu * 0.03);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

function dti2DDrawAccHat(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var hcy = m.headCY, hry = m.headRY, hrx = m.headRX;
  var dk = dti2DShade(color, -25);
  var hi = dti2DShade(color, 20);
  var vdk = dti2DShade(color, -45);
  ctx.save();

  // Crown (drawn first, behind brim)
  var crownGrad = ctx.createLinearGradient(cx - hrx, hcy - hry * 1.8, cx + hrx, hcy - hry * 0.85);
  crownGrad.addColorStop(0, hi);
  crownGrad.addColorStop(0.4, color);
  crownGrad.addColorStop(0.8, dk);
  ctx.fillStyle = crownGrad;
  ctx.beginPath();
  ctx.moveTo(cx - hrx * 0.9, hcy - hry * 0.85);
  ctx.quadraticCurveTo(cx - hrx * 0.95, hcy - hry * 1.5, cx - hrx * 0.3, hcy - hry * 1.75);
  ctx.quadraticCurveTo(cx, hcy - hry * 1.82, cx + hrx * 0.3, hcy - hry * 1.75);
  ctx.quadraticCurveTo(cx + hrx * 0.95, hcy - hry * 1.5, cx + hrx * 0.9, hcy - hry * 0.85);
  ctx.closePath();
  ctx.fill();
  // Crown crease
  ctx.strokeStyle = dti2DAlpha(dk, 0.15);
  ctx.lineWidth = hu * 0.008;
  ctx.beginPath();
  ctx.moveTo(cx - hrx * 0.5, hcy - hry * 1.1);
  ctx.quadraticCurveTo(cx, hcy - hry * 1.35, cx + hrx * 0.5, hcy - hry * 1.1);
  ctx.stroke();

  // Brim with gradient
  var brimGrad = ctx.createLinearGradient(cx - hrx * 1.6, 0, cx + hrx * 1.6, 0);
  brimGrad.addColorStop(0, dk);
  brimGrad.addColorStop(0.3, color);
  brimGrad.addColorStop(0.5, hi);
  brimGrad.addColorStop(0.7, color);
  brimGrad.addColorStop(1, dk);
  ctx.fillStyle = brimGrad;
  ctx.beginPath();
  ctx.ellipse(cx, hcy - hry * 0.85, hrx * 1.6, hu * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Brim edge shadow (underneath)
  ctx.fillStyle = dti2DAlpha(vdk, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx, hcy - hry * 0.8, hrx * 1.6, hu * 0.04, 0, 0, Math.PI);
  ctx.fill();

  // Brim top shadow (where crown meets brim)
  ctx.fillStyle = dti2DAlpha(dk, 0.08);
  ctx.beginPath();
  ctx.ellipse(cx, hcy - hry * 0.87, hrx * 0.9, hu * 0.025, 0, 0, Math.PI * 2);
  ctx.fill();

  // Crown highlight
  ctx.fillStyle = dti2DAlpha(hi, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx - hrx * 0.15, hcy - hry * 1.45, hrx * 0.35, hu * 0.1, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Hat band/ribbon
  ctx.fillStyle = dti2DShade(dk, -10);
  ctx.beginPath();
  ctx.moveTo(cx - hrx * 0.88, hcy - hry * 0.87);
  ctx.quadraticCurveTo(cx, hcy - hry * 0.95, cx + hrx * 0.88, hcy - hry * 0.87);
  ctx.lineTo(cx + hrx * 0.88, hcy - hry * 0.82);
  ctx.quadraticCurveTo(cx, hcy - hry * 0.9, cx - hrx * 0.88, hcy - hry * 0.82);
  ctx.closePath();
  ctx.fill();

  // Brim edge outline
  ctx.strokeStyle = dti2DAlpha(dk, 0.15);
  ctx.lineWidth = hu * 0.008;
  ctx.beginPath();
  ctx.ellipse(cx, hcy - hry * 0.85, hrx * 1.6, hu * 0.08, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function dti2DDrawAccBelt(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var dk = dti2DShade(color, -35);
  var hi = dti2DShade(color, 25);
  var vdk = dti2DShade(color, -55);
  var beltH = hu * 0.06;
  ctx.save();

  // Belt body with gradient
  var beltGrad = ctx.createLinearGradient(0, m.waistY - beltH / 2, 0, m.waistY + beltH / 2);
  beltGrad.addColorStop(0, hi);
  beltGrad.addColorStop(0.3, color);
  beltGrad.addColorStop(0.7, color);
  beltGrad.addColorStop(1, dk);
  ctx.fillStyle = beltGrad;
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - hu * 0.04, m.waistY - beltH / 2);
  ctx.quadraticCurveTo(cx, m.waistY - beltH / 2 + hu * 0.012, cx + m.waistW / 2 + hu * 0.04, m.waistY - beltH / 2);
  ctx.lineTo(cx + m.waistW / 2 + hu * 0.04, m.waistY + beltH / 2);
  ctx.quadraticCurveTo(cx, m.waistY + beltH / 2 + hu * 0.012, cx - m.waistW / 2 - hu * 0.04, m.waistY + beltH / 2);
  ctx.closePath();
  ctx.fill();

  // Belt edge lines
  ctx.strokeStyle = dti2DAlpha(vdk, 0.2);
  ctx.lineWidth = hu * 0.006;
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - hu * 0.04, m.waistY - beltH / 2);
  ctx.quadraticCurveTo(cx, m.waistY - beltH / 2 + hu * 0.012, cx + m.waistW / 2 + hu * 0.04, m.waistY - beltH / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - hu * 0.04, m.waistY + beltH / 2);
  ctx.quadraticCurveTo(cx, m.waistY + beltH / 2 + hu * 0.012, cx + m.waistW / 2 + hu * 0.04, m.waistY + beltH / 2);
  ctx.stroke();

  // Stitching line
  ctx.strokeStyle = dti2DAlpha(dk, 0.15);
  ctx.lineWidth = hu * 0.003;
  ctx.setLineDash([hu * 0.008, hu * 0.006]);
  ctx.beginPath();
  ctx.moveTo(cx - m.waistW / 2 - hu * 0.03, m.waistY - beltH / 2 + hu * 0.012);
  ctx.quadraticCurveTo(cx, m.waistY - beltH / 2 + hu * 0.02, cx + m.waistW / 2 + hu * 0.03, m.waistY - beltH / 2 + hu * 0.012);
  ctx.stroke();
  ctx.setLineDash([]);

  // Belt holes (small dots to the right of buckle)
  for (var bh = 0; bh < 3; bh++) {
    ctx.fillStyle = dti2DAlpha(vdk, 0.2);
    ctx.beginPath();
    ctx.arc(cx + hu * 0.08 + bh * hu * 0.025, m.waistY, hu * 0.005, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buckle frame (larger, metallic)
  var buckW = hu * 0.08;
  var buckH = beltH * 1.5;
  ctx.fillStyle = dti2DShade('#888888', -20);
  ctx.beginPath();
  dti2DRoundRect(ctx, cx - buckW / 2, m.waistY - buckH / 2, buckW, buckH, hu * 0.01);
  ctx.fill();
  // Buckle inner cutout
  ctx.fillStyle = dti2DShade('#aaaaaa', 10);
  ctx.beginPath();
  dti2DRoundRect(ctx, cx - buckW / 2 + hu * 0.012, m.waistY - buckH / 2 + hu * 0.012, buckW - hu * 0.024, buckH - hu * 0.024, hu * 0.006);
  ctx.fill();
  // Buckle shine
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  dti2DRoundRect(ctx, cx - buckW / 2 + hu * 0.015, m.waistY - buckH / 2 + hu * 0.012, buckW * 0.35, buckH - hu * 0.024, hu * 0.004);
  ctx.fill();
  // Buckle prong
  ctx.strokeStyle = dti2DShade('#888888', -30);
  ctx.lineWidth = hu * 0.008;
  ctx.beginPath();
  ctx.moveTo(cx - hu * 0.005, m.waistY - buckH / 2 + hu * 0.015);
  ctx.lineTo(cx + hu * 0.01, m.waistY + buckH / 2 - hu * 0.015);
  ctx.stroke();

  ctx.restore();
}

function dti2DDrawAccEarrings(ctx, color, style, m) {
  var cx = m.cx, hu = m.hu;
  var hcy = m.headCY, hry = m.headRY, hrx = m.headRX;
  var hi = dti2DShade(color, 35);
  var dk = dti2DShade(color, -30);
  ctx.save();

  for (var side = -1; side <= 1; side += 2) {
    var ex = cx + side * hrx * 0.98;
    var ey = hcy + hry * 0.08;

    // Post/hook
    ctx.strokeStyle = color;
    ctx.lineWidth = hu * 0.012;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.quadraticCurveTo(ex + side * hu * 0.005, ey + hu * 0.025, ex, ey + hu * 0.04);
    ctx.stroke();

    // Earring drop - teardrop shape
    var dropCY = ey + hu * 0.07;
    var dropR = hu * 0.045;

    // Shadow
    ctx.fillStyle = dti2DAlpha(dk, 0.12);
    ctx.beginPath();
    ctx.arc(ex + hu * 0.003, dropCY + hu * 0.003, dropR * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // Main drop with gradient
    var earGrad = ctx.createRadialGradient(ex - dropR * 0.3, dropCY - dropR * 0.3, 0, ex, dropCY, dropR);
    earGrad.addColorStop(0, hi);
    earGrad.addColorStop(0.5, color);
    earGrad.addColorStop(1, dk);
    ctx.fillStyle = earGrad;
    ctx.beginPath();
    ctx.moveTo(ex, ey + hu * 0.035);
    ctx.quadraticCurveTo(ex - dropR * 1.1, dropCY - dropR * 0.2, ex - dropR * 0.5, dropCY + dropR * 0.5);
    ctx.quadraticCurveTo(ex, dropCY + dropR * 1.15, ex + dropR * 0.5, dropCY + dropR * 0.5);
    ctx.quadraticCurveTo(ex + dropR * 1.1, dropCY - dropR * 0.2, ex, ey + hu * 0.035);
    ctx.closePath();
    ctx.fill();

    // Shine highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(ex - dropR * 0.2, dropCY - dropR * 0.15, dropR * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = dti2DAlpha(dk, 0.2);
    ctx.lineWidth = hu * 0.005;
    ctx.beginPath();
    ctx.moveTo(ex, ey + hu * 0.035);
    ctx.quadraticCurveTo(ex - dropR * 1.1, dropCY - dropR * 0.2, ex - dropR * 0.5, dropCY + dropR * 0.5);
    ctx.quadraticCurveTo(ex, dropCY + dropR * 1.15, ex + dropR * 0.5, dropCY + dropR * 0.5);
    ctx.quadraticCurveTo(ex + dropR * 1.1, dropCY - dropR * 0.2, ex, ey + hu * 0.035);
    ctx.stroke();
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
