// ─── DTI 3D Avatar System ─────────────────────────────────
// Replaces the 2D SVG paper-doll with a Three.js 3D avatar.
// All game logic (state, scoring, themes, wardrobes) stays in lifestyle.html.

var dti3D = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  avatarGroup: null,   // body parts group
  bodyParts: [],       // array of body meshes for skin updates
  clothingGroup: null, // removable clothing meshes
  animFrameId: null,
  breathTime: 0,
  runwaySpin: false,
  runwayStart: 0
};

// ── Helpers ──
function dti3DColor(hex) {
  return new THREE.Color(hex);
}

function dti3DMaterial(hex, style) {
  var props = { color: dti3DColor(hex), roughness: 0.6, metalness: 0 };
  if (style === 'glam' || style === 'coquette' || style === 'romantic') {
    props.roughness = 0.15; props.metalness = 0.05;
  } else if (style === 'grunge' || style === 'casual' || style === 'street') {
    props.roughness = 0.8; props.metalness = 0;
  } else if (style === 'goth' || style === 'dark' || style === 'edgy') {
    props.roughness = 0.35; props.metalness = 0.02;
  } else if (style === 'cottage' || style === 'soft' || style === 'fairy') {
    props.roughness = 0.9; props.metalness = 0;
  } else if (style === 'academia' || style === 'preppy') {
    props.roughness = 0.75; props.metalness = 0;
  } else if (style === 'old money' || style === 'clean' || style === 'french') {
    props.roughness = 0.5; props.metalness = 0.01;
  } else if (style === 'western' || style === 'autumn') {
    props.roughness = 0.4; props.metalness = 0.02;
  }
  return new THREE.MeshStandardMaterial(props);
}

function dti3DSkinMat(hex) {
  return new THREE.MeshStandardMaterial({
    color: dti3DColor(hex),
    roughness: 0.6,
    metalness: 0
  });
}

// ── Scene Initialization ──
function dti3DInitScene() {
  var container = document.getElementById('dti3DContainer');
  if (!container) return;

  // Clean up previous
  if (dti3D.renderer) {
    if (dti3D.animFrameId) cancelAnimationFrame(dti3D.animFrameId);
    dti3D.renderer.dispose();
    container.innerHTML = '';
  }

  var w = container.clientWidth || 300;
  var h = container.clientHeight || 450;

  // Scene
  var scene = new THREE.Scene();
  dti3D.scene = scene;

  // Background color — soft cream matching page theme
  scene.background = new THREE.Color('#f0ebe3');

  // Camera — slightly above eye level, 3/4 angle
  var camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
  camera.position.set(0, 0.4, 4.5);
  camera.lookAt(0, 0.2, 0);
  dti3D.camera = camera;

  // Renderer
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  if (renderer.outputColorSpace !== undefined) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if (renderer.outputEncoding !== undefined) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  container.appendChild(renderer.domElement);
  dti3D.renderer = renderer;

  // Lighting
  var ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  var keyLight = new THREE.DirectionalLight(0xfff5e0, 1.0);
  keyLight.position.set(-2, 3, 2);
  scene.add(keyLight);

  var fillLight = new THREE.DirectionalLight(0xd0e0ff, 0.3);
  fillLight.position.set(2, -1, 1);
  scene.add(fillLight);

  var rimLight = new THREE.PointLight(0xffffff, 0.4, 10);
  rimLight.position.set(0, 1, -3);
  scene.add(rimLight);

  // Ground plane — subtle shadow circle
  var groundGeo = new THREE.CircleGeometry(0.8, 32);
  var groundMat = new THREE.MeshStandardMaterial({
    color: 0x000000, transparent: true, opacity: 0.06, roughness: 1, metalness: 0
  });
  var ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.95;
  scene.add(ground);

  // OrbitControls
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI / 2.2;
  controls.maxPolarAngle = Math.PI / 1.8;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.0;
  controls.target.set(0, 0.2, 0);
  dti3D.controls = controls;

  // Build avatar
  dti3DBuildAvatar();

  // Clothing group
  dti3D.clothingGroup = new THREE.Group();
  dti3D.avatarGroup.add(dti3D.clothingGroup);

  // Start animation loop
  dti3D.breathTime = 0;
  dti3DAnimate();

  // Responsive
  var ro = new ResizeObserver(function() {
    var w2 = container.clientWidth;
    var h2 = container.clientHeight;
    if (w2 > 0 && h2 > 0) {
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    }
  });
  ro.observe(container);
}

// ── Build Avatar Body ──
function dti3DBuildAvatar() {
  var group = new THREE.Group();
  dti3D.bodyParts = [];

  var skinColor = '#b88a60'; // default medium, will be updated by dtiSetSkin
  var mat = dti3DSkinMat(skinColor);
  var underwearMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8, metalness: 0 });

  function addPart(geo, material, pos, rot, scale) {
    var mesh = new THREE.Mesh(geo, material);
    if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    group.add(mesh);
    if (material === mat) dti3D.bodyParts.push(mesh);
    return mesh;
  }

  // Head — rounded box
  var headGeo = new THREE.BoxGeometry(0.48, 0.56, 0.46, 4, 4, 4);
  dti3DRoundVertices(headGeo, 0.12);
  addPart(headGeo, mat, [0, 1.42, 0]);

  // Subtle face indent on head
  var faceGeo = new THREE.SphereGeometry(0.18, 12, 12, 0, Math.PI);
  var faceMesh = addPart(faceGeo, mat, [0, 1.38, 0.2]);
  faceMesh.scale.set(1, 1.2, 0.3);

  // Cheek blush (subtle)
  var blushMat = new THREE.MeshStandardMaterial({ color: 0xc8a090, transparent: true, opacity: 0.15, roughness: 0.9, metalness: 0 });
  var blushGeo = new THREE.SphereGeometry(0.06, 8, 8);
  addPart(blushGeo, blushMat, [-0.15, 1.36, 0.2]);
  addPart(blushGeo, blushMat, [0.15, 1.36, 0.2]);

  // Neck
  var neckGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.16, 12);
  addPart(neckGeo, mat, [0, 1.08, 0]);

  // Torso — tapered: wider shoulders, narrow waist, wider hips (feminine)
  var torsoShape = new THREE.Shape();
  // Build as 2D cross-section then lathe/extrude
  var torsoGeo = dti3DTorsoGeometry();
  addPart(torsoGeo, mat, [0, 0.5, 0]);

  // Sports bra (default underwear)
  var braGeo = new THREE.BoxGeometry(0.52, 0.16, 0.3, 2, 2, 2);
  dti3DRoundVertices(braGeo, 0.04);
  addPart(braGeo, underwearMat, [0, 0.88, 0.02]);

  // Bra straps
  var strapGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6);
  addPart(strapGeo, underwearMat, [-0.14, 1.0, 0.04], [0, 0, 0.15]);
  addPart(strapGeo, underwearMat, [0.14, 1.0, 0.04], [0, 0, -0.15]);

  // Shorts (default underwear)
  var shortsGeo = new THREE.BoxGeometry(0.4, 0.18, 0.26, 2, 2, 2);
  dti3DRoundVertices(shortsGeo, 0.04);
  addPart(shortsGeo, underwearMat, [0, 0.18, 0]);

  // Upper arms
  var upperArmGeo = new THREE.CylinderGeometry(0.065, 0.06, 0.38, 10);
  // Shoulder spheres
  var shoulderGeo = new THREE.SphereGeometry(0.075, 10, 10);
  addPart(shoulderGeo, mat, [-0.32, 0.92, 0]);
  addPart(shoulderGeo, mat, [0.32, 0.92, 0]);
  addPart(upperArmGeo, mat, [-0.32, 0.7, 0], [0, 0, 0.08]);
  addPart(upperArmGeo, mat, [0.32, 0.7, 0], [0, 0, -0.08]);

  // Elbow spheres
  var elbowGeo = new THREE.SphereGeometry(0.058, 8, 8);
  addPart(elbowGeo, mat, [-0.34, 0.5, 0]);
  addPart(elbowGeo, mat, [0.34, 0.5, 0]);

  // Lower arms
  var lowerArmGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.36, 10);
  addPart(lowerArmGeo, mat, [-0.35, 0.28, 0.02], [0.08, 0, 0.05]);
  addPart(lowerArmGeo, mat, [0.35, 0.28, 0.02], [0.08, 0, -0.05]);

  // Hands
  var handGeo = new THREE.SphereGeometry(0.05, 8, 8);
  addPart(handGeo, mat, [-0.36, 0.08, 0.04]);
  addPart(handGeo, mat, [0.36, 0.08, 0.04]);

  // Hip spheres
  var hipGeo = new THREE.SphereGeometry(0.09, 10, 10);
  addPart(hipGeo, mat, [-0.13, 0.14, 0]);
  addPart(hipGeo, mat, [0.13, 0.14, 0]);

  // Upper legs
  var upperLegGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.5, 12);
  addPart(upperLegGeo, mat, [-0.13, -0.18, 0]);
  addPart(upperLegGeo, mat, [0.13, -0.18, 0]);

  // Knee spheres
  var kneeGeo = new THREE.SphereGeometry(0.07, 8, 8);
  addPart(kneeGeo, mat, [-0.13, -0.46, 0]);
  addPart(kneeGeo, mat, [0.13, -0.46, 0]);

  // Lower legs
  var lowerLegGeo = new THREE.CylinderGeometry(0.07, 0.055, 0.52, 12);
  addPart(lowerLegGeo, mat, [-0.13, -0.76, 0]);
  addPart(lowerLegGeo, mat, [0.13, -0.76, 0]);

  // Feet
  var footGeo = new THREE.BoxGeometry(0.12, 0.06, 0.22, 2, 2, 2);
  dti3DRoundVertices(footGeo, 0.02);
  addPart(footGeo, mat, [-0.13, -1.05, 0.04]);
  addPart(footGeo, mat, [0.13, -1.05, 0.04]);

  dti3D.avatarGroup = group;
  dti3D.scene.add(group);
}

