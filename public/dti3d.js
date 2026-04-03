// ─── DTI 3D Avatar System v2 — Realistic ─────────────────
// Three.js humanoid avatar with distinct clothing silhouettes.

var dti3D = {
  scene: null, camera: null, renderer: null, controls: null,
  avatarGroup: null, bodyParts: [], clothingGroup: null,
  animFrameId: null, breathTime: 0, runwaySpin: false, runwayStart: 0
};

// ── Helpers ──
function dti3DColor(hex) { return new THREE.Color(hex); }

function dti3DMaterial(hex, style) {
  var p = { color: dti3DColor(hex), roughness: 0.6, metalness: 0, side: THREE.DoubleSide };
  if (style === 'glam' || style === 'coquette' || style === 'romantic') { p.roughness = 0.18; p.metalness = 0.05; }
  else if (style === 'grunge' || style === 'casual' || style === 'street') { p.roughness = 0.85; }
  else if (style === 'goth' || style === 'dark' || style === 'edgy') { p.roughness = 0.3; p.metalness = 0.03; }
  else if (style === 'cottage' || style === 'soft' || style === 'fairy') { p.roughness = 0.92; }
  else if (style === 'old money' || style === 'clean' || style === 'french') { p.roughness = 0.45; p.metalness = 0.01; }
  else if (style === 'western' || style === 'autumn') { p.roughness = 0.4; p.metalness = 0.02; }
  return new THREE.MeshStandardMaterial(p);
}

function dti3DSkinMat(hex) {
  return new THREE.MeshStandardMaterial({ color: dti3DColor(hex), roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
}

// Make a smooth body-of-revolution from a profile [ [radius, y], ... ]
function dti3DLathe(profile, segments) {
  var pts = [];
  for (var i = 0; i < profile.length; i++) pts.push(new THREE.Vector2(profile[i][0], profile[i][1]));
  return new THREE.LatheGeometry(pts, segments || 24);
}

// Capsule-like shape: cylinder with sphere caps
function dti3DCapsule(radius, height, segs) {
  segs = segs || 12;
  var g = new THREE.Group();
  var cylH = Math.max(0, height - radius * 2);
  var cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, cylH, segs), null);
  var topCap = new THREE.Mesh(new THREE.SphereGeometry(radius, segs, segs / 2, 0, Math.PI * 2, 0, Math.PI / 2), null);
  topCap.position.y = cylH / 2;
  var botCap = new THREE.Mesh(new THREE.SphereGeometry(radius, segs, segs / 2, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), null);
  botCap.position.y = -cylH / 2;
  g.add(cyl, topCap, botCap);
  return g;
}

// Tapered limb: cylinder wider at top than bottom
function dti3DTaperedLimb(rTop, rBot, height, segs) {
  return new THREE.CylinderGeometry(rTop, rBot, height, segs || 16);
}

// ── Scene Init ──
function dti3DInitScene() {
  var container = document.getElementById('dti3DContainer');
  if (!container) return;
  if (dti3D.renderer) {
    if (dti3D.animFrameId) cancelAnimationFrame(dti3D.animFrameId);
    dti3D.renderer.dispose();
    container.innerHTML = '';
  }
  var w = container.clientWidth || 300, h = container.clientHeight || 450;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#f0ebe3');
  dti3D.scene = scene;

  var camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  camera.position.set(0.6, 0.6, 5.0);
  camera.lookAt(0, 0.2, 0);
  dti3D.camera = camera;

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else if (renderer.outputEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);
  dti3D.renderer = renderer;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  var key = new THREE.DirectionalLight(0xfff5e0, 1.0);
  key.position.set(-3, 4, 3);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0xd0e0ff, 0.35);
  fill.position.set(3, -1, 2);
  scene.add(fill);
  var rim = new THREE.PointLight(0xffeedd, 0.5, 12);
  rim.position.set(0, 2, -4);
  scene.add(rim);
  // Soft light from below to prevent harsh under-shadows
  var bounce = new THREE.DirectionalLight(0xffe8d0, 0.15);
  bounce.position.set(0, -3, 1);
  scene.add(bounce);

  // Ground shadow disc
  var gnd = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 32),
    new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.08, roughness: 1 })
  );
  gnd.rotation.x = -Math.PI / 2;
  gnd.position.y = -1.78;
  scene.add(gnd);

  // Controls
  var c = new THREE.OrbitControls(camera, renderer.domElement);
  c.enableZoom = false;
  c.enablePan = false;
  c.minPolarAngle = Math.PI / 2.3;
  c.maxPolarAngle = Math.PI / 1.75;
  c.enableDamping = true;
  c.dampingFactor = 0.05;
  c.autoRotate = true;
  c.autoRotateSpeed = 0.8;
  c.target.set(0, 0.2, 0);
  dti3D.controls = c;

  dti3DBuildBody();
  dti3D.clothingGroup = new THREE.Group();
  dti3D.avatarGroup.add(dti3D.clothingGroup);
  dti3D.breathTime = 0;
  dti3DAnimate();

  new ResizeObserver(function() {
    var ww = container.clientWidth, hh = container.clientHeight;
    if (ww > 0 && hh > 0) { camera.aspect = ww / hh; camera.updateProjectionMatrix(); renderer.setSize(ww, hh); }
  }).observe(container);
}

