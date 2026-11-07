/*
 * 赛博花店 · 场景、描边、交互、开场动画、截图
 */
(function () {
  'use strict';
  var CAT = CF.CATALOG;
  var V3 = THREE.Vector3, PI = Math.PI;
  var $ = function (id) { return document.getElementById(id); };

  var DEMO = '[花束:玫瑰1×3,勿忘我1×2,向日葵1×1,紫风信子1×1|包装纸1|丝带1|卡片:心形2|To:你|From:赛博花店|' +
    '寄语:这是一束示例花。让你的家机在聊天里写一个花束码，贴到「贴花束码」里，就能收到它送的花啦。]';

  // ---------- 渲染器 ----------
  THREE.ColorManagement.enabled = false; // 色板里的十六进制直接当最终颜色用
  var canvas = $('scene');
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false });
  } catch (e) {
    $('fatal').textContent = '这个浏览器打不开 3D 花束（WebGL 不可用）。换 Chrome / Edge / Safari 试试？';
    $('fatal').classList.remove('hidden');
    return;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  var BG = new THREE.Color('#FBF7F0');
  var INK = new THREE.Color('#5B4537');

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  scene.add(new THREE.AmbientLight(0xffffff, 0.66 * PI));
  var sun = new THREE.DirectionalLight(0xfff4e6, 0.46 * PI);
  sun.position.set(2.2, 3.2, 2.6);
  scene.add(sun);
  var pivot = new THREE.Group();
  scene.add(pivot);

  // ---------- 线稿后处理：深度 + 法线找边 ----------
  var normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide, flatShading: true });
  var rtColor = null, rtNormal = null;
  function makeTargets(w, h) {
    if (rtColor) { rtColor.dispose(); rtNormal.dispose(); rtNormal.depthTexture.dispose(); }
    rtColor = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    rtNormal = new THREE.WebGLRenderTarget(w, h);
    rtNormal.depthTexture = new THREE.DepthTexture(w, h);
  }
  var post = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null },
      res: { value: new THREE.Vector2(1, 1) }, px: { value: 1 },
      near: { value: camera.near }, far: { value: camera.far },
      ink: { value: INK }, seed: { value: 0 }, vig: { value: 1 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tColor, tNormal, tDepth;',
      'uniform vec2 res; uniform float px, near, far, seed, vig; uniform vec3 ink;',
      'varying vec2 vUv;',
      'float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main(){',
      '  vec2 o = px / res;',
      '  float dc = texture2D(tDepth, vUv).x;',
      '  float d0 = lin(dc);',
      '  vec3 n0 = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;',
      '  float de = 0.0, ne = 0.0;',
      '  for (int i = 0; i < 8; i++) {',
      '    float a = float(i) * 0.785398;',
      '    vec2 uv = vUv + vec2(cos(a), sin(a)) * o;',
      '    float d = lin(texture2D(tDepth, uv).x);',
      '    de = max(de, abs(d - d0) / min(d, d0));',
      '    vec3 n = texture2D(tNormal, uv).xyz * 2.0 - 1.0;',
      '    ne = max(ne, 1.0 - dot(n0, n));',
      '  }',
      '  float edge = max(smoothstep(0.02, 0.045, de), smoothstep(0.45, 0.8, ne));',
      '  vec3 col = texture2D(tColor, vUv).rgb;',
      '  col = mix(col, ink, edge * 0.88);',
      '  col += (hash(gl_FragCoord.xy + seed) - 0.5) * 0.028;',
      '  col *= mix(1.0 - 0.035 * vig, 1.0, smoothstep(0.85, 0.35, length(vUv - 0.5)));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'),
    depthTest: false, depthWrite: false
  });
  var postScene = new THREE.Scene();
  var postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

  function renderFrame() {
    scene.overrideMaterial = normalMat;
    renderer.setRenderTarget(rtNormal);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    renderer.setRenderTarget(rtColor);
    renderer.setClearColor(BG, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    post.uniforms.tColor.value = rtColor.texture;
    post.uniforms.tNormal.value = rtNormal.texture;
    post.uniforms.tDepth.value = rtNormal.depthTexture;
    renderer.render(postScene, postCam);
  }

  // ---------- 尺寸 / 相机 ----------
  var YAW0 = 0, ELEV0 = 0.14;
  var view = { yaw: YAW0, elev: ELEV0, zoom: 1, dist: 5, cy: 0 };
  var B = null; // 当前花束

  function setSize(w, h, dpr) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    makeTargets(pw, ph);
    post.uniforms.res.value.set(pw, ph);
    post.uniforms.px.value = Math.max(1, dpr * 0.85);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera(h);
  }
  function fitCamera(hPx) {
    if (!B) return;
    var t = Math.tan(camera.fov / 2 * PI / 180);
    var halfH = (B.top - B.bottom) / 2;
    // 给顶部标题和底部按钮留位置
    var uiPad = hPx ? Math.min(0.5, 230 / hPx) : 0.0;
    var dH = halfH * (1.1 + uiPad) / t;
    var dW = B.radius * 1.2 / (t * camera.aspect);
    view.dist = Math.max(dH, dW);
    view.cy = (B.top + B.bottom) / 2 - 0.02;
    // 顶部标题比底部按钮高，花束往下挪一点
    if (hPx) view.cy += 25 * (2 * view.dist * t / hPx);
  }
  function placeCamera() {
    var d = view.dist * view.zoom;
    camera.position.set(0, view.cy + Math.sin(view.elev) * d, Math.cos(view.elev) * d);
    camera.lookAt(0, view.cy, 0);
    pivot.rotation.y = view.yaw;
  }
  function onResize() {
    setSize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
  }
  window.addEventListener('resize', onResize);

  // ---------- 补间动画 ----------
  var tweens = [];
  function tween(dur, fn, ease, delay) {
    return new Promise(function (res) {
      tweens.push({ t: -(delay || 0), dur: dur, fn: fn, ease: ease || easeOutCubic, res: res });
    });
  }
  function stepTweens(dt) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      var k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }
  function easeOutCubic(k) { return 1 - Math.pow(1 - k, 3); }
  function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function easeOutBack(k) { var c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  var TINY = 0.001;

  // ---------- 搭花束 ----------
  var order = null, warnings = [], introing = false, cardState = 'home', cardHome = null;

  function disposeBouquet() {
    if (!B) return;
    pivot.remove(B.root);
    B.root.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    B = null;
  }

  function loadFromHash() {
    var raw = location.hash.replace(/^#/, '');
    var text = '';
    try { text = decodeURIComponent(raw); } catch (e) { text = raw; }
    var isDemo = !/花束/.test(text);
    var res = CF.parseMarker(isDemo ? DEMO : text);
    order = res.order;
    warnings = res.warnings;
    closeAll();
    disposeBouquet();
    B = CFModels.buildBouquet(order, CAT);
    pivot.add(B.root);
    tweens.length = 0;
    cardState = 'home';
    cardHome = { p: B.card.position.clone(), q: B.card.quaternion.clone(), s: 1 };
    view.yaw = YAW0; view.elev = ELEV0; view.zoom = 1;
    onResize();

    var to = $('toLine');
    if (order.to) { $('toName').textContent = order.to; to.classList.remove('hidden'); }
    else to.classList.add('hidden');
    document.title = order.to ? '给 ' + order.to + ' 的花 · 赛博花店' : '赛博花店 · Cyber Florist';

    if (warnings.length && !isDemo) toast('有几处没看懂，已自动处理：<br>' + warnings.map(esc).join('<br>'), 6000);
    if (isDemo) toast('这是一束示例花。点「贴花束码」换成家机送你的那束～', 5000);
    intro();
  }

  function intro() {
    // 调试/截图用：?nointro 跳过开场，?nointro&card 直接打开贺卡
    if (/[?&]nointro/.test(location.search)) {
      introing = false;
      if (/[?&]card/.test(location.search)) setTimeout(openCard, 300);
      if (/[?&]shot/.test(location.search)) setTimeout(saveImage, 300);
      if (/[?&]letter/.test(location.search)) { B.card.visible = false; cardState = 'open'; showLetter(); }
      return;
    }
    introing = true;
    $('hint').classList.add('hidden');
    var all = [B.wrap, B.filler, B.bow, B.card].concat(B.flowers.map(function (f) { return f.group; }));
    all.forEach(function (g) { g.scale.setScalar(TINY); });
    var cardY = cardHome.p.y;

    tween(0.75, function (k) { B.wrap.scale.set(Math.max(TINY, lerp(0.4, 1, k)), Math.max(TINY, k), Math.max(TINY, lerp(0.4, 1, k))); }, easeOutBack, 0.1);
    tween(0.5, function (k) { B.filler.scale.setScalar(Math.max(TINY, k)); }, easeOutCubic, 0.45);
    var t0 = 0.55, step = Math.min(0.13, 1.1 / Math.max(1, B.flowers.length));
    B.flowers.forEach(function (f, i) {
      tween(0.65, function (k) {
        f.group.scale.setScalar(Math.max(TINY, k));
        f.group.position.y = (1 - k) * -0.5;
      }, easeOutBack, t0 + i * step);
    });
    var tEnd = t0 + B.flowers.length * step + 0.3;
    tween(0.5, function (k) { B.bow.scale.setScalar(Math.max(TINY, k)); }, easeOutBack, tEnd);
    tween(0.6, function (k) {
      B.card.scale.setScalar(Math.max(TINY, Math.min(1, k * 1.6)));
      B.card.position.y = cardY - (1 - k) * 0.35;
    }, easeOutBack, tEnd + 0.25).then(function () {
      introing = false;
      var hint = $('hint');
      hint.classList.remove('hidden');
      hint.style.animation = 'none'; void hint.offsetWidth; hint.style.animation = '';
    });
  }

  // ---------- 拖拽 / 缩放 / 点击 ----------
  var pointers = {}, drag = null, pinch = null, yawVel = 0, lastInput = -10, clock = 0;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0 };
    else if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.zoom };
      drag = null;
    }
    lastInput = clock;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) { hover(e); return; }
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    lastInput = clock;
    var ids = Object.keys(pointers);
    if (pinch && ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      view.zoom = clampZoom(pinch.z * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)));
    } else if (drag) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
      if (cardState !== 'home') return;
      view.yaw += dx * 0.009;
      yawVel = dx * 0.009 / 0.016;
      view.elev = Math.min(0.85, Math.max(-0.15, view.elev + dy * 0.005));
    }
  });
  function endPointer(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    if (drag && drag.moved < 8 && !pinch) pick(e.clientX, e.clientY);
    if (Object.keys(pointers).length === 0) { drag = null; pinch = null; }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; drag = null; pinch = null; });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    view.zoom = clampZoom(view.zoom * Math.exp(e.deltaY * 0.001));
    lastInput = clock;
  }, { passive: false });
  function clampZoom(z) { return Math.min(1.6, Math.max(0.5, z)); }

  var raycaster = new THREE.Raycaster();
  function hit(x, y) {
    if (!B) return null;
    var r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1), camera);
    var hits = raycaster.intersectObject(B.root, true);
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      while (o && !(o.userData && o.userData.kind)) o = o.parent;
      if (o) return o.userData;
      if (hits[i].object.parent === B.wrap || hits[i].object.parent === B.filler) return null;
    }
    return null;
  }
  function pick(x, y) {
    if (introing || cardState !== 'home') return;
    var u = hit(x, y);
    if (!u) { hideBubble(); return; }
    if (u.kind === 'card') openCard();
    else if (u.kind === 'flower') showFlower(u.index);
  }
  var hoverT = 0;
  function hover(e) {
    if (e.pointerType !== 'mouse' || clock - hoverT < 0.05) return;
    hoverT = clock;
    canvas.style.cursor = !introing && cardState === 'home' && hit(e.clientX, e.clientY) ? 'pointer' : 'grab';
  }

  // ---------- 花语气泡 ----------
  var bubbleFor = -1;
  function showFlower(i) {
    var f = B.flowers[i], spec = CAT.flowers[f.type], c = spec.colors[f.color - 1];
    $('bubbleDot').style.background = c.hex;
    $('bubbleName').textContent = spec.name;
    $('bubbleMeaning').textContent = c.name + ' · ' + spec.meaning;
    $('bubbleQuote').textContent = '「' + spec.quote + '」';
    var b = $('bubble');
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    bubbleFor = i;
    var g = f.group;
    tween(0.45, function (k) { g.scale.setScalar(1 + Math.sin(k * PI) * 0.07); }, function (k) { return k; });
  }
  function hideBubble() { $('bubble').classList.add('hidden'); bubbleFor = -1; }

  // ---------- 贺卡飞出 ----------
  function openCard() {
    if (cardState !== 'home' || introing) return;
    cardState = 'flying';
    hideBubble();
    yawVel = 0;
    var c = B.card;
    pivot.updateMatrixWorld(true);
    var dir = new V3(); camera.getWorldDirection(dir);
    var targetW = camera.position.clone().add(dir.multiplyScalar(1.4));
    var targetL = pivot.worldToLocal(targetW.clone());
    var pq = pivot.getWorldQuaternion(new THREE.Quaternion());
    var targetQ = pq.invert().multiply(camera.quaternion);
    var p0 = c.position.clone(), q0 = c.quaternion.clone();
    tween(0.8, function (k) {
      c.position.lerpVectors(p0, targetL, k);
      c.position.y += Math.sin(k * PI) * 0.3;
      c.quaternion.slerpQuaternions(q0, targetQ, k);
      c.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.sin(k * PI) * 1.2));
      c.scale.setScalar(lerp(1, 1.5, k));
    }, easeInOut).then(function () {
      c.visible = false;
      showLetter();
      cardState = 'open';
    });
  }
  function closeCard() {
    if (cardState !== 'open') return;
    cardState = 'flying';
    $('letter').classList.add('hidden');
    var c = B.card;
    c.visible = true;
    var p0 = c.position.clone(), q0 = c.quaternion.clone();
    tween(0.6, function (k) {
      c.position.lerpVectors(p0, cardHome.p, k);
      c.quaternion.slerpQuaternions(q0, cardHome.q, k);
      c.scale.setScalar(lerp(1.5, 1, k));
    }, easeInOut).then(function () { cardState = 'home'; lastInput = clock; });
  }
  function showLetter() {
    var card = $('letterCard');
    card.className = 'letter ' + order.card.shape;
    card.style.setProperty('--card', CAT.card.colors[order.card.color - 1].hex);
    var now = new Date();
    $('pmDate').textContent = now.getFullYear() + '.' + pad(now.getMonth() + 1) + '.' + pad(now.getDate());
    $('letterTo').textContent = order.to ? 'To ' + order.to : '';
    $('letterFrom').textContent = order.from ? 'From ' + order.from : '';
    var msg = order.message || '（这张卡片上什么也没写，但花已经替它说了。）';
    var n = Array.from(msg).length;
    var base = { square: 1, round: 0.88, heart: 0.8 }[order.card.shape] || 1;
    var size = Math.round((n <= 30 ? 28 : n <= 70 ? 23 : n <= 140 ? 19 : 16) * base);
    card.style.setProperty('--msg-size', size + 'px');
    card.style.setProperty('--lh', Math.round(size * 1.75) + 'px');
    var m = $('letterMsg');
    m.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = msg;
    m.appendChild(span);
    $('letter').classList.remove('hidden');
  }
  $('letter').addEventListener('click', function (e) {
    if (e.target.closest('.letter-msg') && e.target.closest('.letter-msg').scrollHeight > e.target.closest('.letter-msg').clientHeight) return;
    closeCard();
  });

  // ---------- 截图 ----------
  function saveImage() {
    if (!B) return;
    hideBubble();
    var names = (order.to || '') + (order.from || '') + '送你一束花赛博花店';
    var fontReady = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('60px GreatVibes', 'To From Cyber Florist'), document.fonts.load('60px JasonPen', names)])
      : Promise.resolve();
    fontReady.catch(function () {}).then(function () {
      var W = 1080, H = 1440, S = 1080;
      var w0 = window.innerWidth, h0 = window.innerHeight, d0 = renderer.getPixelRatio();
      setSize(S, S, 1);
      // 截图时用正面视角稍微转一点，并且把贺卡放回原位
      var saved = { zoom: view.zoom, elev: view.elev };
      view.zoom = 1.14; view.elev = ELEV0;
      fitCamera(0);
      view.cy = (B.top + B.bottom) / 2; // 截图里花束上下居中
      placeCamera();
      post.uniforms.vig.value = 0;
      renderFrame();
      post.uniforms.vig.value = 1;
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#FBF7F0'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(canvas, 0, 215, S, S);
      view.zoom = saved.zoom; view.elev = saved.elev;
      setSize(w0, h0, d0);

      var INKC = '#5B4537', SOFT = '#9A8471';
      var HAND = 'GreatVibes, JasonPen, KaiTi, serif';
      ctx.strokeStyle = INKC; ctx.lineWidth = 3;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      ctx.lineWidth = 1.2; ctx.setLineDash([10, 8]);
      ctx.strokeRect(56, 56, W - 112, H - 112);
      ctx.setLineDash([]);
      ctx.fillStyle = INKC; ctx.textAlign = 'center';
      ctx.font = '78px ' + HAND;
      ctx.fillText(order.to ? 'To ' + order.to : '送你一束花', W / 2, 190);
      // 标题下的小分隔线
      ctx.strokeStyle = SOFT; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(W / 2 - 150, 228); ctx.lineTo(W / 2 - 22, 228);
      ctx.moveTo(W / 2 + 22, 228); ctx.lineTo(W / 2 + 150, 228); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, 228, 7, 0, PI * 2); ctx.stroke();
      ctx.font = '64px ' + HAND; ctx.textAlign = 'right';
      if (order.from) ctx.fillText('From ' + order.from, W - 110, H - 150);
      var d = new Date();
      ctx.fillStyle = SOFT; ctx.font = '44px GreatVibes, Georgia, serif';
      ctx.fillText(d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()), W - 110, H - 95);
      ctx.textAlign = 'left'; ctx.fillStyle = INKC;
      ctx.font = '50px ' + HAND;
      ctx.fillText('Cyber Florist', 110, H - 100);

      var url = cv.toDataURL('image/png');
      $('shotImg').src = url;
      var a = $('shotDownload');
      a.href = url;
      a.download = 'cyber-flower-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.png';
      $('shot').classList.remove('hidden');
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---------- 面板 / 按钮 ----------
  function closeAll() {
    ['shot', 'paste', 'letter'].forEach(function (id) { $(id).classList.add('hidden'); });
    hideBubble();
  }
  $('btnCard').onclick = function () { if (cardState === 'open') closeCard(); else openCard(); };
  $('btnShot').onclick = saveImage;
  $('shotClose').onclick = function () { $('shot').classList.add('hidden'); };
  $('shot').addEventListener('click', function (e) { if (e.target === $('shot')) $('shot').classList.add('hidden'); });
  $('btnPaste').onclick = function () {
    $('paste').classList.remove('hidden');
    var raw = location.hash.replace(/^#/, '');
    try { $('pasteText').value = raw ? decodeURIComponent(raw) : ''; } catch (e) { $('pasteText').value = ''; }
  };
  $('pasteClose').onclick = function () { $('paste').classList.add('hidden'); };
  $('paste').addEventListener('click', function (e) { if (e.target === $('paste')) $('paste').classList.add('hidden'); });
  $('pasteGo').onclick = function () {
    var text = $('pasteText').value;
    var found = CF.findMarkers(text);
    var marker = found.length ? found[0].text : text.trim();
    if (!/花束/.test(marker)) { toast('没找到花束码哦，它长这样：[花束:玫瑰1×3|...|寄语:...]', 4000); return; }
    $('paste').classList.add('hidden');
    var next = '#' + encodeURIComponent(marker);
    if (location.hash === next) loadFromHash(); else location.hash = next;
  };
  $('copyLink').onclick = function () { copy(location.href, '链接已复制'); };
  $('copyMenu').onclick = function () { copy(CF.menuPrompt(), '菜单已复制，贴进家机的设定里吧'); };
  window.addEventListener('hashchange', loadFromHash);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (cardState === 'open') closeCard(); closeAll(); } });

  function copy(text, okMsg) {
    var done = function () { toast(okMsg, 2500); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动复制', 2500); }
      ta.remove();
    }
  }
  var toastTimer = 0;
  function toast(html, ms) {
    var t = $('toast');
    t.innerHTML = html;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 3000);
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  // ---------- 主循环 ----------
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    stepTweens(dt);
    var dragging = drag && Object.keys(pointers).length > 0;
    if (!dragging && cardState === 'home') {
      view.yaw += yawVel * dt;
      yawVel *= Math.pow(0.04, dt);
      if (Math.abs(yawVel) < 0.02 && clock - lastInput > 3.5 && !introing && bubbleFor < 0) view.yaw += 0.22 * dt;
    }
    post.uniforms.seed.value = 0;
    placeCamera();
    renderFrame();
    requestAnimationFrame(loop);
  }

  loadFromHash();
  requestAnimationFrame(loop);
  window.__cf = { renderFrame: renderFrame, view: view, get B() { return B; } };
})();