// ── Torso Geometry — custom hourglass shape ──
function dti3DTorsoGeometry() {
  // Use LatheGeometry with custom profile for hourglass
  var points = [];
  // Build right-side profile from bottom (hips) to top (shoulders)
  // y goes from 0 (hips) to 0.8 (shoulders), x is the radius
  var profile = [
    [0.22, 0],    // hips wide
    [0.21, 0.05],
    [0.19, 0.1],
    [0.16, 0.18], // waist narrow
    [0.15, 0.22],
    [0.16, 0.28],
    [0.2, 0.35],  // ribcage
    [0.24, 0.42], // chest
    [0.26, 0.5],  // shoulders wide
    [0.27, 0.55],
    [0.25, 0.6],
    [0.18, 0.66],
    [0.1, 0.7],
    [0.09, 0.72],  // neck base
  ];
  for (var i = 0; i < profile.length; i++) {
    points.push(new THREE.Vector2(profile[i][0], profile[i][1]));
  }
  var geo = new THREE.LatheGeometry(points, 24);
  // Center vertically: shift so midpoint aligns
  geo.translate(0, -0.08, 0);
  return geo;
}

// ── Round vertices helper (for BoxGeometry → rounded box) ──
function dti3DRoundVertices(geo, factor) {
  // Blend each vertex toward a normalized (spherical) version
  var pos = geo.attributes.position;
  var v = new THREE.Vector3();
  var n = new THREE.Vector3();
  // Compute bounding box to get half-extents
  geo.computeBoundingBox();
  var bb = geo.boundingBox;
  var hx = (bb.max.x - bb.min.x) / 2;
  var hy = (bb.max.y - bb.min.y) / 2;
  var hz = (bb.max.z - bb.min.z) / 2;
  var maxR = Math.max(hx, hy, hz);
  for (var i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Get the spherical target at same "radius" as distance from center
    n.copy(v);
    var len = n.length();
    if (len > 0.0001) {
      n.normalize().multiplyScalar(maxR * 0.85);
      // Lerp toward sphere
      v.lerp(n, factor);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// ── Animation Loop ──
function dti3DAnimate() {
  dti3D.animFrameId = requestAnimationFrame(dti3DAnimate);

  if (!dti3D.renderer || !dti3D.scene || !dti3D.camera) return;

  // Breathing animation — subtle torso Y scale oscillation
  dti3D.breathTime += 0.02;
  if (dti3D.avatarGroup) {
    var breathScale = 1 + Math.sin(dti3D.breathTime) * 0.003;
    dti3D.avatarGroup.scale.y = breathScale;
  }

  // Runway spin (360 deg after submit)
  if (dti3D.runwaySpin && dti3D.avatarGroup) {
    var elapsed = (Date.now() - dti3D.runwayStart) / 1000;
    if (elapsed < 3) {
      dti3D.avatarGroup.rotation.y = (elapsed / 3) * Math.PI * 2;
    } else {
      dti3D.avatarGroup.rotation.y = 0;
      dti3D.runwaySpin = false;
    }
  }

  dti3D.controls.update();
  dti3D.renderer.render(dti3D.scene, dti3D.camera);
}

// ── Trigger runway spin ──
function dti3DRunwaySpin() {
  dti3D.runwaySpin = true;
  dti3D.runwayStart = Date.now();
}

// ── Update Skin ──
function dti3DUpdateSkin(skinTone) {
  var baseColor = dti3DColor(skinTone.base);
  dti3D.bodyParts.forEach(function(mesh) {
    mesh.material.color.copy(baseColor);
    mesh.material.needsUpdate = true;
  });
}

// ── Clear Clothing ──
function dti3DClearClothing() {
  if (!dti3D.clothingGroup) return;
  while (dti3D.clothingGroup.children.length > 0) {
    var child = dti3D.clothingGroup.children[0];
    dti3D.clothingGroup.remove(child);
    child.traverse(function(obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(function(m) { m.dispose(); });
        else obj.material.dispose();
      }
    });
  }
}

// ── Add Clothing Item ──
function dti3DAddClothing(svgKey, color, style) {
  if (!DTI_3D[svgKey]) return null;
  var meshGroup = DTI_3D[svgKey](color, style);
  if (meshGroup) {
    // Fade in animation
    meshGroup.traverse(function(obj) {
      if (obj.material) {
        obj.material.transparent = true;
        obj.material.opacity = 0;
      }
    });
    dti3D.clothingGroup.add(meshGroup);
    dti3DFadeIn(meshGroup, 300);
  }
  return meshGroup;
}

// ── Fade In ──
function dti3DFadeIn(group, durationMs) {
  var start = Date.now();
  function tick() {
    var t = Math.min(1, (Date.now() - start) / durationMs);
    group.traverse(function(obj) {
      if (obj.material && obj.material.transparent) {
        obj.material.opacity = t;
        if (t >= 1) obj.material.transparent = false;
      }
    });
    if (t < 1) requestAnimationFrame(tick);
  }
  tick();
}

// ═══════════════════════════════════════════════════════════
// DTI_3D — 3D Clothing Mesh Generators
// Each function(color, style) returns a THREE.Group
// ═══════════════════════════════════════════════════════════
var DTI_3D = {};

// ── HAIR ──
// Head is at y=1.42, radius ~0.24x0.28x0.23. Top of head ~1.7

DTI_3D.hair = function(color, style) {
  // Straight with curtain bangs — hair cap + side panels hanging to shoulders
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Hair cap on head
  var capGeo = new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.52, -0.01);
  cap.scale.set(1, 1, 0.95);
  g.add(cap);

  // Side hair — left flowing down
  var sideGeo = new THREE.BoxGeometry(0.08, 0.7, 0.14, 1, 4, 1);
  dti3DRoundVertices(sideGeo, 0.02);
  var left = new THREE.Mesh(sideGeo, mat);
  left.position.set(-0.24, 1.05, -0.02);
  g.add(left);
  var right = new THREE.Mesh(sideGeo.clone(), mat);
  right.position.set(0.24, 1.05, -0.02);
  g.add(right);

  // Back hair panel
  var backGeo = new THREE.BoxGeometry(0.46, 0.65, 0.08, 2, 4, 1);
  dti3DRoundVertices(backGeo, 0.02);
  var back = new THREE.Mesh(backGeo, mat);
  back.position.set(0, 1.08, -0.18);
  g.add(back);

  // Curtain bangs
  var bangGeo = new THREE.BoxGeometry(0.14, 0.12, 0.1, 2, 2, 1);
  dti3DRoundVertices(bangGeo, 0.02);
  var bangL = new THREE.Mesh(bangGeo, mat);
  bangL.position.set(-0.16, 1.52, 0.2);
  bangL.rotation.z = 0.15;
  g.add(bangL);
  var bangR = new THREE.Mesh(bangGeo.clone(), mat);
  bangR.position.set(0.16, 1.52, 0.2);
  bangR.rotation.z = -0.15;
  g.add(bangR);

  return g;
};

DTI_3D.hair_short = function(color, style) {
  // Short layered bob — cap + short side pieces with flip
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  var capGeo = new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.52, -0.01);
  g.add(cap);

  // Short side pieces — chin length
  var sideGeo = new THREE.BoxGeometry(0.09, 0.35, 0.14, 1, 3, 1);
  dti3DRoundVertices(sideGeo, 0.02);
  var left = new THREE.Mesh(sideGeo, mat);
  left.position.set(-0.24, 1.22, 0);
  g.add(left);
  var right = new THREE.Mesh(sideGeo.clone(), mat);
  right.position.set(0.24, 1.22, 0);
  g.add(right);

  // Back — short
  var backGeo = new THREE.BoxGeometry(0.44, 0.3, 0.08, 2, 3, 1);
  dti3DRoundVertices(backGeo, 0.02);
  var back = new THREE.Mesh(backGeo, mat);
  back.position.set(0, 1.26, -0.18);
  g.add(back);

  // Curtain bangs
  var bangGeo = new THREE.BoxGeometry(0.14, 0.1, 0.1, 2, 2, 1);
  dti3DRoundVertices(bangGeo, 0.02);
  var bangL = new THREE.Mesh(bangGeo, mat);
  bangL.position.set(-0.14, 1.52, 0.19);
  bangL.rotation.z = 0.12;
  g.add(bangL);
  var bangR = new THREE.Mesh(bangGeo.clone(), mat);
  bangR.position.set(0.14, 1.52, 0.19);
  bangR.rotation.z = -0.12;
  g.add(bangR);

  return g;
};