// ══════════════════════════════════════════════════════
// BODY — realistic feminine humanoid
// ══════════════════════════════════════════════════════
function dti3DBuildBody() {
  var g = new THREE.Group();
  dti3D.bodyParts = [];
  var skinHex = '#b88a60';
  var skin = dti3DSkinMat(skinHex);
  var darkSkin = new THREE.MeshStandardMaterial({ color: new THREE.Color(skinHex).offsetHSL(0, 0, -0.05), roughness: 0.6 });
  var uwMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, side: THREE.DoubleSide });

  function add(geo, mat2, px, py, pz, rx, ry, rz, sx, sy, sz) {
    var m = new THREE.Mesh(geo, mat2);
    m.position.set(px || 0, py || 0, pz || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx) m.scale.set(sx, sy || sx, sz || sx);
    g.add(m);
    if (mat2 === skin || mat2 === darkSkin) dti3D.bodyParts.push(m);
    return m;
  }

  // ── HEAD ── smooth sphere, slightly taller than wide
  add(new THREE.SphereGeometry(0.24, 24, 20), skin, 0, 1.52, 0, 0, 0, 0, 1, 1.1, 0.95);

  // Jaw — subtle widening at bottom of head
  add(new THREE.SphereGeometry(0.17, 16, 12, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.4), skin, 0, 1.42, 0.02, 0, 0, 0, 1.1, 0.7, 0.9);

  // ── FACE FEATURES ──
  // Eyes — dark inset ovals
  var eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.3, metalness: 0.05 });
  var eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf8f4f0, roughness: 0.4 });
  // Eye whites
  add(new THREE.SphereGeometry(0.038, 12, 8), eyeWhite, -0.085, 1.55, 0.19, 0, 0, 0, 1.3, 0.8, 0.5);
  add(new THREE.SphereGeometry(0.038, 12, 8), eyeWhite, 0.085, 1.55, 0.19, 0, 0, 0, 1.3, 0.8, 0.5);
  // Irises
  add(new THREE.SphereGeometry(0.022, 10, 8), eyeMat, -0.085, 1.55, 0.215, 0, 0, 0, 1.1, 1.1, 0.5);
  add(new THREE.SphereGeometry(0.022, 10, 8), eyeMat, 0.085, 1.55, 0.215, 0, 0, 0, 1.1, 1.1, 0.5);
  // Pupils (tiny black)
  var pupilMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.2 });
  add(new THREE.SphereGeometry(0.012, 8, 6), pupilMat, -0.085, 1.55, 0.225);
  add(new THREE.SphereGeometry(0.012, 8, 6), pupilMat, 0.085, 1.55, 0.225);
  // Eye highlights (tiny white dots)
  var highlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.3 });
  add(new THREE.SphereGeometry(0.006, 6, 4), highlightMat, -0.076, 1.558, 0.228);
  add(new THREE.SphereGeometry(0.006, 6, 4), highlightMat, 0.094, 1.558, 0.228);

  // Eyebrows — thin flattened spheres
  var browMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
  add(new THREE.SphereGeometry(0.04, 10, 6), browMat, -0.085, 1.595, 0.19, 0.2, 0, 0.1, 1.6, 0.3, 0.5);
  add(new THREE.SphereGeometry(0.04, 10, 6), browMat, 0.085, 1.595, 0.19, 0.2, 0, -0.1, 1.6, 0.3, 0.5);

  // Eyelashes — tiny dark arcs above eyes
  var lashMat = new THREE.MeshStandardMaterial({ color: 0x1a0a00, roughness: 0.5 });
  add(new THREE.TorusGeometry(0.04, 0.005, 4, 12, Math.PI), lashMat, -0.085, 1.572, 0.2, -0.3, 0, 0, 1.2, 1, 0.5);
  add(new THREE.TorusGeometry(0.04, 0.005, 4, 12, Math.PI), lashMat, 0.085, 1.572, 0.2, -0.3, 0, 0, 1.2, 1, 0.5);

  // Nose — subtle bump
  add(new THREE.SphereGeometry(0.03, 10, 8), skin, 0, 1.49, 0.22, 0, 0, 0, 0.7, 1.2, 0.7);
  // Nose bridge
  add(new THREE.CylinderGeometry(0.012, 0.02, 0.06, 8), skin, 0, 1.52, 0.21, 0.3, 0, 0);

  // Lips
  var lipMat = new THREE.MeshStandardMaterial({ color: 0xc08070, roughness: 0.35, metalness: 0.02 });
  // Upper lip
  add(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), lipMat, 0, 1.44, 0.2, 0, 0, 0, 1.4, 0.5, 0.6);
  // Lower lip — slightly fuller
  add(new THREE.SphereGeometry(0.032, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), lipMat, 0, 1.435, 0.2, 0, 0, 0, 1.3, 0.6, 0.55);

  // Ears — small spheres on sides
  add(new THREE.SphereGeometry(0.04, 8, 8), skin, -0.235, 1.52, 0, 0, 0, 0, 0.4, 0.8, 0.6);
  add(new THREE.SphereGeometry(0.04, 8, 8), skin, 0.235, 1.52, 0, 0, 0, 0, 0.4, 0.8, 0.6);

  // Cheek blush
  var blush = new THREE.MeshStandardMaterial({ color: 0xd09080, transparent: true, opacity: 0.12, roughness: 0.9 });
  add(new THREE.SphereGeometry(0.05, 8, 8), blush, -0.14, 1.5, 0.16, 0, 0, 0, 1.2, 0.7, 0.4);
  add(new THREE.SphereGeometry(0.05, 8, 8), blush, 0.14, 1.5, 0.16, 0, 0, 0, 1.2, 0.7, 0.4);

  // ── NECK ── tapered cylinder
  add(dti3DTaperedLimb(0.075, 0.085, 0.18, 16), skin, 0, 1.24, 0);

  // ── TORSO ── LatheGeometry hourglass
  var torso = dti3DLathe([
    [0.001, 0.72], // top center close
    [0.08, 0.7],   // neck base
    [0.18, 0.66],  // upper chest
    [0.25, 0.58],  // shoulders
    [0.265, 0.52], // bust
    [0.24, 0.44],  // under-bust
    [0.19, 0.36],  // waist (narrowest)
    [0.17, 0.32],
    [0.18, 0.26],  // above hips
    [0.23, 0.18],  // hips (widest)
    [0.235, 0.12],
    [0.22, 0.06],
    [0.2, 0.0],    // bottom
  ], 32);
  var torsoMesh = add(torso, skin, 0, 0.42, 0);

  // ── DEFAULT UNDERWEAR ──
  // Sports bra
  var braLathe = dti3DLathe([
    [0.2, 0.14], [0.258, 0.1], [0.27, 0.04], [0.265, -0.01],
    [0.25, -0.06], [0.22, -0.1], [0.2, -0.12],
  ], 24);
  add(braLathe, uwMat, 0, 0.92, 0);
  // Bra straps
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), uwMat, -0.14, 1.1, 0.04, 0.15, 0, 0.12);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), uwMat, 0.14, 1.1, 0.04, 0.15, 0, -0.12);
  // Shorts
  var shortsLathe = dti3DLathe([
    [0.235, 0.06], [0.24, 0.02], [0.235, -0.02],
    [0.22, -0.06], [0.16, -0.1],
  ], 24);
  add(shortsLathe, uwMat, 0, 0.22, 0);
  // Inner short legs
  add(dti3DTaperedLimb(0.1, 0.095, 0.08, 12), uwMat, -0.1, 0.13, 0);
  add(dti3DTaperedLimb(0.1, 0.095, 0.08, 12), uwMat, 0.1, 0.13, 0);

  // ── ARMS ── smooth tapered with sphere joints
  // Shoulders
  add(new THREE.SphereGeometry(0.08, 14, 10), skin, -0.3, 0.96, 0);
  add(new THREE.SphereGeometry(0.08, 14, 10), skin, 0.3, 0.96, 0);
  // Upper arms
  add(dti3DTaperedLimb(0.065, 0.055, 0.34, 14), skin, -0.32, 0.76, 0, 0, 0, 0.06);
  add(dti3DTaperedLimb(0.065, 0.055, 0.34, 14), skin, 0.32, 0.76, 0, 0, 0, -0.06);
  // Elbows
  add(new THREE.SphereGeometry(0.052, 10, 8), skin, -0.34, 0.56, 0.01);
  add(new THREE.SphereGeometry(0.052, 10, 8), skin, 0.34, 0.56, 0.01);
  // Forearms
  add(dti3DTaperedLimb(0.05, 0.038, 0.34, 14), skin, -0.35, 0.36, 0.03, 0.08, 0, 0.04);
  add(dti3DTaperedLimb(0.05, 0.038, 0.34, 14), skin, 0.35, 0.36, 0.03, 0.08, 0, -0.04);
  // Wrists
  add(new THREE.SphereGeometry(0.035, 8, 8), skin, -0.36, 0.17, 0.05);
  add(new THREE.SphereGeometry(0.035, 8, 8), skin, 0.36, 0.17, 0.05);
  // Hands — slightly flattened spheres
  add(new THREE.SphereGeometry(0.04, 10, 8), skin, -0.37, 0.1, 0.06, 0, 0, 0, 0.8, 1, 0.5);
  add(new THREE.SphereGeometry(0.04, 10, 8), skin, 0.37, 0.1, 0.06, 0, 0, 0, 0.8, 1, 0.5);
  // Fingers (simplified — three tiny cylinders per hand)
  var fingerGeo = new THREE.CylinderGeometry(0.008, 0.006, 0.05, 6);
  [-0.37, 0.37].forEach(function(hx) {
    var sign = hx < 0 ? -1 : 1;
    for (var fi = 0; fi < 3; fi++) {
      add(fingerGeo, skin, hx + sign * (-0.015 + fi * 0.015), 0.065, 0.06 + fi * 0.005, 0.1, 0, 0);
    }
  });

  // ── LEGS ──
  // Hips — smooth spheres
  add(new THREE.SphereGeometry(0.1, 14, 10), skin, -0.12, 0.15, 0);
  add(new THREE.SphereGeometry(0.1, 14, 10), skin, 0.12, 0.15, 0);
  // Thighs
  add(dti3DTaperedLimb(0.095, 0.075, 0.48, 16), skin, -0.12, -0.14, 0);
  add(dti3DTaperedLimb(0.095, 0.075, 0.48, 16), skin, 0.12, -0.14, 0);
  // Knees
  add(new THREE.SphereGeometry(0.065, 10, 10), skin, -0.12, -0.42, 0);
  add(new THREE.SphereGeometry(0.065, 10, 10), skin, 0.12, -0.42, 0);
  // Calves
  add(dti3DTaperedLimb(0.065, 0.045, 0.5, 16), skin, -0.12, -0.7, 0);
  add(dti3DTaperedLimb(0.065, 0.045, 0.5, 16), skin, 0.12, -0.7, 0);
  // Ankles
  add(new THREE.SphereGeometry(0.04, 8, 8), skin, -0.12, -0.97, 0);
  add(new THREE.SphereGeometry(0.04, 8, 8), skin, 0.12, -0.97, 0);
  // Feet — elongated rounded shapes
  var footLathe = dti3DLathe([
    [0.001, 0.1], [0.035, 0.08], [0.05, 0.04], [0.055, 0], [0.05, -0.03], [0.03, -0.05], [0.001, -0.06]
  ], 12);
  add(footLathe, skin, -0.12, -1.04, 0.06, Math.PI / 2, 0, 0, 1.1, 1.8, 0.8);
  add(footLathe, skin, 0.12, -1.04, 0.06, Math.PI / 2, 0, 0, 1.1, 1.8, 0.8);

  dti3D.avatarGroup = g;
  dti3D.scene.add(g);
}

// ── Animation Loop ──
function dti3DAnimate() {
  dti3D.animFrameId = requestAnimationFrame(dti3DAnimate);
  if (!dti3D.renderer) return;
  dti3D.breathTime += 0.018;
  if (dti3D.avatarGroup) {
    dti3D.avatarGroup.scale.y = 1 + Math.sin(dti3D.breathTime) * 0.002;
  }
  if (dti3D.runwaySpin && dti3D.avatarGroup) {
    var el = (Date.now() - dti3D.runwayStart) / 1000;
    if (el < 3) dti3D.avatarGroup.rotation.y = (el / 3) * Math.PI * 2;
    else { dti3D.avatarGroup.rotation.y = 0; dti3D.runwaySpin = false; }
  }
  dti3D.controls.update();
  dti3D.renderer.render(dti3D.scene, dti3D.camera);
}

function dti3DRunwaySpin() { dti3D.runwaySpin = true; dti3D.runwayStart = Date.now(); }

function dti3DUpdateSkin(tone) {
  var c = dti3DColor(tone.base);
  dti3D.bodyParts.forEach(function(m) { m.material.color.copy(c); m.material.needsUpdate = true; });
}

function dti3DClearClothing() {
  if (!dti3D.clothingGroup) return;
  while (dti3D.clothingGroup.children.length) {
    var ch = dti3D.clothingGroup.children[0];
    dti3D.clothingGroup.remove(ch);
    ch.traverse(function(o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (Array.isArray(o.material)) o.material.forEach(function(mm) { mm.dispose(); }); else o.material.dispose(); }
    });
  }
}

