/*
 * 赛博花店 · 低多边形花材模型
 * 全部用代码生成：花瓣是弯曲的小网格，组合时只是「摆位置 + 换颜色」。
 * 同一朵花里同颜色的零件会合并成一个 Mesh，10 支花也只有几十次绘制。
 */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var V3 = THREE.Vector3;
  var PI = Math.PI;

  // ---------- 色彩 ----------
  var GREEN = '#93A784', GREEN_DARK = '#7D9270', STEM = '#8C9E7B';
  var BROWN = '#7E5F4A', BROWN_DARK = '#6B5040', POLLEN = '#EBDDAA', WOOD = '#CDB48F';

  function mix(a, b, t) {
    var c = new THREE.Color(a).lerp(new THREE.Color(b), t);
    return '#' + c.getHexString();
  }
  function shade(a, k) {
    var c = new THREE.Color(a).multiplyScalar(k);
    return '#' + c.getHexString();
  }

  // ---------- 材质（三阶卡通明暗）----------
  var gradient = (function () {
    var data = new Uint8Array([120, 200, 255]);
    var tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  })();
  var matCache = {};
  function toon(hex) {
    if (!matCache[hex]) {
      matCache[hex] = new THREE.MeshToonMaterial({
        color: hex, gradientMap: gradient, side: THREE.DoubleSide, flatShading: true
      });
    }
    return matCache[hex];
  }

  // ---------- 几何工具 ----------
  function prep(geo) {
    var g = geo.index ? geo.toNonIndexed() : geo;
    ['uv', 'uv2'].forEach(function (a) { if (g.attributes[a]) g.deleteAttribute(a); });
    g.computeVertexNormals();
    return g;
  }

  var _o = new THREE.Object3D();
  // 先绕 Z、再绕 X（倾倒）、最后绕 Y（转角）
  function mat(px, py, pz, rx, ry, rz, s) {
    _o.position.set(px, py, pz);
    _o.rotation.set(rx || 0, ry || 0, rz || 0, 'YXZ');
    if (s == null) _o.scale.set(1, 1, 1);
    else if (typeof s === 'number') _o.scale.setScalar(s);
    else _o.scale.set(s[0], s[1], s[2]);
    _o.updateMatrix();
    return _o.matrix.clone();
  }
  var UP = new V3(0, 1, 0);
  function matAlign(pos, dir, spin, s) {
    var q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
    if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
    var sc = s == null ? new V3(1, 1, 1) : (typeof s === 'number' ? new V3(s, s, s) : new V3(s[0], s[1], s[2]));
    return new THREE.Matrix4().compose(pos, q, sc);
  }
  function mul(a, b) { return a.clone().multiply(b); }

  /** 收集零件，按颜色合并 */
  function Parts() { this.buckets = {}; }
  Parts.prototype.add = function (geo, m, hex) {
    var g = geo.clone().applyMatrix4(m);
    (this.buckets[hex] = this.buckets[hex] || []).push(g);
  };
  Parts.prototype.build = function (userData) {
    var group = new THREE.Group();
    var self = this;
    Object.keys(this.buckets).forEach(function (hex) {
      var list = self.buckets[hex], n = 0;
      list.forEach(function (g) { n += g.attributes.position.count; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), o = 0;
      list.forEach(function (g) {
        pos.set(g.attributes.position.array, o);
        nor.set(g.attributes.normal.array, o);
        o += g.attributes.position.array.length;
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.computeBoundingSphere();
      var mesh = new THREE.Mesh(geo, toon(hex));
      if (userData) mesh.userData = userData;
      group.add(mesh);
    });
    if (userData) group.userData = userData;
    return group;
  };

  /**
   * 花瓣 / 叶片 / 包装纸片：沿 +Y 生长，凹面朝 -Z。
   * round 0=尖头 1=圆头；kite=菱形纸片的最宽位置；cup=横向内卷；curl=末端外翻
   */
  var petalCache = {};
  function petal(o) {
    var key = JSON.stringify(o);
    if (petalCache[key]) return petalCache[key];
    var len = o.len, wid = o.wid, cup = o.cup || 0, curl = o.curl || 0;
    var round = o.round == null ? 0.5 : o.round, rows = o.rows || 3, cols = o.cols || 2;
    var pts = [];
    for (var i = 0; i <= rows; i++) {
      var u = i / rows, w;
      if (o.kite) {
        w = u < o.kite ? 0.16 + 0.84 * Math.sin(PI / 2 * u / o.kite) : 1 - (u - o.kite) / (1 - o.kite) * 0.96;
        w *= wid;
      } else {
        w = wid * Math.pow(Math.max(0, Math.sin(PI * (0.06 + u * 0.94 * (1 - 0.4 * round)))), 0.75);
      }
      for (var j = 0; j <= cols; j++) {
        var v = -1 + 2 * j / cols;
        pts.push(new V3(v * w, u * len, -cup * v * v * w + curl * u * u * len));
      }
    }
    var arr = [];
    function P(i, j) { return pts[i * (cols + 1) + j]; }
    function push(p) { arr.push(p.x, p.y, p.z); }
    for (i = 0; i < rows; i++) {
      for (j = 0; j < cols; j++) {
        var a = P(i, j), b = P(i, j + 1), c = P(i + 1, j + 1), d = P(i + 1, j);
        push(a); push(b); push(c); push(a); push(c); push(d);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    petalCache[key] = g;
    return g;
  }

  /** 一圈花瓣 */
  function ring(parts, M, n, geo, hex, o) {
    for (var k = 0; k < n; k++) {
      var a = (o.phase || 0) + k * 2 * PI / n + (o.rng ? (o.rng() - 0.5) * (o.jitter || 0) : 0);
      var tilt = o.tilt + (o.rng ? (o.rng() - 0.5) * (o.tiltJitter || 0) : 0);
      var h = typeof hex === 'function' ? hex(k) : hex;
      parts.add(geo, mul(M, mat(Math.sin(a) * o.r, o.y || 0, Math.cos(a) * o.r, tilt, a, 0)), h);
    }
  }

  var G = {
    ico0: prep(new THREE.IcosahedronGeometry(1, 0)),
    ico1: prep(new THREE.IcosahedronGeometry(1, 1)),
    cyl5: prep(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true)),
    disc10: prep(new THREE.CylinderGeometry(1, 1, 1, 10, 1, false)),
    dome8: prep(new THREE.SphereGeometry(1, 8, 3, 0, PI * 2, 0, PI / 2)),
    bell: prep(new THREE.ConeGeometry(1, 1, 5, 1, true))
  };

  function stemBetween(parts, a, b, r, hex) {
    var dir = new V3().subVectors(b, a), len = dir.length();
    var mid = new V3().addVectors(a, b).multiplyScalar(0.5);
    parts.add(G.cyl5, matAlign(mid, dir, 0, [r, len, r]), hex);
  }

  // ---------- 五种花（局部坐标：花托在原点，花朝 +Y）----------
  function buildRose(parts, M, hex, rng) {
    var inner = shade(hex, 0.86), mid = shade(hex, 0.94);
    parts.add(G.ico0, mul(M, mat(0, 0.075, 0, 0.3, rng() * 3, 0, [0.05, 0.07, 0.05])), inner);
    ring(parts, M, 3, petal({ len: 0.12, wid: 0.07, cup: 0.9, round: 0.8 }), inner,
      { r: 0.02, tilt: 0.12, phase: rng() * 6 });
    ring(parts, M, 5, petal({ len: 0.15, wid: 0.095, cup: 0.75, round: 0.9, curl: 0.05 }), mid,
      { r: 0.032, tilt: 0.45, phase: rng() * 6, rng: rng, jitter: 0.3, tiltJitter: 0.15 });
    ring(parts, M, 5, petal({ len: 0.165, wid: 0.115, cup: 0.55, round: 1, curl: 0.2 }), hex,
      { r: 0.045, tilt: 0.9, phase: rng() * 6, rng: rng, jitter: 0.3, tiltJitter: 0.2 });
    ring(parts, M, 5, petal({ len: 0.08, wid: 0.025, cup: 0.3, round: 0 }), GREEN_DARK,
      { r: 0.02, y: -0.005, tilt: 1.95, phase: rng() * 6 });
    parts.add(G.ico0, mul(M, mat(0, -0.005, 0, 0, 0, 0, [0.035, 0.03, 0.035])), GREEN_DARK);
  }

  function buildForgetMeNot(parts, M, hex, rng) {
    var light = mix(hex, '#FFFFFF', 0.25);
    var petalG = petal({ len: 0.036, wid: 0.03, cup: 0.25, round: 1, rows: 2 });
    var spots = [[0, 0.135, 0]];
    for (var k = 0; k < 6; k++) {
      var a = k / 6 * PI * 2 + rng(), p = 0.75;
      spots.push([Math.sin(a) * Math.sin(p) * 0.075, 0.07 + Math.cos(p) * 0.075, Math.cos(a) * Math.sin(p) * 0.075]);
    }
    for (k = 0; k < 6; k++) {
      a = (k + 0.5) / 6 * PI * 2 + rng(); p = 1.35;
      spots.push([Math.sin(a) * Math.sin(p) * 0.09, 0.07 + Math.cos(p) * 0.09, Math.cos(a) * Math.sin(p) * 0.09]);
    }
    var base = new V3(0, 0, 0).applyMatrix4(M);
    spots.forEach(function (s, i) {
      var local = new V3(s[0], s[1], s[2]);
      var dir = new V3(s[0], s[1] - 0.04, s[2]).normalize();
      var world = local.clone().applyMatrix4(M);
      var dirW = dir.clone().transformDirection(M);
      var F = matAlign(world, dirW, rng() * 6);
      var col = i % 3 === 0 ? light : hex;
      ring(parts, F, 5, petalG, col, { r: 0.004, tilt: 1.3 });
      parts.add(G.ico0, mul(F, mat(0, 0.004, 0, 0, 0, 0, 0.011)), POLLEN);
      stemBetween(parts, base, world.clone().sub(dirW.clone().multiplyScalar(0.006)), 0.0035, STEM);
    });
  }

  function buildHyacinth(parts, M, hex, rng) {
    var alt = shade(hex, 0.9), light = mix(hex, '#FFFFFF', 0.2);
    var star = petal({ len: 0.026, wid: 0.017, cup: 0.2, round: 0.3, rows: 2 });
    stemBetween(parts, new V3(0, 0, 0).applyMatrix4(M), new V3(0, 0.34, 0).applyMatrix4(M), 0.012, STEM);
    var levels = 6;
    for (var L = 0; L < levels; L++) {
      var y = 0.03 + L * 0.052, rr = 0.05 * (1 - L * 0.1), cnt = L > 3 ? 5 : 6;
      for (var k = 0; k < cnt; k++) {
        var a = k / cnt * PI * 2 + L * 0.55 + rng() * 0.2;
        var dir = new V3(Math.sin(a), 0.35, Math.cos(a)).normalize();
        var F = mul(M, matAlign(new V3(Math.sin(a) * rr, y, Math.cos(a) * rr), dir, rng() * 6));
        var col = (k + L) % 3 === 0 ? light : ((k + L) % 2 ? alt : hex);
        parts.add(G.bell, mul(F, mat(0, 0.018, 0, PI, 0, 0, [0.022, 0.036, 0.022])), col);
        ring(parts, F, 5, star, col, { r: 0.016, y: 0.034, tilt: 1.75 });
      }
    }
    var bud = mix(hex, GREEN, 0.35);
    parts.add(G.ico0, mul(M, mat(0, 0.36, 0, 0, 0, 0, 0.022)), bud);
    parts.add(G.ico0, mul(M, mat(0.022, 0.335, 0.01, 0, 0, 0, 0.018)), bud);
    parts.add(G.ico0, mul(M, mat(-0.015, 0.338, -0.018, 0, 0, 0, 0.018)), bud);
  }

  function buildSunflower(parts, M, hex, rng) {
    ring(parts, M, 10, petal({ len: 0.085, wid: 0.035, cup: 0.3, round: 0.1 }), GREEN_DARK,
      { r: 0.06, y: -0.005, tilt: 1.8, phase: rng() * 6 });
    var ph = rng() * 6;
    ring(parts, M, 12, petal({ len: 0.12, wid: 0.04, cup: 0.35, round: 0.15, curl: 0.06 }), shade(hex, 0.92),
      { r: 0.08, y: 0.015, tilt: 1.3, phase: ph + PI / 12, rng: rng, jitter: 0.12, tiltJitter: 0.2 });
    ring(parts, M, 12, petal({ len: 0.13, wid: 0.042, cup: 0.3, round: 0.15, curl: -0.04 }), hex,
      { r: 0.085, y: 0.022, tilt: 1.47, phase: ph, rng: rng, jitter: 0.12, tiltJitter: 0.15 });
    parts.add(G.disc10, mul(M, mat(0, 0.03, 0, 0, 0, 0, [0.095, 0.03, 0.095])), BROWN);
    parts.add(G.dome8, mul(M, mat(0, 0.045, 0, 0, rng(), 0, [0.08, 0.03, 0.08])), BROWN_DARK);
    parts.add(G.ico0, mul(M, mat(0, -0.01, 0, 0, 0, 0, [0.05, 0.03, 0.05])), GREEN_DARK);
  }

  function buildHydrangea(parts, M, hex, rng) {
    var light = mix(hex, '#FFFFFF', 0.22), deep = shade(hex, 0.9);
    parts.add(G.ico1, mul(M, mat(0, 0.08, 0, 0, rng() * 3, 0, [0.19, 0.13, 0.19])), shade(hex, 0.78));
    var petalG = petal({ len: 0.05, wid: 0.045, cup: 0.15, round: 1, rows: 2 });
    var N = 34, ax = 0.2, ay = 0.14;
    for (var i = 0; i < N; i++) {
      var t = (i + 0.5) / N;
      var polar = Math.acos(1 - t * 1.25);
      var az = i * 2.39996 + rng() * 0.3;
      var nx = Math.sin(polar) * Math.sin(az), ny = Math.cos(polar), nz = Math.sin(polar) * Math.cos(az);
      var pos = new V3(nx * ax, 0.08 + ny * ay, nz * ax);
      var nrm = new V3(nx / ax, ny / ay, nz / ax).normalize();
      var F = mul(M, matAlign(pos, nrm, rng() * 6));
      var r = rng(), col = r < 0.3 ? light : (r < 0.45 ? deep : hex);
      ring(parts, F, 4, petalG, col, { r: 0.004, tilt: 1.38, rng: rng, tiltJitter: 0.3 });
      parts.add(G.ico0, mul(F, mat(0, 0.006, 0, 0, 0, 0, 0.008)), POLLEN);
    }
  }

  var BUILDERS = {
    rose: buildRose, forgetmenot: buildForgetMeNot, hyacinth: buildHyacinth,
    sunflower: buildSunflower, hydrangea: buildHydrangea
  };

  function addLeaf(parts, pos, dir, spin, len, hex) {
    parts.add(petal({ len: len, wid: len * 0.3, cup: 0.4, curl: 0.18, round: 0, rows: 4 }),
      matAlign(pos, dir, spin), hex);
  }

  // ---------- 包装纸（分层展开式）----------
  var NECK_Y = -0.5, RIM_H = 0.84, HS = 1.35;

  function buildWrap(hex, R, rng) {
    var parts = new Parts();
    var topR = R + 0.12;
    var liner = mix(hex, '#FFFFFF', 0.35), outer = hex;
    var D = PI / 180;
    // 正面（+Z，角度 0）留出 V 形开口，露出花茎和贺卡；纸从背后和两侧包上来
    topR = R * 0.85 + 0.08;
    var layers = [
      { col: liner, h: 1.02, r: 0.05, wid: 1.0, angles: [180, 122, 238] },
      { col: outer, h: 0.86, r: 0.07, wid: 0.85, angles: [152, 208, 98, 262], fold: true }
    ];
    layers.forEach(function (L) {
      var tilt = Math.atan((topR - L.r) / L.h);
      var len = L.h / Math.cos(tilt);
      var wid = topR * L.wid;
      var geo = petal({ len: len, wid: wid, cup: 0.85, round: 1, curl: 0.12, rows: 6, cols: 6 });
      L.angles.forEach(function (deg) {
        var a = deg * D + (rng() - 0.5) * 0.08;
        var t = tilt + (rng() - 0.5) * 0.06;
        // 最外侧两片往里折一点，形成开口的边
        var twist = L.fold && (deg < 120 || deg > 240) ? (deg < 120 ? -0.3 : 0.3) : (rng() - 0.5) * 0.1;
        parts.add(geo, mat(Math.sin(a) * L.r, NECK_Y - 0.04, Math.cos(a) * L.r, t, a, twist), L.col);
      });
    });
    // 下半截：往下微微张开的纸裙
    var lower = prep(new THREE.CylinderGeometry(0.1, 0.15, 0.6, 9, 1, true));
    parts.add(lower, mat(0, NECK_Y - 0.3, 0, 0, 0.2, 0), shade(hex, 0.97));
    var lowerIn = prep(new THREE.CylinderGeometry(0.095, 0.135, 0.56, 9, 1, true));
    parts.add(lowerIn, mat(0, NECK_Y - 0.29, 0, 0, 0, 0), liner);
    return parts.build();
  }

  // ---------- 蝴蝶结 ----------
  function buildBow(hex) {
    var parts = new Parts(), dark = shade(hex, 0.88);
    var band = prep(new THREE.TorusGeometry(0.09, 0.02, 4, 10));
    parts.add(band, mat(0, 0, 0, PI / 2, 0, 0, [1, 1, 0.9]), dark);
    var loop = prep(new THREE.TorusGeometry(0.1, 0.026, 4, 8));
    parts.add(loop, mat(0.105, 0.025, 0.115, 0, 0.15, 0.3, [1, 0.6, 0.55]), hex);
    parts.add(loop, mat(-0.105, 0.025, 0.115, 0, -0.15, -0.3, [1, 0.6, 0.55]), hex);
    var tail = petal({ len: 0.3, wid: 0.032, cup: 0.15, kite: 0.85, rows: 4 });
    parts.add(tail, mat(0.02, -0.01, 0.115, 0.1, 0, PI + 0.32), dark);
    parts.add(tail, mat(-0.02, -0.01, 0.12, 0.1, 0, PI - 0.38), hex);
    parts.add(G.ico0, mat(0, 0.0, 0.118, 0.4, 0.3, 0, [0.035, 0.035, 0.03]), dark);
    var inner = parts.build();
    inner.scale.setScalar(1.2);
    inner.position.z = 0.02;
    var g = new THREE.Group();
    g.add(inner);
    g.position.y = NECK_Y;
    return g;
  }

  // ---------- 贺卡 ----------
  function cardShape(kind) {
    var s = new THREE.Shape();
    if (kind === 'heart') {
      s.moveTo(0, -0.13);
      s.bezierCurveTo(-0.05, -0.08, -0.15, -0.03, -0.15, 0.04);
      s.bezierCurveTo(-0.15, 0.1, -0.11, 0.135, -0.07, 0.135);
      s.bezierCurveTo(-0.03, 0.135, -0.005, 0.11, 0, 0.085);
      s.bezierCurveTo(0.005, 0.11, 0.03, 0.135, 0.07, 0.135);
      s.bezierCurveTo(0.11, 0.135, 0.15, 0.1, 0.15, 0.04);
      s.bezierCurveTo(0.15, -0.03, 0.05, -0.08, 0, -0.13);
    } else if (kind === 'round') {
      s.absarc(0, 0, 0.125, 0, PI * 2, false);
    } else {
      var w = 0.13, r = 0.025;
      s.moveTo(-w + r, -w);
      s.lineTo(w - r, -w); s.quadraticCurveTo(w, -w, w, -w + r);
      s.lineTo(w, w - r); s.quadraticCurveTo(w, w, w - r, w);
      s.lineTo(-w + r, w); s.quadraticCurveTo(-w, w, -w, w - r);
      s.lineTo(-w, -w + r); s.quadraticCurveTo(-w, -w, -w + r, -w);
    }
    return s;
  }

  function buildCard(shapeKind, hex) {
    var parts = new Parts();
    var geo = new THREE.ExtrudeGeometry(cardShape(shapeKind), {
      depth: 0.012, bevelEnabled: false, curveSegments: shapeKind === 'round' ? 5 : 3
    });
    geo.translate(0, 0, -0.006);
    parts.add(prep(geo), new THREE.Matrix4(), hex);
    // 小装饰：一枚压印小心心
    var mini = new THREE.ExtrudeGeometry(cardShape('heart'), { depth: 0.004, bevelEnabled: false, curveSegments: 2 });
    parts.add(prep(mini), mat(0, shapeKind === 'heart' ? 0.0 : -0.06, 0.007, 0, 0, 0, [0.18, 0.18, 1]), shade(hex, 0.85));
    // 卡签
    parts.add(G.cyl5, mat(0, -0.28, -0.004, 0, 0, 0, [0.006, 0.32, 0.006]), WOOD);
    return parts.build({ kind: 'card' });
  }

  // ---------- 整束组合 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /**
   * order: CF.parseMarker 的结果
   * 返回 { root, wrap, bow, card, flowers:[{group,type,color}], focusY, height, radius }
   */
  function buildBouquet(order, CAT) {
    var rng = mulberry32(hashStr(JSON.stringify(order)));
    var items = [];
    order.flowers.forEach(function (f) {
      for (var i = 0; i < f.count; i++) items.push({ type: f.type, color: f.color });
    });
    // 大花放中间
    items.sort(function (a, b) { return CAT.flowers[b.type].size - CAT.flowers[a.type].size; });
    var n = items.length, area = 0;
    items.forEach(function (it) { var s = CAT.flowers[it.type].size; area += s * s; });
    var R = Math.max(0.12, 0.88 * HS * Math.sqrt(area));

    var root = new THREE.Group();
    var neck = new V3(0, NECK_Y + 0.02, 0);
    var focus = new V3(0, -1.0, 0);
    var rot0 = rng() * PI * 2;
    var flowers = [];

    items.forEach(function (it, i) {
      var spec = CAT.flowers[it.type];
      var hex = spec.colors[it.color - 1].hex;
      var r = n === 1 ? 0 : R * Math.sqrt(i / (n - 1)) * 0.92;
      var a = rot0 + i * 2.39996;
      var pos = new V3(Math.sin(a) * r, 0.6 - 0.45 * r * r + (rng() - 0.5) * 0.04, Math.cos(a) * r);
      if (it.type === 'hyacinth') pos.y -= 0.08;
      var dir = pos.clone().sub(focus).normalize();
      if (it.type === 'sunflower') {
        // 向日葵大花盘要「看着人」：往外侧（中心的就往正面）多倾一点
        var outward = r > 0.02 ? new V3(pos.x, 0, pos.z).normalize() : new V3(0, 0, 1);
        dir.add(outward.multiplyScalar(0.75)).normalize();
      }
      dir.x += (rng() - 0.5) * 0.12; dir.z += (rng() - 0.5) * 0.12; dir.normalize();
      var M = matAlign(pos, dir, rng() * PI * 2, HS);
      var parts = new Parts();
      BUILDERS[it.type](parts, M, hex, rng);
      var end = new V3((rng() - 0.5) * 0.05, neck.y, (rng() - 0.5) * 0.05);
      stemBetween(parts, pos.clone().sub(dir.clone().multiplyScalar(0.01)), end, 0.011, STEM);
      if (rng() < 0.6) {
        var lp = pos.clone().lerp(end, 0.35);
        var out = new V3(lp.x, 0, lp.z).normalize();
        if (!isFinite(out.x)) out.set(1, 0, 0);
        addLeaf(parts, lp, out.multiplyScalar(0.8).add(new V3(0, 0.6, 0)), rng() * 6, 0.16, GREEN);
      }
      var group = parts.build({ kind: 'flower', index: i, type: it.type });
      root.add(group);
      flowers.push({ group: group, type: it.type, color: it.color });
    });

    // 填缝的苔绿和外圈叶子
    var filler = new Parts();
    // 背后一团暗绿垫底，免得从开口看进去是空的
    filler.add(G.ico1, mat(0, 0.3, -R * 0.45, 0, rng() * 3, 0, [R * 0.6 + 0.04, 0.14, R * 0.35 + 0.03]), GREEN_DARK);
    var leafN = 5 + Math.floor(n * 0.5);
    for (var k = 0; k < leafN; k++) {
      // 叶子只放在两侧和背后，正面留给贺卡
      var a = PI * 0.3 + k / (leafN - 1) * PI * 1.4 + (rng() - 0.5) * 0.2;
      var lr = R * 0.8 + 0.08;
      var p = new V3(Math.sin(a) * lr, 0.28 + rng() * 0.05, Math.cos(a) * lr);
      var d = new V3(Math.sin(a), 0.9 + rng() * 0.5, Math.cos(a));
      addLeaf(filler, p, d, rng() * 6, 0.18 + rng() * 0.08, k % 2 ? GREEN : GREEN_DARK);
    }
    // 正面开口里的一把绿叶和花茎，衬在贺卡后面
    var fz = Math.max(0.12, R * 0.3);
    for (k = 0; k < 7; k++) {
      var fx = (k - 3) * 0.045;
      var top = new V3(fx * 2.2, 0.22 + rng() * 0.15, fz + 0.03);
      stemBetween(filler, new V3(fx * 0.3, NECK_Y + 0.02, 0.02), top, 0.009, STEM);
      if (k % 2 === 0) {
        addLeaf(filler, top.clone().lerp(new V3(0, NECK_Y, 0), 0.25),
          new V3(fx * 6 + (rng() - 0.5), 1.2, 0.5), rng() * 6, 0.14 + rng() * 0.05, k % 4 ? GREEN : GREEN_DARK);
      }
    }
    var fillerG = filler.build();
    root.add(fillerG);

    var wrapHex = CAT.wrap.colors[order.wrap - 1].hex;
    var wrap = buildWrap(wrapHex, R, rng);
    root.add(wrap);

    var bow = buildBow(CAT.ribbon.colors[order.ribbon - 1].hex);
    root.add(bow);

    var card = buildCard(order.card.shape, CAT.card.colors[order.card.color - 1].hex);
    card.children.forEach(function (m) { m.scale.setScalar(0.92); });
    // 贺卡插在正面开口里：花头下面、蝴蝶结上面
    card.position.set(0.015, -0.02, Math.max(0.2, R * 0.3 + 0.1));
    card.rotation.set(-0.14, 0.05, 0.07, 'YXZ');
    root.add(card);

    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    return {
      root: root, wrap: wrap, bow: bow, card: card, filler: fillerG, flowers: flowers,
      radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z),
      top: box.max.y, bottom: box.min.y
    };
  }

  root.CFModels = { buildBouquet: buildBouquet, toon: toon, shade: shade, mix: mix };
})(window);