DTI_3D.hair_bun = function(color, style) {
  // High messy bun with face-framing tendrils
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Cap
  var capGeo = new THREE.SphereGeometry(0.27, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.52, 0);
  g.add(cap);

  // Big messy bun on top
  var bunGeo = new THREE.SphereGeometry(0.16, 12, 10);
  var bun = new THREE.Mesh(bunGeo, mat);
  bun.position.set(0, 1.82, -0.06);
  bun.scale.set(1, 0.85, 1);
  g.add(bun);

  // Smaller accent sphere
  var bun2Geo = new THREE.SphereGeometry(0.1, 10, 8);
  var bun2 = new THREE.Mesh(bun2Geo, mat);
  bun2.position.set(0.06, 1.86, -0.02);
  g.add(bun2);

  // Face framing tendrils
  var tendrilGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.3, 6);
  var tL = new THREE.Mesh(tendrilGeo, mat);
  tL.position.set(-0.22, 1.3, 0.12);
  tL.rotation.z = 0.1;
  g.add(tL);
  var tR = new THREE.Mesh(tendrilGeo.clone(), mat);
  tR.position.set(0.22, 1.3, 0.12);
  tR.rotation.z = -0.1;
  g.add(tR);

  return g;
};

DTI_3D.hair_long = function(color, style) {
  // Long flowing waves to waist
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Cap
  var capGeo = new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.52, -0.01);
  g.add(cap);

  // Long side hair — left (down to waist level ~0.2y)
  var sideGeo = new THREE.BoxGeometry(0.1, 1.2, 0.14, 1, 6, 1);
  dti3DRoundVertices(sideGeo, 0.02);
  var left = new THREE.Mesh(sideGeo, mat);
  left.position.set(-0.26, 0.8, -0.02);
  g.add(left);
  var right = new THREE.Mesh(sideGeo.clone(), mat);
  right.position.set(0.26, 0.8, -0.02);
  g.add(right);

  // Long back hair
  var backGeo = new THREE.BoxGeometry(0.48, 1.2, 0.1, 2, 6, 1);
  dti3DRoundVertices(backGeo, 0.02);
  var back = new THREE.Mesh(backGeo, mat);
  back.position.set(0, 0.82, -0.2);
  g.add(back);

  // Curtain bangs
  var bangGeo = new THREE.BoxGeometry(0.14, 0.12, 0.1, 2, 2, 1);
  dti3DRoundVertices(bangGeo, 0.02);
  var bangL = new THREE.Mesh(bangGeo, mat);
  bangL.position.set(-0.16, 1.52, 0.2);
  bangL.rotation.z = 0.15;
  g.add(bangL);
  var bangR = new THREE.Mesh(bangGeo.clone(), mat);
  bangR.position.set(0.16, 1.52, 0.2);
  bangR.rotation.z = -0.15;
  g.add(bangR);

  // Wavy ends — slightly wider at bottom
  var wavyGeo = new THREE.SphereGeometry(0.08, 8, 6);
  var w1 = new THREE.Mesh(wavyGeo, mat);
  w1.position.set(-0.2, 0.22, -0.15);
  w1.scale.set(1.5, 0.6, 1);
  g.add(w1);
  var w2 = new THREE.Mesh(wavyGeo.clone(), mat);
  w2.position.set(0.2, 0.22, -0.15);
  w2.scale.set(1.5, 0.6, 1);
  g.add(w2);

  return g;
};

DTI_3D.hair_braids = function(color, style) {
  // Twin braids — chunky weave segments
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Cap
  var capGeo = new THREE.SphereGeometry(0.27, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.52, 0);
  g.add(cap);

  // Braid segments (chain of spheres)
  var segGeo = new THREE.SphereGeometry(0.06, 8, 6);
  for (var i = 0; i < 8; i++) {
    var y = 1.3 - i * 0.13;
    var wobble = (i % 2 === 0) ? 0.02 : -0.02;
    // Left braid
    var sL = new THREE.Mesh(segGeo, mat);
    sL.position.set(-0.22 + wobble, y, 0.02);
    sL.scale.set(1, 0.8, 0.9);
    g.add(sL);
    // Right braid
    var sR = new THREE.Mesh(segGeo.clone(), mat);
    sR.position.set(0.22 - wobble, y, 0.02);
    sR.scale.set(1, 0.8, 0.9);
    g.add(sR);
  }

  // Braid ties
  var tieGeo = new THREE.TorusGeometry(0.04, 0.015, 6, 12);
  var tieMat = dti3DMaterial(dtiShade(color, -40), style);
  var tieL = new THREE.Mesh(tieGeo, tieMat);
  tieL.position.set(-0.22, 0.28, 0.02);
  g.add(tieL);
  var tieR = new THREE.Mesh(tieGeo.clone(), tieMat);
  tieR.position.set(0.22, 0.28, 0.02);
  g.add(tieR);

  return g;
};