function dti3DAddClothing(key, color, style) {
  if (!DTI_3D[key]) return;
  var grp = DTI_3D[key](color, style);
  if (!grp) return;
  grp.traverse(function(o) { if (o.material) { o.material.transparent = true; o.material.opacity = 0; } });
  dti3D.clothingGroup.add(grp);
  var t0 = Date.now();
  (function tick() {
    var t = Math.min(1, (Date.now() - t0) / 280);
    grp.traverse(function(o) { if (o.material) { o.material.opacity = t; if (t >= 1) o.material.transparent = false; } });
    if (t < 1) requestAnimationFrame(tick);
  })();
}

// ═══════════════════════════════════════════════════════
// DTI_3D — Clothing Mesh Generators (each → THREE.Group)
// ═══════════════════════════════════════════════════════
var DTI_3D = {};

// ── HAIR ──
// Head center: y=1.52, radius ~0.24. Top of skull ~1.76

DTI_3D.hair = function(c, s) {
  // Straight with curtain bangs — smooth cap, side curtains, back panel
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Smooth hair cap
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14, 0, Math.PI*2, 0, Math.PI*0.52), m);
  cap.position.set(0, 1.56, -0.01); cap.scale.set(1.02, 1.02, 0.98); g.add(cap);
  // Left side curtain — long panel
  var sideL = dti3DLathe([[0.001,0.35],[0.04,0.32],[0.055,0.2],[0.05,0],[0.04,-0.2],[0.025,-0.35],[0.001,-0.38]], 10);
  var sL = new THREE.Mesh(sideL, m);
  sL.position.set(-0.24, 1.1, 0.03); sL.rotation.z = 0.06; g.add(sL);
  // Right side
  var sR = new THREE.Mesh(sideL.clone(), m);
  sR.position.set(0.24, 1.1, 0.03); sR.rotation.z = -0.06; g.add(sR);
  // Back hair — thick slab
  var backGeo = dti3DLathe([[0.001,0.4],[0.22,0.36],[0.24,0.2],[0.23,0],[0.22,-0.2],[0.21,-0.35],[0.18,-0.4]], 20);
  var bk = new THREE.Mesh(backGeo, m);
  bk.position.set(0, 1.08, -0.12); bk.scale.set(1, 1, 0.35); g.add(bk);
  // Curtain bangs — two curved pieces framing face
  var bangGeo = new THREE.SphereGeometry(0.08, 10, 8, 0, Math.PI, 0, Math.PI*0.5);
  var bL = new THREE.Mesh(bangGeo, m); bL.position.set(-0.13, 1.58, 0.18); bL.rotation.set(0.4, 0.3, 0.2); bL.scale.set(1.3, 1, 0.5); g.add(bL);
  var bR = new THREE.Mesh(bangGeo.clone(), m); bR.position.set(0.13, 1.58, 0.18); bR.rotation.set(0.4, -0.3, -0.2); bR.scale.set(1.3, 1, 0.5); g.add(bR);
  return g;
};

DTI_3D.hair_short = function(c, s) {
  // Short bob — cap with chin-length sides, no long back
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14, 0, Math.PI*2, 0, Math.PI*0.55), m);
  cap.position.set(0, 1.55, -0.01); cap.scale.set(1.04, 1, 1); g.add(cap);
  // Short sides — end at jaw
  var sidePts = [[0.001,0.18],[0.045,0.15],[0.06,0.05],[0.055,-0.05],[0.04,-0.12],[0.02,-0.16],[0.001,-0.18]];
  var sGeo = dti3DLathe(sidePts, 10);
  var sL = new THREE.Mesh(sGeo, m); sL.position.set(-0.24, 1.3, 0.02); g.add(sL);
  var sR = new THREE.Mesh(sGeo.clone(), m); sR.position.set(0.24, 1.3, 0.02); g.add(sR);
  // Short back
  var bk = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI*2, 0, Math.PI*0.6), m);
  bk.position.set(0, 1.5, -0.08); bk.scale.set(1, 0.7, 0.6); g.add(bk);
  // Bangs — fringe across forehead
  var fringeGeo = new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI, 0, Math.PI*0.3);
  var fringe = new THREE.Mesh(fringeGeo, m);
  fringe.position.set(0, 1.64, 0.15); fringe.rotation.x = 0.5; fringe.scale.set(1.5, 0.6, 0.5); g.add(fringe);
  return g;
};

DTI_3D.hair_bun = function(c, s) {
  // High messy bun — tight cap, big bun sphere on top, tendrils
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14, 0, Math.PI*2, 0, Math.PI*0.5), m);
  cap.position.set(0, 1.55, 0); g.add(cap);
  // Big messy bun
  var bun = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), m);
  bun.position.set(0, 1.84, -0.05); bun.scale.set(1, 0.85, 0.95); g.add(bun);
  // Messy wisps on bun
  var wisp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m);
  wisp.position.set(0.08, 1.9, 0.02); g.add(wisp);
  var wisp2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m);
  wisp2.position.set(-0.06, 1.88, -0.08); g.add(wisp2);
  // Hair tie
  var tie = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 16), dti3DMaterial(dtiShade(c,-50), s));
  tie.position.set(0, 1.76, -0.02); tie.rotation.x = Math.PI/3; g.add(tie);
  // Face framing tendrils — thin wavy strands
  var tGeo = dti3DLathe([[0.001,0.14],[0.015,0.1],[0.018,0],[0.015,-0.1],[0.01,-0.15],[0.001,-0.16]], 6);
  var tL = new THREE.Mesh(tGeo, m); tL.position.set(-0.21, 1.36, 0.12); tL.rotation.z = 0.15; g.add(tL);
  var tR = new THREE.Mesh(tGeo.clone(), m); tR.position.set(0.21, 1.36, 0.12); tR.rotation.z = -0.15; g.add(tR);
  return g;
};

DTI_3D.hair_long = function(c, s) {
  // Long flowing waves past waist — big volume, thick
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14, 0, Math.PI*2, 0, Math.PI*0.52), m);
  cap.position.set(0, 1.56, -0.01); cap.scale.set(1.03, 1.02, 1); g.add(cap);
  // Very long side hair (reaching y~0.1, mid-torso)
  var longSide = dti3DLathe([[0.001,0.55],[0.055,0.5],[0.07,0.3],[0.065,0],[0.06,-0.3],[0.05,-0.55],[0.035,-0.6],[0.001,-0.62]], 10);
  var sL = new THREE.Mesh(longSide, m); sL.position.set(-0.26, 0.85, 0); g.add(sL);
  var sR = new THREE.Mesh(longSide.clone(), m); sR.position.set(0.26, 0.85, 0); g.add(sR);
  // Long thick back
  var backPts = [[0.001,0.6],[0.23,0.55],[0.26,0.3],[0.25,0],[0.24,-0.3],[0.22,-0.55],[0.18,-0.62],[0.001,-0.65]];
  var bkGeo = dti3DLathe(backPts, 22);
  var bk = new THREE.Mesh(bkGeo, m); bk.position.set(0, 0.85, -0.14); bk.scale.set(1, 1, 0.4); g.add(bk);
  // Curtain bangs
  var bangGeo = new THREE.SphereGeometry(0.08, 10, 8, 0, Math.PI, 0, Math.PI*0.5);
  var bL = new THREE.Mesh(bangGeo, m); bL.position.set(-0.13, 1.58, 0.18); bL.rotation.set(0.4, 0.3, 0.2); bL.scale.set(1.3, 1, 0.5); g.add(bL);
  var bR = new THREE.Mesh(bangGeo.clone(), m); bR.position.set(0.13, 1.58, 0.18); bR.rotation.set(0.4, -0.3, -0.2); bR.scale.set(1.3, 1, 0.5); g.add(bR);
  // Wavy ends — clusters of spheres at bottom
  [-0.2, -0.06, 0.06, 0.2].forEach(function(x) {
    var wave = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), m);
    wave.position.set(x, 0.22 + Math.random()*0.04, -0.1 - Math.abs(x)*0.3);
    wave.scale.set(1.2, 0.6, 1); g.add(wave);
  });
  return g;
};

DTI_3D.hair_braids = function(c, s) {
  // Twin braids — tight cap with center part, braided chain segments
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14, 0, Math.PI*2, 0, Math.PI*0.5), m);
  cap.position.set(0, 1.55, 0); g.add(cap);
  // Center part line
  var partMat = dti3DMaterial(dtiShade(c, -30), s);
  var part = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 4), partMat);
  part.position.set(0, 1.72, 0.08); part.rotation.x = Math.PI/3; g.add(part);
  // Braid segments — alternating slightly offset spheroids
  var segGeo = new THREE.SphereGeometry(0.045, 8, 6);
  for (var i = 0; i < 10; i++) {
    var y = 1.35 - i * 0.11;
    var wobble = (i % 2 === 0) ? 0.015 : -0.015;
    var scaleX = 0.9 + (i % 2) * 0.2;
    // Left
    var sL = new THREE.Mesh(segGeo, m);
    sL.position.set(-0.2 + wobble, y, 0.04); sL.scale.set(scaleX, 0.7, 0.8); g.add(sL);
    // Right
    var sR = new THREE.Mesh(segGeo.clone(), m);
    sR.position.set(0.2 - wobble, y, 0.04); sR.scale.set(scaleX, 0.7, 0.8); g.add(sR);
  }
  // Braid ties at ends
  var tieMat = dti3DMaterial(dtiShade(c, -40), s);
  var tieGeo = new THREE.TorusGeometry(0.03, 0.012, 6, 10);
  var tieL = new THREE.Mesh(tieGeo, tieMat); tieL.position.set(-0.2, 0.26, 0.04); g.add(tieL);
  var tieR = new THREE.Mesh(tieGeo.clone(), tieMat); tieR.position.set(0.2, 0.26, 0.04); g.add(tieR);
  return g;
};

DTI_3D.hair_ponytail = function(c, s) {
  // High ponytail — slicked back tight cap, long tail curving down back
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Tight slicked cap
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.265, 18, 14, 0, Math.PI*2, 0, Math.PI*0.52), m);
  cap.position.set(0, 1.54, 0); g.add(cap);
  // Hair tie at crown
  var tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 14), dti3DMaterial(dtiShade(c,-50), s));
  tie.position.set(0, 1.76, -0.06); tie.rotation.x = Math.PI/5; g.add(tie);
  // Ponytail — thick tapered cylinder hanging down back
  var tailGeo = dti3DTaperedLimb(0.07, 0.035, 0.85, 12);
  var tail = new THREE.Mesh(tailGeo, m);
  tail.position.set(0, 1.25, -0.2); tail.rotation.x = 0.15; g.add(tail);
  // Tail end wisp
  var wisp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m);
  wisp.position.set(0, 0.82, -0.16); wisp.scale.set(1, 0.6, 0.8); g.add(wisp);
  return g;
};

DTI_3D.hair_spacebuns = function(c, s) {
  // Space buns — two prominent spheres on top, cap underneath
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.265, 18, 14, 0, Math.PI*2, 0, Math.PI*0.5), m);
  cap.position.set(0, 1.55, 0); g.add(cap);
  // Left bun — bigger and prominent
  var bunL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), m);
  bunL.position.set(-0.17, 1.78, 0.02); g.add(bunL);
  // Right bun
  var bunR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), m);
  bunR.position.set(0.17, 1.78, 0.02); g.add(bunR);
  // Center part
  var pMat = dti3DMaterial(dtiShade(c, -25), s);
  var pLine = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.18, 4), pMat);
  pLine.position.set(0, 1.72, 0.1); pLine.rotation.x = Math.PI/3; g.add(pLine);
  // Loose face-framing strands
  var strand = dti3DLathe([[0.001,0.12],[0.014,0.08],[0.016,0],[0.012,-0.1],[0.001,-0.14]], 6);
  var stL = new THREE.Mesh(strand, m); stL.position.set(-0.2, 1.36, 0.14); stL.rotation.z = 0.12; g.add(stL);
  var stR = new THREE.Mesh(strand.clone(), m); stR.position.set(0.2, 1.36, 0.14); stR.rotation.z = -0.12; g.add(stR);
  return g;
};

DTI_3D.hair_wolfcut = function(c, s) {
  // Wolf cut — big volume on top, shaggy choppy layers, mullet-ish back
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Extra big voluminous cap
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14, 0, Math.PI*2, 0, Math.PI*0.55), m);
  cap.position.set(0, 1.56, 0); cap.scale.set(1.06, 1.05, 1.02); g.add(cap);
  // Shaggy side layers — medium, with choppy texture (multiple overlapping pieces)
  for (var si = 0; si < 5; si++) {
    var yOff = si * 0.09;
    var xSpread = 0.26 + Math.sin(si*1.7)*0.02;
    var shag = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m);
    shag.position.set(-xSpread, 1.28 - yOff, 0.02 + si*0.01); shag.scale.set(1.2, 0.65, 0.9); g.add(shag);
    var shag2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m);
    shag2.position.set(xSpread, 1.28 - yOff, 0.02 + si*0.01); shag2.scale.set(1.2, 0.65, 0.9); g.add(shag2);
  }
  // Choppy back layers
  for (var bi = 0; bi < 4; bi++) {
    var bShag = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), m);
    bShag.position.set(-0.1 + bi*0.07, 1.18 - bi*0.08, -0.18 - bi*0.01);
    bShag.scale.set(1.3, 0.6, 0.8); g.add(bShag);
  }
  // Big curtain bangs
  var bangGeo = new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI, 0, Math.PI*0.45);
  var bL = new THREE.Mesh(bangGeo, m); bL.position.set(-0.14, 1.6, 0.18); bL.rotation.set(0.45, 0.25, 0.15); bL.scale.set(1.4, 0.9, 0.5); g.add(bL);
  var bR = new THREE.Mesh(bangGeo.clone(), m); bR.position.set(0.14, 1.6, 0.18); bR.rotation.set(0.45, -0.25, -0.15); bR.scale.set(1.4, 0.9, 0.5); g.add(bR);
  return g;
};

DTI_3D.hair_curls = function(c, s) {
  // Long bouncy curls — lots of overlapping sphere clusters for curl texture
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Voluminous cap
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 14, 0, Math.PI*2, 0, Math.PI*0.54), m);
  cap.position.set(0, 1.56, -0.01); cap.scale.set(1.06, 1.02, 1.02); g.add(cap);
  // Curls — scattered sphere clusters down sides and back
  var curlGeo = new THREE.SphereGeometry(0.05, 8, 6);
  var curlPositions = [
    // Left side
    [-0.28,1.32,0.04],[-0.3,1.18,0.06],[-0.28,1.04,0.04],[-0.26,0.9,0.06],
    [-0.28,0.76,0.04],[-0.26,0.62,0.06],[-0.24,0.48,0.04],[-0.22,0.36,0.06],
    // Right side
    [0.28,1.32,0.04],[0.3,1.18,0.06],[0.28,1.04,0.04],[0.26,0.9,0.06],
    [0.28,0.76,0.04],[0.26,0.62,0.06],[0.24,0.48,0.04],[0.22,0.36,0.06],
    // Back
    [-0.16,1.1,-0.2],[0,1.05,-0.22],[0.16,1.1,-0.2],
    [-0.12,0.85,-0.18],[0.12,0.85,-0.18],[0,0.75,-0.2],
    [-0.14,0.55,-0.16],[0.14,0.55,-0.16],[0,0.45,-0.18],
  ];
  curlPositions.forEach(function(p) {
    var curl = new THREE.Mesh(curlGeo, m);
    curl.position.set(p[0], p[1], p[2]);
    // Vary scale for organic look
    var sx = 0.9 + Math.abs(Math.sin(p[0]*20))*0.5;
    var sy = 0.7 + Math.abs(Math.cos(p[1]*15))*0.5;
    curl.scale.set(sx, sy, 0.9); g.add(curl);
  });
  // Bangs
  var bangGeo = new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI, 0, Math.PI*0.5);
  g.add(new THREE.Mesh(bangGeo, m)).position.set(-0.12, 1.58, 0.19);
  g.children[g.children.length-1].rotation.set(0.4, 0.3, 0.15);
  g.children[g.children.length-1].scale.set(1.2, 0.9, 0.5);
  g.add(new THREE.Mesh(bangGeo.clone(), m)).position.set(0.12, 1.58, 0.19);
  g.children[g.children.length-1].rotation.set(0.4, -0.3, -0.15);
  g.children[g.children.length-1].scale.set(1.2, 0.9, 0.5);
  return g;
};

DTI_3D.hair_ribbon = function(c, s) {
  // Long straight with big coquette ribbon bow
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Same base as hair straight
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14, 0, Math.PI*2, 0, Math.PI*0.52), m);
  cap.position.set(0, 1.56, -0.01); cap.scale.set(1.02, 1.02, 0.98); g.add(cap);
  // Side hair
  var sideGeo = dti3DLathe([[0.001,0.35],[0.04,0.32],[0.055,0.2],[0.05,0],[0.04,-0.2],[0.025,-0.35],[0.001,-0.38]], 10);
  g.add(new THREE.Mesh(sideGeo, m)).position.set(-0.24, 1.1, 0.03);
  g.add(new THREE.Mesh(sideGeo.clone(), m)).position.set(0.24, 1.1, 0.03);
  // Back
  var bkGeo = dti3DLathe([[0.001,0.4],[0.22,0.36],[0.24,0.2],[0.23,0],[0.22,-0.2],[0.21,-0.35],[0.18,-0.4]], 20);
  g.add(new THREE.Mesh(bkGeo, m)).position.set(0, 1.08, -0.12);
  g.children[g.children.length-1].scale.set(1, 1, 0.35);
  // BIG RIBBON BOW — signature coquette
  var ribbonMat = new THREE.MeshStandardMaterial({ color: 0xe8829a, roughness: 0.25, metalness: 0.03, side: THREE.DoubleSide });
  // Left bow loop — larger, flatter oval
  var loopGeo = new THREE.SphereGeometry(0.1, 12, 8);
  var loopL = new THREE.Mesh(loopGeo, ribbonMat);
  loopL.position.set(-0.13, 1.78, 0.04); loopL.scale.set(1.5, 0.65, 0.45); g.add(loopL);
  var loopR = new THREE.Mesh(loopGeo.clone(), ribbonMat);
  loopR.position.set(0.13, 1.78, 0.04); loopR.scale.set(1.5, 0.65, 0.45); g.add(loopR);
  // Knot center
  var knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd06880, roughness: 0.25 }));
  knot.position.set(0, 1.78, 0.06); g.add(knot);
  // Ribbon tails hanging down
  var tailGeo = dti3DLathe([[0.001,0.1],[0.02,0.06],[0.025,0],[0.02,-0.06],[0.015,-0.1],[0.001,-0.12]], 6);
  var tailL = new THREE.Mesh(tailGeo, ribbonMat); tailL.position.set(-0.06, 1.65, 0.06); tailL.rotation.z = 0.25; g.add(tailL);
  var tailR = new THREE.Mesh(tailGeo.clone(), ribbonMat); tailR.position.set(0.06, 1.65, 0.06); tailR.rotation.z = -0.25; g.add(tailR);
  return g;
};