DTI_3D.hair_ponytail = function(color, style) {
  // High ponytail — slicked cap + tail flowing behind
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Tight cap
  var capGeo = new THREE.SphereGeometry(0.27, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.5, 0);
  g.add(cap);

  // Hair tie
  var tieGeo = new THREE.TorusGeometry(0.06, 0.02, 8, 12);
  var tieMat = dti3DMaterial(dtiShade(color, -50), style);
  var tie = new THREE.Mesh(tieGeo, tieMat);
  tie.position.set(0, 1.72, -0.1);
  tie.rotation.x = Math.PI / 4;
  g.add(tie);

  // Ponytail — chain of tapered cylinders going down the back
  var tailGeo = new THREE.CylinderGeometry(0.08, 0.05, 0.9, 10);
  var tail = new THREE.Mesh(tailGeo, mat);
  tail.position.set(0, 1.15, -0.22);
  tail.rotation.x = 0.2;
  g.add(tail);

  // Tail end wisp
  var wispGeo = new THREE.SphereGeometry(0.05, 8, 6);
  var wisp = new THREE.Mesh(wispGeo, mat);
  wisp.position.set(0, 0.68, -0.18);
  wisp.scale.set(1, 0.6, 1);
  g.add(wisp);

  return g;
};

DTI_3D.hair_spacebuns = function(color, style) {
  // Two buns on top with loose strands
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Cap
  var capGeo = new THREE.SphereGeometry(0.27, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.52, 0);
  g.add(cap);

  // Left bun
  var bunGeo = new THREE.SphereGeometry(0.13, 10, 10);
  var bunL = new THREE.Mesh(bunGeo, mat);
  bunL.position.set(-0.18, 1.76, 0);
  g.add(bunL);

  // Right bun
  var bunR = new THREE.Mesh(bunGeo.clone(), mat);
  bunR.position.set(0.18, 1.76, 0);
  g.add(bunR);

  // Loose strands
  var strandGeo = new THREE.CylinderGeometry(0.02, 0.012, 0.28, 6);
  var sL = new THREE.Mesh(strandGeo, mat);
  sL.position.set(-0.22, 1.28, 0.12);
  sL.rotation.z = 0.1;
  g.add(sL);
  var sR = new THREE.Mesh(strandGeo.clone(), mat);
  sR.position.set(0.22, 1.28, 0.12);
  sR.rotation.z = -0.1;
  g.add(sR);

  return g;
};

DTI_3D.hair_wolfcut = function(color, style) {
  // Wolf cut — big volume on top, choppy layers, mullet-like
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Big voluminous cap
  var capGeo = new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.54, -0.01);
  cap.scale.set(1.05, 1.05, 1);
  g.add(cap);

  // Choppy side layers — medium length
  var sideGeo = new THREE.BoxGeometry(0.1, 0.5, 0.14, 1, 4, 1);
  dti3DRoundVertices(sideGeo, 0.02);
  var left = new THREE.Mesh(sideGeo, mat);
  left.position.set(-0.26, 1.12, 0);
  g.add(left);
  var right = new THREE.Mesh(sideGeo.clone(), mat);
  right.position.set(0.26, 1.12, 0);
  g.add(right);

  // Choppy back layers
  var backGeo = new THREE.BoxGeometry(0.46, 0.5, 0.08, 2, 4, 1);
  dti3DRoundVertices(backGeo, 0.02);
  var back = new THREE.Mesh(backGeo, mat);
  back.position.set(0, 1.12, -0.2);
  g.add(back);

  // Curtain bangs — choppier/bigger
  var bangGeo = new THREE.BoxGeometry(0.16, 0.14, 0.1, 2, 2, 1);
  dti3DRoundVertices(bangGeo, 0.02);
  var bangL = new THREE.Mesh(bangGeo, mat);
  bangL.position.set(-0.15, 1.54, 0.2);
  bangL.rotation.z = 0.2;
  g.add(bangL);
  var bangR = new THREE.Mesh(bangGeo.clone(), mat);
  bangR.position.set(0.15, 1.54, 0.2);
  bangR.rotation.z = -0.2;
  g.add(bangR);

  // Wispy choppy ends
  var wispGeo = new THREE.SphereGeometry(0.04, 6, 6);
  for (var i = 0; i < 4; i++) {
    var wL = new THREE.Mesh(wispGeo, mat);
    wL.position.set(-0.28 + Math.random() * 0.06, 0.85 + Math.random() * 0.1, -0.05 + Math.random() * 0.1);
    g.add(wL);
    var wR = new THREE.Mesh(wispGeo.clone(), mat);
    wR.position.set(0.22 + Math.random() * 0.06, 0.85 + Math.random() * 0.1, -0.05 + Math.random() * 0.1);
    g.add(wR);
  }

  return g;
};

DTI_3D.hair_curls = function(color, style) {
  // Long bouncy curls — volume + spiral curl spheres at ends
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Big voluminous cap
  var capGeo = new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.54, -0.01);
  cap.scale.set(1.05, 1, 1);
  g.add(cap);

  // Curly side hair
  var curlGeo = new THREE.SphereGeometry(0.06, 8, 6);
  var positions = [
    // Left side curls
    [-0.28, 1.3, 0.02], [-0.3, 1.15, 0.04], [-0.28, 1.0, 0.02],
    [-0.26, 0.85, 0.04], [-0.28, 0.7, 0.02], [-0.26, 0.55, 0.04],
    [-0.24, 0.4, 0.02], [-0.26, 0.28, 0.04],
    // Right side curls
    [0.28, 1.3, 0.02], [0.3, 1.15, 0.04], [0.28, 1.0, 0.02],
    [0.26, 0.85, 0.04], [0.28, 0.7, 0.02], [0.26, 0.55, 0.04],
    [0.24, 0.4, 0.02], [0.26, 0.28, 0.04],
    // Back curls
    [-0.15, 0.9, -0.22], [0, 0.85, -0.24], [0.15, 0.9, -0.22],
    [-0.1, 0.65, -0.2], [0.1, 0.65, -0.2], [0, 0.5, -0.22],
    [-0.12, 0.35, -0.2], [0.12, 0.35, -0.2]
  ];
  for (var i = 0; i < positions.length; i++) {
    var curl = new THREE.Mesh(curlGeo, mat);
    curl.position.set(positions[i][0], positions[i][1], positions[i][2]);
    curl.scale.set(1 + Math.random() * 0.3, 0.8 + Math.random() * 0.4, 1 + Math.random() * 0.3);
    g.add(curl);
  }

  // Curtain bangs
  var bangGeo = new THREE.BoxGeometry(0.14, 0.12, 0.1, 2, 2, 1);
  dti3DRoundVertices(bangGeo, 0.02);
  var bangL = new THREE.Mesh(bangGeo, mat);
  bangL.position.set(-0.16, 1.52, 0.2);
  bangL.rotation.z = 0.15;
  g.add(bangL);
  var bangR = new THREE.Mesh(bangGeo.clone(), mat);
  bangR.position.set(0.16, 1.52, 0.2);
  bangR.rotation.z = -0.15;
  g.add(bangR);

  return g;
};