// ── TOPS ──
// Torso LatheGeo: shoulders y~0.94, bust y~0.84, waist y~0.6, hips y~0.42

DTI_3D.top_fitted = function(c, s) {
  // Fitted top — body-hugging, short sleeves, V-neckline, button detail
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Main body shell — LatheGeo hugging torso tightly
  var bodyGeo = dti3DLathe([
    [0.001, 0.72],[0.09, 0.69],[0.19, 0.65],[0.26, 0.56],
    [0.275, 0.5],[0.255, 0.42],[0.2, 0.34],[0.18, 0.3],
    [0.19, 0.24],[0.235, 0.16],[0.24, 0.1],[0.23, 0.04],[0.21, 0.0],
  ], 28);
  var body = new THREE.Mesh(bodyGeo, m);
  body.position.set(0, 0.42, 0); g.add(body);
  // Short sleeves — rounded tubes
  var slvGeo = dti3DTaperedLimb(0.08, 0.065, 0.18, 14);
  var slvL = new THREE.Mesh(slvGeo, m); slvL.position.set(-0.33, 0.84, 0); slvL.rotation.z = 0.35; g.add(slvL);
  var slvR = new THREE.Mesh(slvGeo.clone(), m); slvR.position.set(0.33, 0.84, 0); slvR.rotation.z = -0.35; g.add(slvR);
  // Sleeve caps (rounded shoulder detail)
  var capGeo = new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI*2, 0, Math.PI*0.5);
  g.add(new THREE.Mesh(capGeo, m)).position.set(-0.31, 0.92, 0);
  g.add(new THREE.Mesh(capGeo.clone(), m)).position.set(0.31, 0.92, 0);
  // Collar — V neckline
  var collarMat = dti3DMaterial(dtiShade(c, -20), s);
  var collarGeo = new THREE.TorusGeometry(0.1, 0.012, 6, 14, Math.PI*0.7);
  var collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.set(0, 1.04, 0.1); collar.rotation.set(-0.1, 0, 0); g.add(collar);
  // Buttons
  var btnMat = dti3DMaterial(dtiShade(c, -35), s);
  var btnGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.005, 8);
  for (var i = 0; i < 5; i++) {
    var btn = new THREE.Mesh(btnGeo, btnMat);
    btn.position.set(0, 0.9 - i*0.1, 0.23 - i*0.015);
    btn.rotation.x = Math.PI/2; g.add(btn);
  }
  // Side seam detail
  var seamGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.55, 4);
  var seamMat = dti3DMaterial(dtiShade(c, -15), s);
  g.add(new THREE.Mesh(seamGeo, seamMat)).position.set(-0.21, 0.65, 0.12);
  g.add(new THREE.Mesh(seamGeo.clone(), seamMat)).position.set(0.21, 0.65, 0.12);
  return g;
};

DTI_3D.top_crop = function(c, s) {
  // Crop top — stops at midriff, gathered/ruched, puff sleeves, tiny bow
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Short body — only covers ribcage/bust
  var bodyGeo = dti3DLathe([
    [0.001, 0.4],[0.09, 0.38],[0.19, 0.34],[0.26, 0.26],
    [0.275, 0.2],[0.265, 0.14],[0.24, 0.08],[0.2, 0.02],[0.18, 0.0],
  ], 26);
  var body = new THREE.Mesh(bodyGeo, m);
  body.position.set(0, 0.68, 0); g.add(body);
  // Puff sleeves — big round
  var puffGeo = new THREE.SphereGeometry(0.09, 12, 10);
  var pL = new THREE.Mesh(puffGeo, m); pL.position.set(-0.34, 0.88, 0); pL.scale.set(1.1, 0.8, 0.9); g.add(pL);
  var pR = new THREE.Mesh(puffGeo.clone(), m); pR.position.set(0.34, 0.88, 0); pR.scale.set(1.1, 0.8, 0.9); g.add(pR);
  // Ruched hem at bottom
  var hemGeo = new THREE.TorusGeometry(0.18, 0.018, 8, 24);
  var hem = new THREE.Mesh(hemGeo, m); hem.position.set(0, 0.68, 0); hem.rotation.x = Math.PI/2; g.add(hem);
  // Gather lines
  var gatherMat = dti3DMaterial(dtiShade(c, -12), s);
  for (var gi = 0; gi < 6; gi++) {
    var angle = (gi/6)*Math.PI*2;
    var gLine = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.25, 4), gatherMat);
    gLine.position.set(Math.sin(angle)*0.2, 0.8, Math.cos(angle)*0.2);
    g.add(gLine);
  }
  // Tiny center bow
  var bowMat = dti3DMaterial(dtiShade(c, -25), s);
  var bow = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), bowMat);
  bow.position.set(0, 1.02, 0.22); g.add(bow);
  return g;
};

DTI_3D.top_oversized = function(c, s) {
  // Oversized hoodie — big boxy silhouette, baggy sleeves, hood, kangaroo pocket
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Big boxy body — significantly wider/longer than torso
  var bodyGeo = dti3DLathe([
    [0.001, 0.76],[0.1, 0.73],[0.22, 0.68],[0.3, 0.58],
    [0.32, 0.5],[0.3, 0.4],[0.28, 0.3],[0.27, 0.2],
    [0.27, 0.1],[0.28, 0.04],[0.27, 0.0],
  ], 28);
  var body = new THREE.Mesh(bodyGeo, m);
  body.position.set(0, 0.38, 0); g.add(body);
  // Baggy long sleeves — wider cylinders
  var slvGeo = dti3DTaperedLimb(0.11, 0.09, 0.45, 14);
  var slvL = new THREE.Mesh(slvGeo, m); slvL.position.set(-0.38, 0.72, 0.02); slvL.rotation.z = 0.4; g.add(slvL);
  var slvR = new THREE.Mesh(slvGeo.clone(), m); slvR.position.set(0.38, 0.72, 0.02); slvR.rotation.z = -0.4; g.add(slvR);
  // Sleeve cuffs
  var cuffGeo = new THREE.TorusGeometry(0.09, 0.015, 6, 14);
  var cuffMat = dti3DMaterial(dtiShade(c, -15), s);
  g.add(new THREE.Mesh(cuffGeo, cuffMat)).position.set(-0.44, 0.48, 0.04);
  g.children[g.children.length-1].rotation.set(0.5, 0, 0.4);
  g.add(new THREE.Mesh(cuffGeo.clone(), cuffMat)).position.set(0.44, 0.48, 0.04);
  g.children[g.children.length-1].rotation.set(0.5, 0, -0.4);
  // Hood — draped behind neck
  var hoodGeo = new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI*2, 0, Math.PI*0.5);
  var hood = new THREE.Mesh(hoodGeo, m);
  hood.position.set(0, 1.08, -0.1); hood.scale.set(1.3, 0.75, 1); g.add(hood);
  // Hood drawstrings
  var strMat = dti3DMaterial(dtiShade(c, -20), s);
  var strGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4);
  g.add(new THREE.Mesh(strGeo, strMat)).position.set(-0.06, 0.98, 0.2);
  g.add(new THREE.Mesh(strGeo.clone(), strMat)).position.set(0.06, 0.98, 0.2);
  // Kangaroo pocket — visible rectangle on front
  var pocketGeo = dti3DLathe([[0.001,0.08],[0.12,0.06],[0.14,0],[0.12,-0.06],[0.001,-0.08]], 16);
  var pocketMat = dti3DMaterial(dtiShade(c, -10), s);
  var pocket = new THREE.Mesh(pocketGeo, pocketMat);
  pocket.position.set(0, 0.54, 0.2); pocket.scale.set(1, 1, 0.3); g.add(pocket);
  // Ribbed hem at bottom
  var ribGeo = new THREE.TorusGeometry(0.27, 0.012, 6, 24);
  g.add(new THREE.Mesh(ribGeo, cuffMat)).position.set(0, 0.38, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  return g;
};

DTI_3D.top_offsh = function(c, s) {
  // Off-shoulder with ruffle — exposed shoulders, wavy neckline, body-hugging
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Body — starts lower than shoulders
  var bodyGeo = dti3DLathe([
    [0.19, 0.48],[0.255, 0.42],[0.265, 0.36],[0.245, 0.28],
    [0.2, 0.22],[0.18, 0.18],[0.19, 0.12],[0.235, 0.04],[0.24, 0.0],
  ], 26);
  var body = new THREE.Mesh(bodyGeo, m);
  body.position.set(0, 0.42, 0); g.add(body);
  // Ruffle neckline — wavy torus
  var ruffleGeo = new THREE.TorusGeometry(0.28, 0.035, 8, 36);
  var ruffle = new THREE.Mesh(ruffleGeo, m);
  ruffle.position.set(0, 0.88, 0); ruffle.rotation.x = Math.PI/2; g.add(ruffle);
  // Second lighter ruffle layer
  var ruf2Mat = dti3DMaterial(dtiShade(c, 18), s);
  var ruf2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 32), ruf2Mat);
  ruf2.position.set(0, 0.86, 0); ruf2.rotation.x = Math.PI/2; g.add(ruf2);
  // Scallop texture on ruffle — small bumps
  for (var si = 0; si < 14; si++) {
    var ang = (si/14)*Math.PI*2;
    var bump = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), m);
    bump.position.set(Math.sin(ang)*0.28, 0.88, Math.cos(ang)*0.28);
    bump.scale.set(1, 0.5, 1); g.add(bump);
  }
  // Lace hem
  var hemGeo = new THREE.TorusGeometry(0.23, 0.01, 6, 24);
  g.add(new THREE.Mesh(hemGeo, m)).position.set(0, 0.42, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  return g;
};

// ── BOTTOMS ──
// Hips start at y~0.18, knees y~-0.42, ankles y~-0.97

DTI_3D.bottom_skirt = function(c, s) {
  // A-line midi skirt — waistband, flared cone to below knee, pleat details
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Flared skirt body — wide cone
  var skirtGeo = dti3DLathe([
    [0.24, 0.48],[0.245, 0.44],[0.25, 0.36],[0.26, 0.28],
    [0.28, 0.2],[0.3, 0.12],[0.34, 0.04],[0.38, 0.0],
  ], 28);
  skirtGeo.scale(1, 1, 1);
  var skirt = new THREE.Mesh(skirtGeo, m);
  skirt.position.set(0, -0.12, 0); g.add(skirt);
  // Waistband — snug ring at top
  var wbMat = dti3DMaterial(dtiShade(c, -18), s);
  var wb = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.022, 8, 24), wbMat);
  wb.position.set(0, 0.2, 0); wb.rotation.x = Math.PI/2; g.add(wb);
  // Pleat fold lines
  var pleatMat = dti3DMaterial(dtiShade(c, -12), s);
  for (var i = 0; i < 8; i++) {
    var ang = (i/8)*Math.PI*2;
    var r1 = 0.24, r2 = 0.38;
    var pleat = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.6, 4), pleatMat);
    pleat.position.set(Math.sin(ang)*(r1+r2)/2, -0.08, Math.cos(ang)*(r1+r2)/2);
    g.add(pleat);
  }
  // Belt buckle
  var buckle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.008, 6),
    dti3DMaterial(dtiShade(c, -40), s)
  );
  buckle.position.set(0, 0.2, 0.24); buckle.rotation.x = Math.PI/2; g.add(buckle);
  return g;
};

DTI_3D.bottom_mini = function(c, s) {
  // Pleated mini skirt — short, flared, with visible pleats
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Short flared skirt
  var skirtGeo = dti3DLathe([
    [0.24, 0.24],[0.245, 0.2],[0.26, 0.14],[0.28, 0.08],
    [0.3, 0.04],[0.32, 0.0],
  ], 28);
  var skirt = new THREE.Mesh(skirtGeo, m);
  skirt.position.set(0, -0.02, 0); g.add(skirt);
  // Waistband
  var wbMat = dti3DMaterial(dtiShade(c, -18), s);
  var wb = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.022, 8, 24), wbMat);
  wb.position.set(0, 0.2, 0); wb.rotation.x = Math.PI/2; g.add(wb);
  // Visible pleats — thin wedge-shaped panels around circumference
  var pleatMat = dti3DMaterial(dtiShade(c, -15), s);
  for (var i = 0; i < 16; i++) {
    if (i % 2 === 0) continue; // every other pleat is shadow
    var ang = (i/16)*Math.PI*2;
    var pleat = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.22, 4), pleatMat);
    pleat.position.set(Math.sin(ang)*0.27, 0.07, Math.cos(ang)*0.27);
    g.add(pleat);
  }
  // Hem flare shadow
  var hemGeo = new THREE.TorusGeometry(0.32, 0.01, 6, 24);
  var hemMat = dti3DMaterial(dtiShade(c, -10), s);
  var hem = new THREE.Mesh(hemGeo, hemMat);
  hem.position.set(0, -0.02, 0); hem.rotation.x = Math.PI/2; g.add(hem);
  return g;
};

DTI_3D.bottom_pants = function(c, s) {
  // Fitted pants/jeans — two distinct leg tubes, waistband, pockets, fly
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Hip bridge connecting legs
  var hipGeo = dti3DLathe([
    [0.24, 0.1],[0.235, 0.06],[0.22, 0.02],[0.18, -0.02],
    [0.13, -0.04],[0.001, -0.05],
  ], 22);
  g.add(new THREE.Mesh(hipGeo, m)).position.set(0, 0.12, 0);
  // Left leg — fitted, tapered
  var legGeo = dti3DTaperedLimb(0.1, 0.06, 0.95, 16);
  g.add(new THREE.Mesh(legGeo, m)).position.set(-0.12, -0.36, 0);
  g.add(new THREE.Mesh(legGeo.clone(), m)).position.set(0.12, -0.36, 0);
  // Waistband
  var wbMat = dti3DMaterial(dtiShade(c, -15), s);
  var wb = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.024, 8, 24), wbMat);
  wb.position.set(0, 0.2, 0); wb.rotation.x = Math.PI/2; g.add(wb);
  // Belt loops
  var loopGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.04, 4);
  var loopMat = dti3DMaterial(dtiShade(c, -12), s);
  [-0.12, -0.04, 0.04, 0.12].forEach(function(x) {
    g.add(new THREE.Mesh(loopGeo, loopMat)).position.set(x, 0.2, 0.22);
  });
  // Fly stitching — center front line
  var flyGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.12, 4);
  g.add(new THREE.Mesh(flyGeo, wbMat)).position.set(0, 0.08, 0.2);
  // Front pockets — subtle indented arcs
  var pocketGeo = new THREE.TorusGeometry(0.05, 0.005, 4, 10, Math.PI*0.5);
  g.add(new THREE.Mesh(pocketGeo, wbMat)).position.set(-0.14, 0.12, 0.18);
  g.children[g.children.length-1].rotation.set(0.3, 0, 0.5);
  g.add(new THREE.Mesh(pocketGeo.clone(), wbMat)).position.set(0.14, 0.12, 0.18);
  g.children[g.children.length-1].rotation.set(0.3, 0, -0.5);
  // Inner leg seams
  var seamGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.85, 4);
  g.add(new THREE.Mesh(seamGeo, loopMat)).position.set(-0.06, -0.35, 0);
  g.add(new THREE.Mesh(seamGeo.clone(), loopMat)).position.set(0.06, -0.35, 0);
  return g;
};