DTI_3D.hair_ribbon = function(color, style) {
  // Long straight hair with big ribbon bow on top
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Cap + side hair + back (same as hair straight)
  var capGeo = new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  var cap = new THREE.Mesh(capGeo, mat);
  cap.position.set(0, 1.52, -0.01);
  g.add(cap);

  var sideGeo = new THREE.BoxGeometry(0.08, 0.7, 0.14, 1, 4, 1);
  dti3DRoundVertices(sideGeo, 0.02);
  g.add(new THREE.Mesh(sideGeo, mat)).position.set(-0.24, 1.05, -0.02);
  g.add(new THREE.Mesh(sideGeo.clone(), mat)).position.set(0.24, 1.05, -0.02);

  var backGeo = new THREE.BoxGeometry(0.46, 0.65, 0.08, 2, 4, 1);
  dti3DRoundVertices(backGeo, 0.02);
  g.add(new THREE.Mesh(backGeo, mat)).position.set(0, 1.08, -0.18);

  // BIG RIBBON BOW — pink
  var ribbonMat = new THREE.MeshStandardMaterial({ color: 0xe8829a, roughness: 0.3, metalness: 0.02 });
  // Left loop
  var loopGeo = new THREE.SphereGeometry(0.1, 10, 8);
  var loopL = new THREE.Mesh(loopGeo, ribbonMat);
  loopL.position.set(-0.12, 1.74, 0.06);
  loopL.scale.set(1.3, 0.7, 0.6);
  g.add(loopL);
  // Right loop
  var loopR = new THREE.Mesh(loopGeo.clone(), ribbonMat);
  loopR.position.set(0.12, 1.74, 0.06);
  loopR.scale.set(1.3, 0.7, 0.6);
  g.add(loopR);
  // Center knot
  var knotGeo = new THREE.SphereGeometry(0.04, 8, 8);
  var knotMat = new THREE.MeshStandardMaterial({ color: 0xd06880, roughness: 0.3, metalness: 0.02 });
  var knot = new THREE.Mesh(knotGeo, knotMat);
  knot.position.set(0, 1.74, 0.08);
  g.add(knot);
  // Ribbon tails
  var tailGeo = new THREE.CylinderGeometry(0.02, 0.01, 0.2, 6);
  var tailL = new THREE.Mesh(tailGeo, ribbonMat);
  tailL.position.set(-0.06, 1.62, 0.06);
  tailL.rotation.z = 0.3;
  g.add(tailL);
  var tailR = new THREE.Mesh(tailGeo.clone(), ribbonMat);
  tailR.position.set(0.06, 1.62, 0.06);
  tailR.rotation.z = -0.3;
  g.add(tailR);

  return g;
};

// ── TOPS ──
// Torso center y~0.5, shoulders y~0.92, waist y~0.18
// Shoulders x: +/-0.32, torso radius ~0.22 at hips, ~0.15 at waist, ~0.26 at chest

DTI_3D.top_fitted = function(color, style) {
  // Fitted top — hugs torso, short sleeves, collar
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Main torso wrap — LatheGeometry matching body closely
  var pts = [
    new THREE.Vector2(0.23, 0),
    new THREE.Vector2(0.22, 0.05),
    new THREE.Vector2(0.2, 0.1),
    new THREE.Vector2(0.17, 0.18),
    new THREE.Vector2(0.16, 0.22),
    new THREE.Vector2(0.17, 0.28),
    new THREE.Vector2(0.21, 0.35),
    new THREE.Vector2(0.25, 0.42),
    new THREE.Vector2(0.28, 0.5),
    new THREE.Vector2(0.29, 0.55),
    new THREE.Vector2(0.27, 0.6),
    new THREE.Vector2(0.2, 0.66),
  ];
  var bodyGeo = new THREE.LatheGeometry(pts, 24);
  bodyGeo.translate(0, -0.08, 0);
  var body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 0.5, 0);
  g.add(body);

  // Sleeves — short cylinders on shoulders
  var sleeveGeo = new THREE.CylinderGeometry(0.08, 0.075, 0.2, 10);
  var sleeveL = new THREE.Mesh(sleeveGeo, mat);
  sleeveL.position.set(-0.32, 0.8, 0);
  sleeveL.rotation.z = 0.3;
  g.add(sleeveL);
  var sleeveR = new THREE.Mesh(sleeveGeo.clone(), mat);
  sleeveR.position.set(0.32, 0.8, 0);
  sleeveR.rotation.z = -0.3;
  g.add(sleeveR);

  // Collar — small torus at neckline
  var collarGeo = new THREE.TorusGeometry(0.1, 0.02, 8, 16, Math.PI);
  var collar = new THREE.Mesh(collarGeo, mat);
  collar.position.set(0, 1.02, 0.06);
  collar.rotation.x = -0.3;
  g.add(collar);

  // Buttons — tiny spheres down center
  var btnGeo = new THREE.SphereGeometry(0.012, 6, 6);
  var btnMat = dti3DMaterial(dtiShade(color, -30), style);
  for (var i = 0; i < 4; i++) {
    var btn = new THREE.Mesh(btnGeo, btnMat);
    btn.position.set(0, 0.85 - i * 0.12, 0.22);
    g.add(btn);
  }

  return g;
};

DTI_3D.top_crop = function(color, style) {
  // Cropped top — stops at midriff, puff sleeves
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Shorter torso wrap — only ribcage to shoulders
  var pts = [
    new THREE.Vector2(0.17, 0),    // midriff (waist area)
    new THREE.Vector2(0.18, 0.06),
    new THREE.Vector2(0.21, 0.12),
    new THREE.Vector2(0.25, 0.18),
    new THREE.Vector2(0.28, 0.24),
    new THREE.Vector2(0.29, 0.29),
    new THREE.Vector2(0.27, 0.34),
    new THREE.Vector2(0.2, 0.4),
  ];
  var bodyGeo = new THREE.LatheGeometry(pts, 24);
  bodyGeo.translate(0, 0.18, 0);
  var body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 0.5, 0);
  g.add(body);

  // Puff sleeves
  var puffGeo = new THREE.SphereGeometry(0.09, 10, 8);
  var puffL = new THREE.Mesh(puffGeo, mat);
  puffL.position.set(-0.33, 0.86, 0);
  puffL.scale.set(1, 0.8, 0.9);
  g.add(puffL);
  var puffR = new THREE.Mesh(puffGeo.clone(), mat);
  puffR.position.set(0.33, 0.86, 0);
  puffR.scale.set(1, 0.8, 0.9);
  g.add(puffR);

  // Ruched hem at bottom
  var hemGeo = new THREE.TorusGeometry(0.17, 0.015, 8, 24);
  var hem = new THREE.Mesh(hemGeo, mat);
  hem.position.set(0, 0.68, 0);
  hem.rotation.x = Math.PI / 2;
  g.add(hem);

  // Center bow
  var bowGeo = new THREE.SphereGeometry(0.02, 6, 6);
  var bowMat = dti3DMaterial(dtiShade(color, -30), style);
  var bow = new THREE.Mesh(bowGeo, bowMat);
  bow.position.set(0, 1.0, 0.2);
  g.add(bow);

  return g;
};

DTI_3D.top_oversized = function(color, style) {
  // Oversized hoodie/sweatshirt — big boxy, kangaroo pocket
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Big boxy body — wider than fitted
  var pts = [
    new THREE.Vector2(0.26, 0),
    new THREE.Vector2(0.26, 0.1),
    new THREE.Vector2(0.25, 0.2),
    new THREE.Vector2(0.25, 0.3),
    new THREE.Vector2(0.27, 0.4),
    new THREE.Vector2(0.3, 0.5),
    new THREE.Vector2(0.32, 0.55),
    new THREE.Vector2(0.3, 0.6),
    new THREE.Vector2(0.24, 0.66),
    new THREE.Vector2(0.16, 0.72),
  ];
  var bodyGeo = new THREE.LatheGeometry(pts, 24);
  bodyGeo.translate(0, -0.1, 0);
  var body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 0.5, 0);
  g.add(body);

  // Big sleeves
  var sleeveGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.45, 10);
  var sleeveL = new THREE.Mesh(sleeveGeo, mat);
  sleeveL.position.set(-0.38, 0.68, 0);
  sleeveL.rotation.z = 0.4;
  g.add(sleeveL);
  var sleeveR = new THREE.Mesh(sleeveGeo.clone(), mat);
  sleeveR.position.set(0.38, 0.68, 0);
  sleeveR.rotation.z = -0.4;
  g.add(sleeveR);

  // Hood shape at neckline
  var hoodGeo = new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  var hood = new THREE.Mesh(hoodGeo, mat);
  hood.position.set(0, 1.06, -0.08);
  hood.scale.set(1.2, 0.8, 1);
  g.add(hood);

  // Kangaroo pocket
  var pocketGeo = new THREE.BoxGeometry(0.24, 0.14, 0.06, 2, 2, 1);
  dti3DRoundVertices(pocketGeo, 0.02);
  var pocketMat = dti3DMaterial(dtiShade(color, -15), style);
  var pocket = new THREE.Mesh(pocketGeo, pocketMat);
  pocket.position.set(0, 0.52, 0.22);
  g.add(pocket);

  // Hood strings
  var stringGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4);
  var stringMat = dti3DMaterial(dtiShade(color, -20), style);
  var strL = new THREE.Mesh(stringGeo, stringMat);
  strL.position.set(-0.06, 0.96, 0.16);
  g.add(strL);
  var strR = new THREE.Mesh(stringGeo.clone(), stringMat);
  strR.position.set(0.06, 0.96, 0.16);
  g.add(strR);

  return g;
};

DTI_3D.top_offsh = function(color, style) {
  // Off-shoulder top with ruffle trim
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Main body — starts below shoulders
  var pts = [
    new THREE.Vector2(0.23, 0),
    new THREE.Vector2(0.22, 0.05),
    new THREE.Vector2(0.2, 0.1),
    new THREE.Vector2(0.17, 0.18),
    new THREE.Vector2(0.16, 0.22),
    new THREE.Vector2(0.17, 0.28),
    new THREE.Vector2(0.21, 0.35),
    new THREE.Vector2(0.25, 0.42),
    new THREE.Vector2(0.27, 0.48),
  ];
  var bodyGeo = new THREE.LatheGeometry(pts, 24);
  bodyGeo.translate(0, -0.08, 0);
  var body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 0.5, 0);
  g.add(body);

  // Off-shoulder ruffle — wavy torus at upper chest
  var ruffleGeo = new THREE.TorusGeometry(0.28, 0.03, 8, 32);
  var ruffle = new THREE.Mesh(ruffleGeo, mat);
  ruffle.position.set(0, 0.86, 0);
  ruffle.rotation.x = Math.PI / 2;
  g.add(ruffle);

  // Second ruffle layer (slightly offset)
  var ruffle2Geo = new THREE.TorusGeometry(0.3, 0.02, 8, 32);
  var lightMat = dti3DMaterial(dtiShade(color, 20), style);
  var ruffle2 = new THREE.Mesh(ruffle2Geo, lightMat);
  ruffle2.position.set(0, 0.84, 0);
  ruffle2.rotation.x = Math.PI / 2;
  g.add(ruffle2);

  // Lace trim at hem
  var hemGeo = new THREE.TorusGeometry(0.23, 0.012, 6, 24);
  var hem = new THREE.Mesh(hemGeo, mat);
  hem.position.set(0, 0.42, 0);
  hem.rotation.x = Math.PI / 2;
  g.add(hem);

  return g;
};

// ── BOTTOMS ──
// Hips y~0.14, knees y~-0.46, ankles y~-1.0
// Hip width x: +/-0.13, leg radius ~0.09 upper, ~0.055 lower

DTI_3D.bottom_skirt = function(color, style) {
  // A-line skirt — waistband + flared cone from hips to below knees
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Skirt body — flared cone
  var skirtGeo = new THREE.CylinderGeometry(0.22, 0.38, 0.8, 24, 1, true);
  var skirt = new THREE.Mesh(skirtGeo, mat);
  skirt.position.set(0, -0.2, 0);
  g.add(skirt);

  // Waistband
  var wbGeo = new THREE.TorusGeometry(0.22, 0.025, 8, 24);
  var wbMat = dti3DMaterial(dtiShade(color, -20), style);
  var wb = new THREE.Mesh(wbGeo, wbMat);
  wb.position.set(0, 0.2, 0);
  wb.rotation.x = Math.PI / 2;
  g.add(wb);

  // Belt buckle
  var buckleGeo = new THREE.BoxGeometry(0.04, 0.03, 0.02, 1, 1, 1);
  var buckleMat = dti3DMaterial(dtiShade(color, -40), style);
  var buckle = new THREE.Mesh(buckleGeo, buckleMat);
  buckle.position.set(0, 0.2, 0.22);
  g.add(buckle);

  return g;
};

DTI_3D.bottom_mini = function(color, style) {
  // Pleated mini skirt — short flared with pleats
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Short skirt
  var skirtGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.4, 24, 1, true);
  var skirt = new THREE.Mesh(skirtGeo, mat);
  skirt.position.set(0, 0, 0);
  g.add(skirt);

  // Waistband
  var wbGeo = new THREE.TorusGeometry(0.22, 0.025, 8, 24);
  var wbMat = dti3DMaterial(dtiShade(color, -20), style);
  var wb = new THREE.Mesh(wbGeo, wbMat);
  wb.position.set(0, 0.2, 0);
  wb.rotation.x = Math.PI / 2;
  g.add(wb);

  // Pleat fold lines — thin vertical strips
  var pleatGeo = new THREE.BoxGeometry(0.005, 0.38, 0.005);
  var pleatMat = dti3DMaterial(dtiShade(color, -25), style);
  for (var i = 0; i < 12; i++) {
    var angle = (i / 12) * Math.PI * 2;
    var r = 0.26;
    var pleat = new THREE.Mesh(pleatGeo, pleatMat);
    pleat.position.set(Math.sin(angle) * r, 0, Math.cos(angle) * r);
    g.add(pleat);
  }

  return g;
};

DTI_3D.bottom_pants = function(color, style) {
  // Fitted pants/jeans — two leg cylinders with waistband
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Left leg
  var legGeo = new THREE.CylinderGeometry(0.1, 0.065, 1.0, 12);
  var legL = new THREE.Mesh(legGeo, mat);
  legL.position.set(-0.13, -0.3, 0);
  g.add(legL);
  // Right leg
  var legR = new THREE.Mesh(legGeo.clone(), mat);
  legR.position.set(0.13, -0.3, 0);
  g.add(legR);

  // Hip bridge — connects the two legs at top
  var bridgeGeo = new THREE.BoxGeometry(0.38, 0.16, 0.26, 2, 2, 2);
  dti3DRoundVertices(bridgeGeo, 0.03);
  var bridge = new THREE.Mesh(bridgeGeo, mat);
  bridge.position.set(0, 0.14, 0);
  g.add(bridge);

  // Waistband
  var wbGeo = new THREE.TorusGeometry(0.22, 0.025, 8, 24);
  var wbMat = dti3DMaterial(dtiShade(color, -20), style);
  var wb = new THREE.Mesh(wbGeo, wbMat);
  wb.position.set(0, 0.2, 0);
  wb.rotation.x = Math.PI / 2;
  g.add(wb);

  // Belt loops
  var loopGeo = new THREE.BoxGeometry(0.02, 0.05, 0.01);
  var loopMat = dti3DMaterial(dtiShade(color, -15), style);
  [-0.1, 0, 0.1].forEach(function(x) {
    var loop = new THREE.Mesh(loopGeo, loopMat);
    loop.position.set(x, 0.2, 0.22);
    g.add(loop);
  });

  // Fly seam
  var seamGeo = new THREE.BoxGeometry(0.005, 0.15, 0.005);
  var seamMat = dti3DMaterial(dtiShade(color, -25), style);
  var seam = new THREE.Mesh(seamGeo, seamMat);
  seam.position.set(0, 0.08, 0.2);
  g.add(seam);

  return g;
};