DTI_3D.bottom_wide = function(c, s) {
  // Wide leg pants — dramatically flared from hip to ankle
  var g = new THREE.Group(), m = dti3DMaterial(c, s);
  // Hip area
  var hipGeo = dti3DLathe([
    [0.24, 0.1],[0.235, 0.06],[0.22, 0.02],[0.18, -0.02],
    [0.13, -0.04],[0.001, -0.05],
  ], 22);
  g.add(new THREE.Mesh(hipGeo, m)).position.set(0, 0.12, 0);
  // Wide legs — flared cylinders
  var wideGeo = dti3DTaperedLimb(0.1, 0.14, 0.95, 18);
  g.add(new THREE.Mesh(wideGeo, m)).position.set(-0.12, -0.36, 0);
  g.add(new THREE.Mesh(wideGeo.clone(), m)).position.set(0.12, -0.36, 0);
  // Waistband
  var wbMat = dti3DMaterial(dtiShade(c, -15), s);
  var wb = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.024, 8, 24), wbMat);
  wb.position.set(0, 0.2, 0); wb.rotation.x = Math.PI/2; g.add(wb);
  // Drape fold lines — sweeping curves on each leg
  var foldMat = dti3DMaterial(dtiShade(c, -8), s);
  [-0.12, 0.12].forEach(function(lx) {
    for (var fi = 0; fi < 3; fi++) {
      var fGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.8, 4);
      var f = new THREE.Mesh(fGeo, foldMat);
      f.position.set(lx + (fi-1)*0.04, -0.35, 0.06 + fi*0.02);
      g.add(f);
    }
  });
  // Hem rings
  var hemGeo = new THREE.TorusGeometry(0.14, 0.008, 6, 14);
  g.add(new THREE.Mesh(hemGeo, foldMat)).position.set(-0.12, -0.84, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  g.add(new THREE.Mesh(hemGeo.clone(), foldMat)).position.set(0.12, -0.84, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  return g;
};

// ── SHOES ──
// Feet center: y~-1.04, ankle y~-0.97

DTI_3D.shoes_boots = function(c, s) {
  // Knee-high boots — tall shaft up calves, structured foot, buckle details
  var g = new THREE.Group(), m = dti3DMaterial(c, s || 'western');
  // Boot shaft — tall cylinder up the calf
  var shaftGeo = dti3DTaperedLimb(0.075, 0.08, 0.55, 14);
  g.add(new THREE.Mesh(shaftGeo, m)).position.set(-0.12, -0.72, 0);
  g.add(new THREE.Mesh(shaftGeo.clone(), m)).position.set(0.12, -0.72, 0);
  // Boot foot — solid rounded block
  var footGeo = dti3DLathe([
    [0.001,0.08],[0.04,0.06],[0.055,0.03],[0.06,0],[0.055,-0.025],[0.035,-0.04],[0.001,-0.05]
  ], 12);
  var fL = new THREE.Mesh(footGeo, m); fL.position.set(-0.12, -1.03, 0.04); fL.rotation.x = Math.PI/2; fL.scale.set(1.2, 1.8, 1); g.add(fL);
  var fR = new THREE.Mesh(footGeo.clone(), m); fR.position.set(0.12, -1.03, 0.04); fR.rotation.x = Math.PI/2; fR.scale.set(1.2, 1.8, 1); g.add(fR);
  // Boot top cuff — rim detail
  var cuffMat = dti3DMaterial(dtiShade(c, -20), s || 'western');
  var cuffGeo = new THREE.TorusGeometry(0.08, 0.015, 6, 14);
  g.add(new THREE.Mesh(cuffGeo, cuffMat)).position.set(-0.12, -0.46, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  g.add(new THREE.Mesh(cuffGeo.clone(), cuffMat)).position.set(0.12, -0.46, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  // Buckle straps across shaft
  var strapGeo = new THREE.TorusGeometry(0.078, 0.01, 6, 12);
  g.add(new THREE.Mesh(strapGeo, cuffMat)).position.set(-0.12, -0.6, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  g.add(new THREE.Mesh(strapGeo.clone(), cuffMat)).position.set(0.12, -0.6, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  // Buckle rectangles
  var buckleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 4);
  var buckleMat = dti3DMaterial(dtiShade(c, 15), s || 'western');
  g.add(new THREE.Mesh(buckleGeo, buckleMat)).position.set(-0.12, -0.6, 0.078);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  g.add(new THREE.Mesh(buckleGeo.clone(), buckleMat)).position.set(0.12, -0.6, 0.078);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  // Thick sole
  var soleGeo = dti3DLathe([[0.001,0.06],[0.06,0.04],[0.065,0],[0.06,-0.03],[0.001,-0.04]], 12);
  var soleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, side: THREE.DoubleSide });
  var soL = new THREE.Mesh(soleGeo, soleMat); soL.position.set(-0.12, -1.09, 0.04); soL.rotation.x = Math.PI/2; soL.scale.set(1.25, 1.9, 0.6); g.add(soL);
  var soR = new THREE.Mesh(soleGeo.clone(), soleMat); soR.position.set(0.12, -1.09, 0.04); soR.rotation.x = Math.PI/2; soR.scale.set(1.25, 1.9, 0.6); g.add(soR);
  return g;
};

DTI_3D.shoes_heels = function(c, s) {
  // Strappy heels — elevated foot, thin stiletto heel, ankle straps
  var g = new THREE.Group(), m = dti3DMaterial(c, s || 'glam');
  // Raised foot platform
  var platGeo = dti3DLathe([[0.001,0.05],[0.045,0.03],[0.05,0],[0.04,-0.02],[0.001,-0.03]], 10);
  var pL = new THREE.Mesh(platGeo, m); pL.position.set(-0.12, -1.0, 0.06); pL.rotation.x = Math.PI/2; pL.scale.set(1.1, 1.5, 0.8); g.add(pL);
  var pR = new THREE.Mesh(platGeo.clone(), m); pR.position.set(0.12, -1.0, 0.06); pR.rotation.x = Math.PI/2; pR.scale.set(1.1, 1.5, 0.8); g.add(pR);
  // Stiletto heels — thin tapered cylinders
  var heelGeo = dti3DTaperedLimb(0.012, 0.008, 0.1, 8);
  var hL = new THREE.Mesh(heelGeo, m); hL.position.set(-0.12, -1.06, -0.04); hL.rotation.x = -0.12; g.add(hL);
  var hR = new THREE.Mesh(heelGeo.clone(), m); hR.position.set(0.12, -1.06, -0.04); hR.rotation.x = -0.12; g.add(hR);
  // Ankle straps — thin rings
  var strapGeo = new THREE.TorusGeometry(0.05, 0.006, 6, 14);
  g.add(new THREE.Mesh(strapGeo, m)).position.set(-0.12, -0.95, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  g.add(new THREE.Mesh(strapGeo.clone(), m)).position.set(0.12, -0.95, 0);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  // Toe strap
  var toeStrap = new THREE.TorusGeometry(0.035, 0.005, 4, 10, Math.PI);
  g.add(new THREE.Mesh(toeStrap, m)).position.set(-0.12, -1.0, 0.08);
  g.children[g.children.length-1].rotation.set(Math.PI/2, 0, 0);
  g.add(new THREE.Mesh(toeStrap.clone(), m)).position.set(0.12, -1.0, 0.08);
  g.children[g.children.length-1].rotation.set(Math.PI/2, 0, 0);
  // Strap buckle gems
  var gemGeo = new THREE.SphereGeometry(0.008, 6, 6);
  var gemMat = dti3DMaterial(dtiShade(c, 25), s || 'glam');
  g.add(new THREE.Mesh(gemGeo, gemMat)).position.set(-0.068, -0.95, 0);
  g.add(new THREE.Mesh(gemGeo.clone(), gemMat)).position.set(0.17, -0.95, 0);
  return g;
};

DTI_3D.shoes_sneakers = function(c, s) {
  // Chunky sneakers — big thick sole, padded upper, laces, tongue
  var g = new THREE.Group(), m = dti3DMaterial(c, s || 'street');
  // Shoe upper — padded rounded shape
  var upperGeo = dti3DLathe([
    [0.001,0.06],[0.05,0.05],[0.065,0.02],[0.07,0],[0.065,-0.02],[0.04,-0.04],[0.001,-0.05]
  ], 12);
  var uL = new THREE.Mesh(upperGeo, m); uL.position.set(-0.12, -1.0, 0.04); uL.rotation.x = Math.PI/2; uL.scale.set(1.2, 1.7, 1.1); g.add(uL);
  var uR = new THREE.Mesh(upperGeo.clone(), m); uR.position.set(0.12, -1.0, 0.04); uR.rotation.x = Math.PI/2; uR.scale.set(1.2, 1.7, 1.1); g.add(uR);
  // CHUNKY white sole — thick and wide
  var soleMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.45, side: THREE.DoubleSide });
  var soleGeo = dti3DLathe([
    [0.001,0.06],[0.06,0.05],[0.075,0.02],[0.08,0],[0.075,-0.02],[0.05,-0.04],[0.001,-0.05]
  ], 12);
  var soL = new THREE.Mesh(soleGeo, soleMat); soL.position.set(-0.12, -1.09, 0.04); soL.rotation.x = Math.PI/2; soL.scale.set(1.3, 1.8, 0.7); g.add(soL);
  var soR = new THREE.Mesh(soleGeo.clone(), soleMat); soR.position.set(0.12, -1.09, 0.04); soR.rotation.x = Math.PI/2; soR.scale.set(1.3, 1.8, 0.7); g.add(soR);
  // Tongue — raised tab at front
  var tongueGeo = new THREE.SphereGeometry(0.03, 8, 6, 0, Math.PI*2, 0, Math.PI*0.5);
  g.add(new THREE.Mesh(tongueGeo, m)).position.set(-0.12, -0.96, 0.08);
  g.children[g.children.length-1].scale.set(0.8, 1.2, 0.6);
  g.add(new THREE.Mesh(tongueGeo.clone(), m)).position.set(0.12, -0.96, 0.08);
  g.children[g.children.length-1].scale.set(0.8, 1.2, 0.6);
  // Laces — white lines across top
  var laceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide });
  var laceGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4);
  for (var li = 0; li < 4; li++) {
    g.add(new THREE.Mesh(laceGeo, laceMat)).position.set(-0.12, -0.98 + li*0.015, 0.09);
    g.children[g.children.length-1].rotation.z = Math.PI/2;
    g.add(new THREE.Mesh(laceGeo.clone(), laceMat)).position.set(0.12, -0.98 + li*0.015, 0.09);
    g.children[g.children.length-1].rotation.z = Math.PI/2;
  }
  // Side stripe/swoosh
  var swooshMat = dti3DMaterial(dtiShade(c, -20), s || 'street');
  var swooshGeo = new THREE.TorusGeometry(0.04, 0.004, 4, 10, Math.PI*0.6);
  g.add(new THREE.Mesh(swooshGeo, swooshMat)).position.set(-0.06, -1.02, 0.06);
  g.children[g.children.length-1].rotation.set(0, Math.PI/2, 0.3);
  g.add(new THREE.Mesh(swooshGeo.clone(), swooshMat)).position.set(0.18, -1.02, 0.06);
  g.children[g.children.length-1].rotation.set(0, -Math.PI/2, -0.3);
  return g;
};

DTI_3D.shoes_flats = function(c, s) {
  // Ballet flats — very low profile, rounded toe, little bow
  var g = new THREE.Group(), m = dti3DMaterial(c, s || 'clean');
  // Flat shoe shell — low profile
  var flatGeo = dti3DLathe([
    [0.001,0.05],[0.04,0.04],[0.055,0.02],[0.058,0],[0.05,-0.015],[0.03,-0.025],[0.001,-0.03]
  ], 12);
  var fL = new THREE.Mesh(flatGeo, m); fL.position.set(-0.12, -1.04, 0.05); fL.rotation.x = Math.PI/2; fL.scale.set(1.15, 1.7, 0.7); g.add(fL);
  var fR = new THREE.Mesh(flatGeo.clone(), m); fR.position.set(0.12, -1.04, 0.05); fR.rotation.x = Math.PI/2; fR.scale.set(1.15, 1.7, 0.7); g.add(fR);
  // Shoe opening — slightly lighter rim
  var rimGeo = new THREE.TorusGeometry(0.045, 0.005, 6, 12, Math.PI*1.2);
  var rimMat = dti3DMaterial(dtiShade(c, 15), s || 'clean');
  g.add(new THREE.Mesh(rimGeo, rimMat)).position.set(-0.12, -1.02, 0.03);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  g.add(new THREE.Mesh(rimGeo.clone(), rimMat)).position.set(0.12, -1.02, 0.03);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  // Little bow on toe
  var bowMat = dti3DMaterial(dtiShade(c, -18), s || 'clean');
  var bowGeo = new THREE.SphereGeometry(0.012, 6, 6);
  var bL = new THREE.Mesh(bowGeo, bowMat); bL.position.set(-0.12, -1.02, 0.1); bL.scale.set(1.8, 0.6, 0.8); g.add(bL);
  var bR = new THREE.Mesh(bowGeo.clone(), bowMat); bR.position.set(0.12, -1.02, 0.1); bR.scale.set(1.8, 0.6, 0.8); g.add(bR);
  // Thin sole
  var soleMat = new THREE.MeshStandardMaterial({ color: dti3DColor(dtiShade(c, -30)), roughness: 0.9, side: THREE.DoubleSide });
  var soleGeo = dti3DLathe([[0.001,0.04],[0.055,0.03],[0.06,0],[0.055,-0.02],[0.001,-0.03]], 10);
  var sL = new THREE.Mesh(soleGeo, soleMat); sL.position.set(-0.12, -1.08, 0.05); sL.rotation.x = Math.PI/2; sL.scale.set(1.2, 1.75, 0.3); g.add(sL);
  var sR = new THREE.Mesh(soleGeo.clone(), soleMat); sR.position.set(0.12, -1.08, 0.05); sR.rotation.x = Math.PI/2; sR.scale.set(1.2, 1.75, 0.3); g.add(sR);
  return g;
};

// ── ACCESSORIES ──

DTI_3D.acc_necklace = function(c, s) {
  // Pendant necklace — chain draping around neck with hanging pendant
  var g = new THREE.Group(), m = dti3DMaterial(c, s || 'boho');
  // Chain — arc torus around front of neck
  var chainGeo = new THREE.TorusGeometry(0.13, 0.005, 8, 28, Math.PI*0.85);
  var chain = new THREE.Mesh(chainGeo, m);
  chain.position.set(0, 1.06, 0.06); chain.rotation.set(-0.15, 0, 0); g.add(chain);
  // Pendant — larger gem/circle
  var pendMat = dti3DMaterial(dtiShade(c, 25), s || 'boho');
  var pend = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), pendMat);
  pend.position.set(0, 0.93, 0.16); g.add(pend);
  // Pendant highlight
  var hiMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), hiMat)).position.set(0, 0.935, 0.18);
  // Small chain beads
  var beadGeo = new THREE.SphereGeometry(0.006, 6, 4);
  for (var bi = 0; bi < 5; bi++) {
    var ang = -Math.PI*0.3 + (bi/4)*Math.PI*0.6;
    g.add(new THREE.Mesh(beadGeo, m)).position.set(Math.sin(ang)*0.13, 1.06 + Math.cos(ang)*0.13 - 0.13, 0.08);
  }
  return g;
};

DTI_3D.acc_bag = function(c, s) {
  // Structured bag with strap — visible rectangle with clasp and handle
  var g = new THREE.Group(), m = dti3DMaterial(c, s || 'street');
  // Bag body — rounded rectangle
  var bagGeo = dti3DLathe([
    [0.001,0.08],[0.06,0.07],[0.08,0.04],[0.085,0],[0.08,-0.04],[0.06,-0.07],[0.001,-0.08]
  ], 12);
  var bag = new THREE.Mesh(bagGeo, m);
  bag.position.set(0.42, 0.12, 0.04); bag.scale.set(1, 1, 0.45); g.add(bag);
  // Bag flap — top half overlay darker
  var flapMat = dti3DMaterial(dtiShade(c, -12), s || 'street');
  var flapGeo = new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI*2, 0, Math.PI*0.5);
  var flap = new THREE.Mesh(flapGeo, flapMat);
  flap.position.set(0.42, 0.16, 0.06); flap.scale.set(1.3, 0.6, 0.4); g.add(flap);
  // Strap — curved arc from bag to shoulder
  var strapGeo = new THREE.TorusGeometry(0.2, 0.008, 6, 20, Math.PI*0.7);
  g.add(new THREE.Mesh(strapGeo, m)).position.set(0.38, 0.3, 0.02);
  g.children[g.children.length-1].rotation.set(0, 0, 0.4);
  // Clasp/buckle
  var claspGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.006, 4);
  var claspMat = dti3DMaterial(dtiShade(c, -30), s || 'street');
  g.add(new THREE.Mesh(claspGeo, claspMat)).position.set(0.42, 0.16, 0.09);
  g.children[g.children.length-1].rotation.x = Math.PI/2;
  return g;
};

DTI_3D.acc_hat = function(c, s) {
  // Wide brim hat — brim disc + rounded crown, hat band
  var g = new THREE.Group(), m = dti3DMaterial(c, s || 'casual');
  // Brim — wide flat disc
  var brimGeo = dti3DLathe([[0.15,0.01],[0.28,0.005],[0.32,0],[0.28,-0.005],[0.15,-0.01]], 28);
  var brim = new THREE.Mesh(brimGeo, m);
  brim.position.set(0, 1.72, 0); g.add(brim);
  // Crown — domed top
  var crownGeo = new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI*2, 0, Math.PI*0.55);
  var crown = new THREE.Mesh(crownGeo, m);
  crown.position.set(0, 1.74, 0); crown.scale.set(1, 0.7, 1); g.add(crown);
  // Hat band — contrasting stripe
  var bandMat = dti3DMaterial(dtiShade(c, -25), s || 'casual');
  var band = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.014, 8, 24), bandMat);
  band.position.set(0, 1.74, 0); band.rotation.x = Math.PI/2; g.add(band);
  // Band bow/detail
  var bowGeo = new THREE.SphereGeometry(0.018, 6, 6);
  g.add(new THREE.Mesh(bowGeo, bandMat)).position.set(-0.158, 1.74, 0);
  return g;
};

DTI_3D.acc_earrings = function(c, s) {
  // Dangling earrings — posts + hanging gems
  var g = new THREE.Group(), m = dti3DMaterial(c, s || 'glam');
  // Posts — thin wires from ear
  var postGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4);
  g.add(new THREE.Mesh(postGeo, m)).position.set(-0.235, 1.48, 0.02);
  g.add(new THREE.Mesh(postGeo.clone(), m)).position.set(0.235, 1.48, 0.02);
  // Main gem — faceted sphere
  var gemGeo = new THREE.SphereGeometry(0.025, 8, 6);
  g.add(new THREE.Mesh(gemGeo, m)).position.set(-0.235, 1.44, 0.02);
  g.add(new THREE.Mesh(gemGeo.clone(), m)).position.set(0.235, 1.44, 0.02);
  // Highlight sparkle
  var hiMat = dti3DMaterial(dtiShade(c, 30), s || 'glam');
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), hiMat)).position.set(-0.235, 1.446, 0.035);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), hiMat)).position.set(0.235, 1.446, 0.035);
  // Small dangling drop below main gem
  var dropGeo = new THREE.SphereGeometry(0.015, 6, 6);
  g.add(new THREE.Mesh(dropGeo, m)).position.set(-0.235, 1.41, 0.02);
  g.add(new THREE.Mesh(dropGeo.clone(), m)).position.set(0.235, 1.41, 0.02);
  return g;
};

DTI_3D.acc_belt = function(c, s) {
  // Statement belt — visible band at waist with prominent buckle
  var g = new THREE.Group(), m = dti3DMaterial(c, s || 'edgy');
  // Belt band
  var beltGeo = new THREE.TorusGeometry(0.21, 0.02, 8, 28);
  var belt = new THREE.Mesh(beltGeo, m);
  belt.position.set(0, 0.25, 0); belt.rotation.x = Math.PI/2; g.add(belt);
  // Large buckle — rectangular frame
  var frameMat = dti3DMaterial(dtiShade(c, -30), s || 'edgy');
  var frame = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 4, 4), frameMat);
  frame.position.set(0, 0.25, 0.21); g.add(frame);
  // Buckle pin
  var pinGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.035, 4);
  g.add(new THREE.Mesh(pinGeo, frameMat)).position.set(0, 0.25, 0.21);
  g.children[g.children.length-1].rotation.z = Math.PI/4;
  // Belt tip hanging down
  var tipGeo = new THREE.CylinderGeometry(0.015, 0.01, 0.08, 6);
  g.add(new THREE.Mesh(tipGeo, m)).position.set(0.04, 0.2, 0.2);
  g.children[g.children.length-1].rotation.z = 0.3;
  return g;
};