DTI_3D.bottom_wide = function(color, style) {
  // Wide leg flowy pants — wider cylinders
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style);

  // Left leg — wide
  var legGeo = new THREE.CylinderGeometry(0.1, 0.14, 1.0, 12, 1, true);
  var legL = new THREE.Mesh(legGeo, mat);
  legL.position.set(-0.13, -0.3, 0);
  g.add(legL);
  // Right leg
  var legR = new THREE.Mesh(legGeo.clone(), mat);
  legR.position.set(0.13, -0.3, 0);
  g.add(legR);

  // Hip bridge
  var bridgeGeo = new THREE.BoxGeometry(0.38, 0.16, 0.26, 2, 2, 2);
  dti3DRoundVertices(bridgeGeo, 0.03);
  var bridge = new THREE.Mesh(bridgeGeo, mat);
  bridge.position.set(0, 0.14, 0);
  g.add(bridge);

  // Waistband
  var wbGeo = new THREE.TorusGeometry(0.22, 0.025, 8, 24);
  var wbMat = dti3DMaterial(dtiShade(color, -20), style);
  var wb = new THREE.Mesh(wbGeo, wbMat);
  wb.position.set(0, 0.2, 0);
  wb.rotation.x = Math.PI / 2;
  g.add(wb);

  return g;
};

// ── SHOES ──
// Feet at y~-1.05, foot size 0.12x0.06x0.22

DTI_3D.shoes_boots = function(color, style) {
  // Knee-high boots with heel
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style || 'western');

  // Left boot shaft
  var shaftGeo = new THREE.CylinderGeometry(0.075, 0.08, 0.6, 12);
  var shaftL = new THREE.Mesh(shaftGeo, mat);
  shaftL.position.set(-0.13, -0.75, 0);
  g.add(shaftL);
  // Right boot shaft
  var shaftR = new THREE.Mesh(shaftGeo.clone(), mat);
  shaftR.position.set(0.13, -0.75, 0);
  g.add(shaftR);

  // Boot foot — elongated box
  var footGeo = new THREE.BoxGeometry(0.13, 0.08, 0.24, 2, 2, 2);
  dti3DRoundVertices(footGeo, 0.02);
  var footL = new THREE.Mesh(footGeo, mat);
  footL.position.set(-0.13, -1.06, 0.02);
  g.add(footL);
  var footR = new THREE.Mesh(footGeo.clone(), mat);
  footR.position.set(0.13, -1.06, 0.02);
  g.add(footR);

  // Boot cuff — torus at top
  var cuffGeo = new THREE.TorusGeometry(0.08, 0.015, 8, 16);
  var cuffMat = dti3DMaterial(dtiShade(color, -20), style || 'western');
  var cuffL = new THREE.Mesh(cuffGeo, cuffMat);
  cuffL.position.set(-0.13, -0.46, 0);
  cuffL.rotation.x = Math.PI / 2;
  g.add(cuffL);
  var cuffR = new THREE.Mesh(cuffGeo.clone(), cuffMat);
  cuffR.position.set(0.13, -0.46, 0);
  cuffR.rotation.x = Math.PI / 2;
  g.add(cuffR);

  // Buckle straps
  var strapGeo = new THREE.TorusGeometry(0.075, 0.01, 6, 12);
  var strapL = new THREE.Mesh(strapGeo, cuffMat);
  strapL.position.set(-0.13, -0.6, 0);
  strapL.rotation.x = Math.PI / 2;
  g.add(strapL);
  var strapR = new THREE.Mesh(strapGeo.clone(), cuffMat);
  strapR.position.set(0.13, -0.6, 0);
  strapR.rotation.x = Math.PI / 2;
  g.add(strapR);

  // Sole
  var soleGeo = new THREE.BoxGeometry(0.14, 0.03, 0.26);
  var soleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0 });
  var soleL = new THREE.Mesh(soleGeo, soleMat);
  soleL.position.set(-0.13, -1.11, 0.02);
  g.add(soleL);
  var soleR = new THREE.Mesh(soleGeo.clone(), soleMat);
  soleR.position.set(0.13, -1.11, 0.02);
  g.add(soleR);

  return g;
};

DTI_3D.shoes_heels = function(color, style) {
  // Strappy heels with stiletto heel
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style || 'glam');

  // Shoe platform front
  var frontGeo = new THREE.BoxGeometry(0.11, 0.05, 0.14, 2, 2, 2);
  dti3DRoundVertices(frontGeo, 0.02);
  var frontL = new THREE.Mesh(frontGeo, mat);
  frontL.position.set(-0.13, -1.04, 0.06);
  g.add(frontL);
  var frontR = new THREE.Mesh(frontGeo.clone(), mat);
  frontR.position.set(0.13, -1.04, 0.06);
  g.add(frontR);

  // Stiletto heel — thin cylinder angled
  var heelGeo = new THREE.CylinderGeometry(0.012, 0.015, 0.12, 8);
  var heelL = new THREE.Mesh(heelGeo, mat);
  heelL.position.set(-0.13, -1.02, -0.06);
  heelL.rotation.x = -0.15;
  g.add(heelL);
  var heelR = new THREE.Mesh(heelGeo.clone(), mat);
  heelR.position.set(0.13, -1.02, -0.06);
  heelR.rotation.x = -0.15;
  g.add(heelR);

  // Ankle straps
  var strapGeo = new THREE.TorusGeometry(0.065, 0.008, 6, 12);
  var strapL = new THREE.Mesh(strapGeo, mat);
  strapL.position.set(-0.13, -0.96, 0);
  strapL.rotation.x = Math.PI / 2;
  g.add(strapL);
  var strapR = new THREE.Mesh(strapGeo.clone(), mat);
  strapR.position.set(0.13, -0.96, 0);
  strapR.rotation.x = Math.PI / 2;
  g.add(strapR);

  // Strap buckle
  var buckleGeo = new THREE.SphereGeometry(0.01, 6, 6);
  var buckleMat = dti3DMaterial(dtiShade(color, -30), style || 'glam');
  var bkL = new THREE.Mesh(buckleGeo, buckleMat);
  bkL.position.set(-0.13 + 0.065, -0.96, 0);
  g.add(bkL);
  var bkR = new THREE.Mesh(buckleGeo.clone(), buckleMat);
  bkR.position.set(0.13 + 0.065, -0.96, 0);
  g.add(bkR);

  return g;
};

DTI_3D.shoes_sneakers = function(color, style) {
  // Chunky sneakers with thick white sole
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style || 'street');

  // Shoe upper
  var upperGeo = new THREE.BoxGeometry(0.14, 0.08, 0.22, 2, 2, 2);
  dti3DRoundVertices(upperGeo, 0.02);
  var upperL = new THREE.Mesh(upperGeo, mat);
  upperL.position.set(-0.13, -1.03, 0.02);
  g.add(upperL);
  var upperR = new THREE.Mesh(upperGeo.clone(), mat);
  upperR.position.set(0.13, -1.03, 0.02);
  g.add(upperR);

  // Chunky white sole
  var soleGeo = new THREE.BoxGeometry(0.16, 0.06, 0.26, 2, 2, 2);
  dti3DRoundVertices(soleGeo, 0.02);
  var soleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  var soleL = new THREE.Mesh(soleGeo, soleMat);
  soleL.position.set(-0.13, -1.1, 0.02);
  g.add(soleL);
  var soleR = new THREE.Mesh(soleGeo.clone(), soleMat);
  soleR.position.set(0.13, -1.1, 0.02);
  g.add(soleR);

  // Tongue
  var tongueGeo = new THREE.BoxGeometry(0.08, 0.04, 0.06, 1, 1, 1);
  dti3DRoundVertices(tongueGeo, 0.01);
  var tongueL = new THREE.Mesh(tongueGeo, mat);
  tongueL.position.set(-0.13, -0.98, 0.06);
  g.add(tongueL);
  var tongueR = new THREE.Mesh(tongueGeo.clone(), mat);
  tongueR.position.set(0.13, -0.98, 0.06);
  g.add(tongueR);

  // Laces — tiny white lines
  var laceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  var laceGeo = new THREE.BoxGeometry(0.06, 0.004, 0.004);
  for (var i = 0; i < 3; i++) {
    var lL = new THREE.Mesh(laceGeo, laceMat);
    lL.position.set(-0.13, -1.0 + i * 0.02, 0.12);
    g.add(lL);
    var lR = new THREE.Mesh(laceGeo.clone(), laceMat);
    lR.position.set(0.13, -1.0 + i * 0.02, 0.12);
    g.add(lR);
  }

  return g;
};

DTI_3D.shoes_flats = function(color, style) {
  // Ballet flats with bow
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style || 'clean');

  // Flat shoe — very low profile
  var flatGeo = new THREE.BoxGeometry(0.13, 0.04, 0.22, 2, 2, 2);
  dti3DRoundVertices(flatGeo, 0.02);
  var flatL = new THREE.Mesh(flatGeo, mat);
  flatL.position.set(-0.13, -1.06, 0.03);
  g.add(flatL);
  var flatR = new THREE.Mesh(flatGeo.clone(), mat);
  flatR.position.set(0.13, -1.06, 0.03);
  g.add(flatR);

  // Inner rim — slightly lighter
  var rimGeo = new THREE.TorusGeometry(0.06, 0.008, 6, 12, Math.PI);
  var rimMat = dti3DMaterial(dtiShade(color, 20), style || 'clean');
  var rimL = new THREE.Mesh(rimGeo, rimMat);
  rimL.position.set(-0.13, -1.03, 0.03);
  rimL.rotation.x = Math.PI / 2;
  g.add(rimL);
  var rimR = new THREE.Mesh(rimGeo.clone(), rimMat);
  rimR.position.set(0.13, -1.03, 0.03);
  rimR.rotation.x = Math.PI / 2;
  g.add(rimR);

  // Bow on toe
  var bowGeo = new THREE.SphereGeometry(0.015, 6, 6);
  var bowMat = dti3DMaterial(dtiShade(color, -20), style || 'clean');
  var bowL = new THREE.Mesh(bowGeo, bowMat);
  bowL.position.set(-0.13, -1.04, 0.12);
  bowL.scale.set(1.5, 0.7, 1);
  g.add(bowL);
  var bowR = new THREE.Mesh(bowGeo.clone(), bowMat);
  bowR.position.set(0.13, -1.04, 0.12);
  bowR.scale.set(1.5, 0.7, 1);
  g.add(bowR);

  return g;
};

// ── ACCESSORIES ──

DTI_3D.acc_necklace = function(color, style) {
  // Pendant necklace around neck
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style || 'boho');

  // Chain — torus around neck
  var chainGeo = new THREE.TorusGeometry(0.12, 0.006, 8, 24, Math.PI);
  var chain = new THREE.Mesh(chainGeo, mat);
  chain.position.set(0, 1.0, 0.08);
  chain.rotation.x = -0.1;
  g.add(chain);

  // Pendant
  var pendGeo = new THREE.SphereGeometry(0.03, 8, 8);
  var pendMat = dti3DMaterial(dtiShade(color, 30), style || 'boho');
  var pend = new THREE.Mesh(pendGeo, pendMat);
  pend.position.set(0, 0.88, 0.18);
  g.add(pend);

  // Small accent beads
  var beadGeo = new THREE.SphereGeometry(0.008, 6, 6);
  var bead1 = new THREE.Mesh(beadGeo, mat);
  bead1.position.set(-0.04, 0.92, 0.16);
  g.add(bead1);
  var bead2 = new THREE.Mesh(beadGeo.clone(), mat);
  bead2.position.set(0.04, 0.92, 0.16);
  g.add(bead2);

  return g;
};

DTI_3D.acc_bag = function(color, style) {
  // Bag hanging from right hand/shoulder area
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style || 'street');

  // Bag body
  var bagGeo = new THREE.BoxGeometry(0.18, 0.16, 0.08, 2, 2, 2);
  dti3DRoundVertices(bagGeo, 0.02);
  var bag = new THREE.Mesh(bagGeo, mat);
  bag.position.set(0.42, 0.1, 0.02);
  g.add(bag);

  // Bag strap
  var strapGeo = new THREE.TorusGeometry(0.14, 0.008, 6, 16, Math.PI);
  var strap = new THREE.Mesh(strapGeo, mat);
  strap.position.set(0.42, 0.22, 0.02);
  strap.rotation.z = 0;
  g.add(strap);

  // Bag clasp
  var claspGeo = new THREE.BoxGeometry(0.04, 0.02, 0.02);
  var claspMat = dti3DMaterial(dtiShade(color, -30), style || 'street');
  var clasp = new THREE.Mesh(claspGeo, claspMat);
  clasp.position.set(0.42, 0.05, 0.06);
  g.add(clasp);

  return g;
};

DTI_3D.acc_hat = function(color, style) {
  // Hat sitting on top of head
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style || 'casual');

  // Brim — flat disc
  var brimGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.02, 24);
  var brim = new THREE.Mesh(brimGeo, mat);
  brim.position.set(0, 1.7, 0);
  g.add(brim);

  // Crown — rounded top
  var crownGeo = new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  var crown = new THREE.Mesh(crownGeo, mat);
  crown.position.set(0, 1.72, 0);
  crown.scale.set(1, 0.7, 1);
  g.add(crown);

  // Hat band
  var bandGeo = new THREE.TorusGeometry(0.2, 0.012, 6, 24);
  var bandMat = dti3DMaterial(dtiShade(color, -25), style || 'casual');
  var band = new THREE.Mesh(bandGeo, bandMat);
  band.position.set(0, 1.72, 0);
  band.rotation.x = Math.PI / 2;
  g.add(band);

  return g;
};

DTI_3D.acc_earrings = function(color, style) {
  // Dangling earrings at ear level
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style || 'glam');

  // Earring spheres at ear positions (head sides)
  var earGeo = new THREE.SphereGeometry(0.03, 8, 8);
  var earL = new THREE.Mesh(earGeo, mat);
  earL.position.set(-0.26, 1.36, 0.02);
  g.add(earL);
  var earR = new THREE.Mesh(earGeo.clone(), mat);
  earR.position.set(0.26, 1.36, 0.02);
  g.add(earR);

  // Highlight
  var hiGeo = new THREE.SphereGeometry(0.015, 6, 6);
  var hiMat = dti3DMaterial(dtiShade(color, 30), style || 'glam');
  var hiL = new THREE.Mesh(hiGeo, hiMat);
  hiL.position.set(-0.26, 1.37, 0.04);
  g.add(hiL);
  var hiR = new THREE.Mesh(hiGeo.clone(), hiMat);
  hiR.position.set(0.26, 1.37, 0.04);
  g.add(hiR);

  // Posts
  var postGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.04, 4);
  var postL = new THREE.Mesh(postGeo, mat);
  postL.position.set(-0.26, 1.4, 0.02);
  g.add(postL);
  var postR = new THREE.Mesh(postGeo.clone(), mat);
  postR.position.set(0.26, 1.4, 0.02);
  g.add(postR);

  return g;
};

DTI_3D.acc_belt = function(color, style) {
  // Belt at waist level
  var g = new THREE.Group();
  var mat = dti3DMaterial(color, style || 'edgy');

  // Belt band — torus at waist
  var beltGeo = new THREE.TorusGeometry(0.2, 0.02, 8, 24);
  var belt = new THREE.Mesh(beltGeo, mat);
  belt.position.set(0, 0.24, 0);
  belt.rotation.x = Math.PI / 2;
  g.add(belt);

  // Buckle
  var buckleGeo = new THREE.BoxGeometry(0.06, 0.05, 0.02, 1, 1, 1);
  var buckleMat = dti3DMaterial(dtiShade(color, -30), style || 'edgy');
  var buckle = new THREE.Mesh(buckleGeo, buckleMat);
  buckle.position.set(0, 0.24, 0.2);
  g.add(buckle);

  // Buckle inner
  var innerGeo = new THREE.BoxGeometry(0.04, 0.03, 0.01);
  var innerMat = dti3DMaterial(dtiShade(color, 20), style || 'edgy');
  var inner = new THREE.Mesh(innerGeo, innerMat);
  inner.position.set(0, 0.24, 0.21);
  g.add(inner);

  return g;
};
