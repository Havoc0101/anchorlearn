'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const closing = document.querySelector('.closing');
  if (closing && !reducedMotion.matches && 'IntersectionObserver' in window) {
    closing.classList.add('reveal-ready');
    const closingObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        closing.classList.add('is-revealed');
        closingObserver.disconnect();
      }
    }, {threshold: .25});
    closingObserver.observe(closing);
    closing.addEventListener('focusin', () => closing.classList.add('is-revealed'));
  }

  // A damped oscillator gives every control the same restrained physical response.
  const releaseFrames = Array.from({length: 36}, (_, i) => {
    const t = i / 35;
    const response = Math.exp(-8 * t) * (Math.cos(17 * t) + 8 / 17 * Math.sin(17 * t));
    return {scale: String(i === 35 ? 1 : 1 - .035 * response), offset: t};
  });
  document.querySelectorAll('[data-spring]').forEach(control => {
    let animation;
    function down() {
      animation?.cancel();
      control.setAttribute('data-held', '');
    }
    function release() {
      if (!control.hasAttribute('data-held')) return;
      control.removeAttribute('data-held');
      if (!reducedMotion.matches) animation = control.animate(releaseFrames, {duration: 620, easing: 'linear'});
    }
    control.addEventListener('pointerdown', down);
    control.addEventListener('pointerup', release);
    control.addEventListener('pointercancel', release);
    control.addEventListener('pointerleave', release);
    control.addEventListener('blur', release);
    control.addEventListener('keydown', event => {
      if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) down();
    });
    control.addEventListener('keyup', release);
  });

  const guideSteps = [
    {title: '1 · 收到「新录音已整理」提醒', text: '这是软件原有的提示框。点击里面的「查看任务」，就能进入这次录音对应的便签。', note: '当前为示例提醒，自动同步与系统通知待接入。', caption: '示例提醒 · 点击「查看任务」'},
    {title: '2 · 进入这张录音便签', text: '这里展示当前软件的多任务便签：上方是摘要与重点高亮，下方是可展开的任务。右侧保留内容、待确认、注意三个入口。', note: '建议按流程依次看，随时可以回到任一页。', caption: '当前多任务便签 · 使用软件自带示例演示'},
    {title: '3 · （ ）内容：先读重点', text: '点黄点展开每项任务，查看日期、要求和资料；需要完整上下文时，点「查看原文与录音」。', note: '看清要做什么，再去问号页核对不确定的信息。', caption: '括号猫 / 内容 · 摘要重点与可展开的多项任务'},
    {title: '4 · ？待确认：核对疑问', text: '确认截止日期、提交格式和要求。信息不明确就保留待确认，不必猜一个答案。', note: '流程图只展示页面；实际修改和保存由你操作。', caption: '问号狗 / 待确认 · 对照原话核对'},
    {title: '5 · ！注意：别漏掉特别要求', text: '这里提醒你哪些要求需要特别留意。读一遍，再区分原话要求与 AI 的建议。', note: '发现疑问时，可以回问号页继续核对。', caption: '感叹号狐 / 注意 · 检查容易遗漏的事项'},
    {title: '6 · 确认保存，再开始行动', text: '核对完成后按便签中的保存按钮操作，再到「日程」查看。还没有保存过任务时，这里会显示空状态。', note: '流程演示不自动保存；保存任务也不代表已设置系统提醒。', caption: '原版日程 · 查看你已确认保存的任务'}
  ];
  const steps = [...document.querySelectorAll('[data-step]')];
  const productFrame = $('product-guide-frame');
  let activeStep = 0, guideVisible = false, latestDemoOpened = false;
  let demoRetry, demoAttempts = 0;
  function showProductStep() {
    const doc = productFrame.contentDocument;
    const win = productFrame.contentWindow;
    if (!guideVisible || !win.NoteShell || !doc?.getElementById('connected-content')) return;
    const parentScroll = {left: window.scrollX, top: window.scrollY, behavior: 'instant'};
    // Reuse current app UI; enter the multi-task flow instead of the legacy card.
    doc.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    if (activeStep >= 1 && activeStep <= 4 && !latestDemoOpened) {
      // Do not replace restored tasks or a user's draft with a demo.
      if (!doc.getElementById('connected-content')?.textContent.trim()) {
        [...doc.querySelectorAll('button')].find(button => button.textContent.trim() === '三项任务示例')?.click();
      }
      latestDemoOpened = Boolean(doc.getElementById('connected-content')?.textContent.trim());
      // Initial backend reads can briefly lock the app's demo selector.
      if (!latestDemoOpened && demoAttempts++ < 8) {
        clearTimeout(demoRetry);
        demoRetry = setTimeout(showProductStep, 500);
      }
    }
    const currentCard = doc.getElementById('connected-note-card');
    if (activeStep >= 1 && activeStep <= 4 && currentCard && !currentCard.hidden && doc.getElementById('connected-content')?.hidden) currentCard.click();
    const view = activeStep === 0 ? 'home' : activeStep === 5 ? 'schedule' : 'detail';
    win.NoteShell?.navigate(view);
    if (activeStep === 0) doc.getElementById('new-recording')?.click();
    if (activeStep >= 1 && activeStep <= 4) {
      const tab = activeStep <= 2 ? 'content' : activeStep === 3 ? 'pending' : 'attention';
      doc.getElementById(`tab-${tab}`)?.click();
    }
    win.scrollTo({top: 0, behavior: 'instant'});
    window.scrollTo(parentScroll);
  }
  function selectStep(index, activate = true) {
    activeStep = (index + guideSteps.length) % guideSteps.length;
    if (activate) guideVisible = true;
    const item = guideSteps[activeStep];
    $('guide-detail').replaceChildren();
    for (const [tag, value] of [['h3', item.title], ['p', item.text], ['small', item.note]]) {
      const node = document.createElement(tag); node.textContent = value; $('guide-detail').append(node);
    }
    $('guide-caption').textContent = item.caption;
    $('step-count').textContent = `0${activeStep + 1} / 06`;
    $('next-step').textContent = activeStep === 5 ? '从头看看 ↺' : '下一步 →';
    steps.forEach((button, i) => button.setAttribute('aria-pressed', String(i === activeStep)));
    showProductStep();
  }
  steps.forEach((button, i) => button.addEventListener('click', () => selectStep(i)));
  $('next-step').addEventListener('click', () => selectStep(activeStep + 1));
  productFrame.addEventListener('load', () => {
    clearTimeout(demoRetry);
    demoAttempts = 0;
    latestDemoOpened = false;
    const doc = productFrame.contentDocument;
    // Let the app's own reminder handlers finish before opening the current demo.
    doc?.getElementById('view-new-task')?.addEventListener('click', () => queueMicrotask(() => selectStep(1)));
    showProductStep();
  });
  $('refresh-product').addEventListener('click', () => {
    productFrame.contentWindow.location.reload();
  });
  const guideObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      guideVisible = true; showProductStep(); guideObserver.disconnect();
    }
  }, {threshold: .1});
  guideObserver.observe(productFrame);
  selectStep(0, false);

  const canvas = $('recorder-canvas');
  function fallback(message) {
    canvas.hidden = true;
    $('recorder-fallback').removeAttribute('hidden');
    $('reset-view').disabled = true;
    $('press-device').disabled = true;
    $('separate-device').disabled = true;
    $('toggle-motion').disabled = true;
    $('viewer-help').textContent = '静态外形示意';
    $('viewer-status').classList.remove('sr-only');
    $('viewer-status').textContent = message;
  }
  try {
    const gl = canvas.getContext('webgl', {alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power'});
    if (!gl) throw new Error('WebGL unavailable');
    createRecorder(gl);
  } catch (error) {
    // The guide and application links remain usable without a graphics context.
    fallback('当前浏览器未能显示 3D，已切换为静态示意。');
    console.warn('AnchorLearn 3D viewer unavailable:', error.message);
  }

  function createRecorder(gl) {
    const vertexSource = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      uniform mat4 uRotation;
      uniform mat4 uProjection;
      uniform vec3 uOffset;
      uniform vec3 uWorld;
      uniform float uScale;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vLocal;
      void main() {
        vec4 world = uRotation * vec4((aPosition + uOffset) * uScale, 1.0);
        world.xyz += uWorld;
        vPosition = world.xyz;
        vNormal = mat3(uRotation) * aNormal;
        vLocal = aPosition;
        world.z -= 6.5;
        gl_Position = uProjection * world;
      }`;
    const fragmentSource = `
      precision highp float;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vLocal;
      uniform vec3 uColor;
      uniform float uMetal;
      uniform float uRoughness;
      uniform float uEmission;
      uniform float uTime;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 view = normalize(vec3(0.0, 0.0, 6.5) - vPosition);
        vec3 key = normalize(vec3(-3.0 + sin(uTime * 0.28) * 2.0, 4.5, 5.0));
        vec3 fill = normalize(vec3(4.0, 1.0, 2.0));
        vec3 halfKey = normalize(key + view);
        vec3 halfFill = normalize(fill + view);
        float diffuse = 0.34 + 0.55 * max(dot(n, key), 0.0) + 0.18 * max(dot(n, fill), 0.0);
        float broad = pow(max(dot(n, halfKey), 0.0), mix(50.0, 9.0, uRoughness));
        float shine = pow(max(dot(n, halfKey), 0.0), mix(180.0, 45.0, uRoughness));
        float fillShine = pow(max(dot(n, halfFill), 0.0), 20.0);
        float fresnel = pow(1.0 - max(dot(n, view), 0.0), 3.0);
        float grain = fract(sin(dot(vLocal * 1300.0, vec3(12.9898,78.233,37.719))) * 43758.5453) - 0.5;
        vec3 base = pow(uColor, vec3(2.2));
        vec3 color = base * diffuse;
        vec3 softbox = vec3(0.97, 0.985, 1.0);
        color += softbox * broad * mix(0.025, 0.13, uMetal);
        color += softbox * shine * (1.0 - uRoughness) * 0.13;
        color += vec3(0.88, 0.93, 1.0) * fillShine * uMetal * 0.065;
        color += softbox * fresnel * uMetal * 0.07;
        float ribbon = exp(-pow((vPosition.x * .55 + vPosition.y * .25 - sin(uTime * .23) * 1.6) * 2.0, 2.0));
        color += vec3(.92,.96,1.0) * ribbon * uMetal * .022;
        color += grain * 0.006 * (0.2 + uRoughness);
        color += base * uEmission;
        gl_FragColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
      }`;
    function shader(type, source) {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(result);
        gl.deleteShader(result);
        throw new Error(message || 'Shader compilation failed');
      }
      return result;
    }
    const vertex = shader(gl.VERTEX_SHADER, vertexSource);
    const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed');
    gl.useProgram(program);
    const attribute = {position: gl.getAttribLocation(program, 'aPosition'), normal: gl.getAttribLocation(program, 'aNormal')};
    const uniforms = {};
    ['Rotation', 'Projection', 'Offset', 'Color', 'Metal', 'Roughness', 'Emission', 'Scale', 'World', 'Time'].forEach(name => {
      uniforms[name] = gl.getUniformLocation(program, `u${name}`);
    });
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);

    function normalize(v) {
      const length = Math.hypot(...v) || 1;
      return v.map(n => n / length);
    }
    class Mesh {
      constructor(color, metal = .2, roughness = .6, part = '') {
        this.vertices = [];
        this.color = color;
        this.metal = metal;
        this.roughness = roughness;
        this.part = part;
      }
      triangle(a, b, c, na, nb = na, nc = na) {
        this.vertices.push(...a, ...na, ...b, ...nb, ...c, ...nc);
      }
      upload() {
        this.count = this.vertices.length / 6;
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
        this.vertices = null;
        return this;
      }
    }
    // Surfaces of revolution preserve a continuous rounded edge at every angle.
    function lathe(mesh, profile, segments = 144, center = [0, 0, 0], back = false) {
      const normals = profile.map((point, i) => {
        const before = profile[Math.max(0, i - 1)];
        const after = profile[Math.min(profile.length - 1, i + 1)];
        return normalize([before[1] - after[1], after[0] - before[0]]);
      });
      function sample(i, angle) {
        const [r, z] = profile[i];
        const [nr, nz] = normals[i];
        return {
          p: [center[0] + r * Math.cos(angle), center[1] + r * Math.sin(angle), center[2] + (back ? -z : z)],
          n: [nr * Math.cos(angle), nr * Math.sin(angle), back ? -nz : nz]
        };
      }
      for (let j = 0; j < profile.length - 1; j++) {
        for (let i = 0; i < segments; i++) {
          const a = sample(j, i * Math.PI * 2 / segments);
          const b = sample(j, (i + 1) * Math.PI * 2 / segments);
          const c = sample(j + 1, (i + 1) * Math.PI * 2 / segments);
          const d = sample(j + 1, i * Math.PI * 2 / segments);
          mesh.triangle(a.p, b.p, c.p, a.n, b.n, c.n);
          mesh.triangle(a.p, c.p, d.p, a.n, c.n, d.n);
        }
      }
    }
    function ellipsoid(mesh, center, radius, rings = 18, segments = 32) {
      function sample(p, t) {
        const unit = [Math.sin(p) * Math.cos(t), Math.cos(p), Math.sin(p) * Math.sin(t)];
        return {p: unit.map((v, i) => center[i] + v * radius[i]), n: normalize(unit.map((v, i) => v / radius[i]))};
      }
      for (let j = 0; j < rings; j++) {
        for (let i = 0; i < segments; i++) {
          const a = sample(j * Math.PI / rings, i * Math.PI * 2 / segments);
          const b = sample(j * Math.PI / rings, (i + 1) * Math.PI * 2 / segments);
          const c = sample((j + 1) * Math.PI / rings, (i + 1) * Math.PI * 2 / segments);
          const d = sample((j + 1) * Math.PI / rings, i * Math.PI * 2 / segments);
          mesh.triangle(a.p, b.p, c.p, a.n, b.n, c.n);
          mesh.triangle(a.p, c.p, d.p, a.n, c.n, d.n);
        }
      }
    }
    function capsule(mesh, center, halfLength, radius, depth, rotation = 0, back = false) {
      const segments = 64;
      function position(t, z, shrink = 0) {
        const x = Math.sign(Math.cos(t)) * halfLength + (radius - shrink) * Math.cos(t);
        const y = (radius - shrink) * Math.sin(t);
        return [center[0] + x * Math.cos(rotation) - y * Math.sin(rotation), center[1] + x * Math.sin(rotation) + y * Math.cos(rotation), center[2] + (back ? -z : z)];
      }
      const face = [0, 0, back ? -1 : 1];
      const top = [center[0], center[1], center[2] + (back ? -depth : depth)];
      for (let i = 0; i < segments; i++) {
        const a = i * Math.PI * 2 / segments;
        const b = (i + 1) * Math.PI * 2 / segments;
        const p = position(a, depth, .008);
        const q = position(b, depth, .008);
        const r = position(a, 0);
        const s = position(b, 0);
        const na = normalize([Math.cos(a + rotation), Math.sin(a + rotation), back ? -.3 : .3]);
        const nb = normalize([Math.cos(b + rotation), Math.sin(b + rotation), back ? -.3 : .3]);
        mesh.triangle(top, p, q, face);
        mesh.triangle(p, r, s, na, na, nb);
        mesh.triangle(p, s, q, na, nb, nb);
      }
    }
    const body = new Mesh([.27, .29, .32], .65, .61);
    lathe(body, [[0,.49],[.70,.49],[.94,.47],[1.07,.43],[1.15,.37],[1.20,.29],[1.224,.18],[1.225,-.24],[1.20,-.33],[1.15,-.40],[1.05,-.45],[.8,-.47],[0,-.47]]);
    const face = new Mesh([.25,.27,.30], .48, .8);
    lathe(face, [[0,.497],[.6,.498],[.86,.485],[1,.456],[1.055,.431]]);
    const rim = new Mesh([.37,.39,.365], .9, .3);
    lathe(rim, [[1.197,-.322],[1.205,-.31],[1.215,-.302],[1.219,-.29],[1.216,-.278]]);
    const grilleRim = new Mesh([.30,.315,.292], .8, .44);
    const grille = new Mesh([.071,.082,.067], .15, .95);
    const meshThreads = new Mesh([.23,.25,.219], .65, .54);
    const hole = new Mesh([.035,.046,.032], .1, .8);
    [-1, 1].forEach(side => {
      const center = [-.20 * side, .80 * side, .470];
      const angle = .16;
      capsule(grilleRim, center, .155, .079, .017, angle);
      capsule(grille, [center[0], center[1], .489], .155, .060, .005, angle);
      for (let row = -1; row <= 1; row++) {
        for (let col = -5; col <= 5; col++) {
          const x = col * .033 + (row === 0 ? .014 : 0);
          const y = row * .028;
          if (Math.abs(x) > .182) continue;
          const spot = [center[0] + x * Math.cos(angle) - y * Math.sin(angle), center[1] + x * Math.sin(angle) + y * Math.cos(angle), .498];
          ellipsoid(meshThreads, spot, [.014,.014,.003], 6, 10);
          ellipsoid(hole, [spot[0],spot[1],.501], [.009,.009,.002], 6, 10);
        }
      }
    });
    const keySurround = new Mesh([.10,.12,.097], .32, .7);
    ellipsoid(keySurround, [1.205,.03,-.014], [.094,.253,.129]);
    const key = new Mesh([.42,.445,.41], .85, .35, 'key');
    ellipsoid(key, [1.262,.03,-.014], [.047,.205,.096]);
    const ledRim = new Mesh([.20,.23,.18], .35, .5);
    ellipsoid(ledRim, [-.20,.566,.499], [.035,.035,.009], 12, 20);
    const led = new Mesh([.58,.54,.35], .2, .34, 'led');
    ellipsoid(led, [-.20,.566,.509], [.022,.022,.005], 12, 20);
    const rear = new Mesh([.145,.165,.137], .4, .65);
    lathe(rear, [[0,.473],[.66,.473],[.72,.492],[.75,.498],[.80,.48],[.86,.465]], 112, [0,0,0], true);
    const clip = new Mesh([.28,.30,.268], .7, .5);
    capsule(clip, [0,0,-.49], .54, .18, .11, Math.PI / 2, true);
    const contacts = new Mesh([.51,.47,.32], .85, .4);
    [-.27,.27].forEach(x => ellipsoid(contacts, [x,-.48,-.499], [.039,.039,.007], 10, 16));
    const beanMeshes = [body, face, rim, grilleRim, grille, meshThreads, hole, keySurround, key, ledRim, led, rear, clip, contacts].map(mesh => mesh.upload());

    // Concave outline: the circular dock opens at the upper-right corner,
    // matching the supplied official case reference rather than a closed box.
    const outline = [];
    function arc(cx, cy, radius, start, end, count = 20) {
      for (let i = 0; i <= count; i++) {
        const angle = start + (end - start) * i / count;
        outline.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
      }
    }
    arc(-1.05, 1.03, .42, Math.PI, Math.PI / 2);
    outline.push([.09, 1.45], [.09, .75]);
    arc(.8, .75, .71, Math.PI, Math.PI * 2, 48);
    outline.push([1.51, -1.07]);
    arc(1.09, -1.07, .42, 0, -Math.PI / 2);
    arc(-1.05, -1.07, .42, -Math.PI / 2, -Math.PI);
    for (let i=outline.length-1;i>0;i--) {
      if (Math.hypot(outline[i][0]-outline[i-1][0],outline[i][1]-outline[i-1][1]) < 1e-6) outline.splice(i,1);
    }
    const caseBody = new Mesh([.27,.29,.32], .73, .42);
    function cross(a,b,c) { return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]); }
    // Ear clipping triangulates the concave top without covering the dock.
    function triangulate(points) {
      const ids = points.map((_, i) => i), triangles = [];
      let budget = ids.length * ids.length;
      const inside = (p,a,b,c) => cross(a,b,p) <= 1e-8 && cross(b,c,p) <= 1e-8 && cross(c,a,p) <= 1e-8;
      while (ids.length > 3 && budget-- > 0) {
        let cut = false;
        for (let j = 0; j < ids.length; j++) {
          const a = ids[(j+ids.length-1)%ids.length], b = ids[j], c = ids[(j+1)%ids.length];
          if (cross(points[a],points[b],points[c]) >= -1e-8) continue;
          if (ids.some(i => i !== a && i !== b && i !== c && inside(points[i],points[a],points[b],points[c]))) continue;
          triangles.push([a,b,c]); ids.splice(j,1); cut = true; break;
        }
        if (!cut) throw new Error('Case outline triangulation failed');
      }
      if (ids.length === 3) triangles.push([...ids]);
      return triangles;
    }
    function extrude(mesh, points, front, back) {
      triangulate(points).forEach(triangle => {
        mesh.triangle(...triangle.map(i=>[...points[i],front]), [0,0,1]);
        mesh.triangle(...triangle.map(i=>[...points[i],back]), [0,0,-1]);
      });
      for (let i = 0; i < points.length; i++) {
        const p=points[i], q=points[(i+1)%points.length];
        const before=points[(i+points.length-1)%points.length], after=points[(i+2)%points.length];
        const n=normalize([before[1]-q[1],q[0]-before[0],0]);
        const m=normalize([p[1]-after[1],after[0]-p[0],0]);
        const a=[...p,front],b=[...q,front],c=[...q,back],d=[...p,back];
        mesh.triangle(a,b,c,n,m,m); mesh.triangle(a,c,d,n,m,n);
      }
    }
    extrude(caseBody, outline, .03, -.37);
    const caseSeam = new Mesh([.37,.40,.44], .88, .3);
    extrude(caseSeam, outline.map(([x,y])=>[x*1.003,y*1.003]), -.18, -.20);
    const dock = new Mesh([.18,.20,.23], .7, .5);
    lathe(dock, [[0,-.27],[.56,-.27],[.67,-.24],[.71,-.20]], 96, [.8,.75,0]);
    const casePort = new Mesh([.04,.055,.07], .3, .6);
    capsule(casePort, [-.25,-1.40,.035], .12,.027,.009);
    const caseLight = new Mesh([.65,.69,.72], .5,.4);
    [-.78,-.65,-.52].forEach(x=>ellipsoid(caseLight,[x,-1.40,.041],[.012,.012,.004],8,12));
    const caseButton = new Mesh([.39,.42,.45], .8,.35);
    capsule(caseButton,[.45,-1.40,.035],.13,.032,.012);
    const strap = new Mesh([.17,.19,.22], .1,.95);
    // A hollow ribbon loop leaves the top opening visible at oblique angles.
    for (let i=0;i<64;i++) {
      const t=i*Math.PI*2/64, u=(i+1)*Math.PI*2/64;
      const sample=(angle,x)=>[x,1.43+.35*Math.cos(angle),-.23+.12*Math.sin(angle)];
      const n=[0,Math.cos(t),Math.sin(t)], m=[0,Math.cos(u),Math.sin(u)];
      const a=sample(t,.48),b=sample(t,.90),c=sample(u,.90),d=sample(u,.48);
      strap.triangle(a,b,c,n,n,m);strap.triangle(a,c,d,n,m,m);
    }
    const caseMeshes = [caseBody,caseSeam,dock,casePort,caseLight,caseButton,strap].map(mesh=>mesh.upload());

    function multiply(a, b) {
      const result = new Float32Array(16);
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
          for (let i = 0; i < 4; i++) result[col * 4 + row] += a[i * 4 + row] * b[col * 4 + i];
        }
      }
      return result;
    }
    function rotation(x, y, z) {
      const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
      const rx = [1,0,0,0, 0,cx,sx,0, 0,-sx,cx,0, 0,0,0,1];
      const ry = [cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1];
      const rz = [cz,sz,0,0, -sz,cz,0,0, 0,0,1,0, 0,0,0,1];
      return multiply(rz, multiply(rx, ry));
    }
    function perspective(aspect) {
      const f = 1 / Math.tan(31 * Math.PI / 360), near = .1, far = 50;
      return new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0]);
    }
    const defaultPose = {x: -.29, y: -.43};
    const pitch = {value: defaultPose.x, target: defaultPose.x, velocity: 0};
    const yaw = {value: defaultPose.y, target: defaultPose.y, velocity: 0};
    const press = {value: 0, target: 0, velocity: 0};
    const separation = {value: 0, target: 0, velocity: 0};
    let separated = false, paused = reducedMotion.matches, orbit = 0, elapsed = 0;
    let raf = 0, previousTime = 0, inView = true, lost = false, pressTimer, statusTimer;
    function spring(state, dt, stiffness, damping) {
      if (reducedMotion.matches) {
        state.value = state.target;
        state.velocity = 0;
        return false;
      }
      state.velocity += ((state.target - state.value) * stiffness - state.velocity * damping) * dt;
      state.value += state.velocity * dt;
      if (Math.abs(state.target - state.value) < .00008 && Math.abs(state.velocity) < .0002) {
        state.value = state.target;
        state.velocity = 0;
        return false;
      }
      return true;
    }
    function render() {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const progress = Math.max(0, Math.min(1, separation.value));
      const narrow = width < 700 || width / height < 1.5;
      const sceneScale = narrow ? Math.min(.98, width / height * .81) : .99;
      const releasedBeanScale = narrow ? Math.min(.80, width / height * .55) : .80;
      const releasedCaseScale = releasedBeanScale / .80;
      const assembledRotation = rotation(-.13, -.35 + Math.sin(orbit) * .48, -.10);
      gl.uniformMatrix4fv(uniforms.Projection, false, perspective(width / height));
      gl.uniform1f(uniforms.Time, elapsed);
      function draw(meshes, matrix, scale, world) {
        gl.uniformMatrix4fv(uniforms.Rotation, false, matrix);
        gl.uniform1f(uniforms.Scale, scale);
        gl.uniform3fv(uniforms.World, world);
        meshes.forEach(mesh => {
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
          gl.enableVertexAttribArray(attribute.position); gl.enableVertexAttribArray(attribute.normal);
          gl.vertexAttribPointer(attribute.position, 3, gl.FLOAT, false, 24, 0);
          gl.vertexAttribPointer(attribute.normal, 3, gl.FLOAT, false, 24, 12);
          gl.uniform3fv(uniforms.Color, mesh.color);
          gl.uniform1f(uniforms.Metal, mesh.metal);
          gl.uniform1f(uniforms.Roughness, mesh.roughness);
          gl.uniform1f(uniforms.Emission, mesh.part === 'led' ? .4 + Math.max(0, press.value)*3 : 0);
          gl.uniform3f(uniforms.Offset, mesh.part === 'key' ? -press.value*.064 : 0, 0, 0);
          gl.drawArrays(gl.TRIANGLES,0,mesh.count);
        });
      }
      // The case moves independently; the bean remains centered once released.
      const caseSize = sceneScale * (1-progress) + releasedCaseScale * progress;
      const caseMatrix = rotation(-.13*(1-progress)-.10*progress, (-.35 + Math.sin(orbit)*.48)*(1-progress) - (narrow ? 1.32 : .85)*progress, -.10*(1-progress)-.08*progress);
      const halfView = 6.75 * Math.tan(31 * Math.PI / 360);
      const edgeMargin = narrow ? .025 : -.18;
      const caseX = progress * (-halfView * width / height + releasedCaseScale * (narrow ? .55 : .90) + edgeMargin);
      draw(caseMeshes,caseMatrix,caseSize,[caseX,0,-.25*progress]);
      const seat = [.8*sceneScale,.75*sceneScale,.08*sceneScale];
      const seated = [0,1,2].map(row => assembledRotation[row]*seat[0]+assembledRotation[4+row]*seat[1]+assembledRotation[8+row]*seat[2]);
      const beanMatrix = rotation(-.13*(1-progress)+pitch.value*progress,(-.35+Math.sin(orbit)*.48)*(1-progress)+yaw.value*progress,-.10*(1-progress)-.24*progress);
      const beanScale = .53 * sceneScale * (1-progress) + releasedBeanScale * progress;
      const beanWorld = seated.map(v=>v*(1-progress));
      draw(beanMeshes,beanMatrix,beanScale,beanWorld);
      canvas.dataset.caseScale = caseSize.toFixed(3);
      canvas.dataset.beanScale = beanScale.toFixed(3);
      canvas.dataset.beanCenterX = beanWorld[0].toFixed(3);
      canvas.dataset.state = separated ? 'separated' : 'assembled';
      canvas.dataset.separation = progress.toFixed(3);
      canvas.dataset.orbit = orbit.toFixed(3);
      $('ground-shadow').style.opacity = String(.47 + .10 * Math.abs(Math.cos(yaw.value)));
      canvas.dataset.yaw = yaw.value.toFixed(3);
      canvas.dataset.pitch = pitch.value.toFixed(3);
      canvas.dataset.renderer = 'webgl';
    }
    function frame(time) {
      raf = 0;
      if (lost || !inView || document.hidden) { previousTime = 0; return; }
      const dt = previousTime ? Math.min((time - previousTime) / 1000, .032) : .016;
      previousTime = time;
      const automatic = !separated && !paused && !reducedMotion.matches;
      if (automatic) orbit += dt * .22;
      if (!paused && !reducedMotion.matches) elapsed += dt;
      const movingSeparation = spring(separation, dt, 58, 15);
      const movingPitch = spring(pitch, dt, 145, 22);
      const movingYaw = spring(yaw, dt, 145, 22);
      const movingKey = spring(press, dt, 310, 19);
      render();
      if (automatic || movingSeparation || movingPitch || movingYaw || movingKey) raf = requestAnimationFrame(frame);
      else previousTime = 0;
    }
    function wake() {
      if (!raf && !lost && inView && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function setSeparated(value) {
      separated = value; separation.target = value ? 1 : 0;
      if (value) { pitch.target=defaultPose.x; yaw.target=defaultPose.y; }
      $('separate-device').textContent = value ? '收回壳中 ↙' : '取出录音豆 ↗';
      $('press-device').hidden = !value;
      $('toggle-motion').hidden = value;
      $('viewer-help').textContent = value ? '拖动旋转 · 轻点体验按键' : '轻点，让录音豆与壳子分离';
      $('viewer-status').textContent = value ? '外壳移到左侧，录音豆已取出。可拖动旋转或点按体验。' : '录音豆已收回壳中。';
      $('studio').classList.toggle('is-separated',value);
      wake();
    }
    function updateMotionButton() {
      $('toggle-motion').textContent = paused ? '▷' : 'Ⅱ';
      $('toggle-motion').setAttribute('aria-label', paused ? '继续自动旋转' : '暂停自动旋转');
      $('toggle-motion').setAttribute('aria-pressed', String(paused));
      $('toggle-motion').disabled = reducedMotion.matches || lost;
      if (reducedMotion.matches) $('toggle-motion').setAttribute('aria-label', '已按偏好减少动态效果');
    }
    $('toggle-motion').addEventListener('click',()=>{paused=!paused;updateMotionButton();wake();});
    $('separate-device').addEventListener('click',()=>setSeparated(!separated));
    updateMotionButton();
    function reset() {
      pitch.target = defaultPose.x;
      yaw.target = defaultPose.y;
      orbit = 0;
      $('viewer-status').textContent = '视角已复位。';
      wake();
    }
    function pressKey() {
      clearTimeout(pressTimer);
      clearTimeout(statusTimer);
      press.target = 1;
      $('sound-card').classList.add('is-pressed');
      $('sound-state').textContent = '按键回弹演示';
      $('viewer-status').textContent = '正在演示按压与回弹，不会开始真实录音。';
      pressTimer = setTimeout(() => { press.target = 0; wake(); }, 145);
      statusTimer = setTimeout(() => {
        $('sound-card').classList.remove('is-pressed');
        $('sound-state').textContent = '让每个声音，有处安放。';
      }, 950);
      wake();
    }
    $('reset-view').addEventListener('click', reset);
    $('press-device').addEventListener('click', pressKey);
    let drag = null;
    canvas.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: 0};
      canvas.dataset.pointerFocus = 'true';
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({preventScroll: true});
    });
    canvas.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.lastX, dy = event.clientY - drag.lastY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (!separated) return;
      yaw.target += dx * .009;
      pitch.target = Math.max(-1.35, Math.min(1.35, pitch.target + dy * .008));
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      wake();
    });
    canvas.addEventListener('pointerup', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const clicked = drag.moved < 5;
      drag = null;
      if (!separated && clicked) setSeparated(true);
      else if (clicked) pressKey();
      else $('viewer-status').textContent = '已调整录音豆视角，可继续拖动或复位。';
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('lostpointercapture', () => { drag = null; });
    canvas.addEventListener('blur', () => { delete canvas.dataset.pointerFocus; });
    canvas.addEventListener('keydown', event => {
      delete canvas.dataset.pointerFocus;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home',' ','Enter'].includes(event.key)) event.preventDefault();
      if (event.key.startsWith('Arrow') && !separated) setSeparated(true);
      if (event.key === 'ArrowLeft') yaw.target -= .28;
      if (event.key === 'ArrowRight') yaw.target += .28;
      if (event.key === 'ArrowUp') pitch.target = Math.max(-1.35, pitch.target - .2);
      if (event.key === 'ArrowDown') pitch.target = Math.min(1.35, pitch.target + .2);
      if (event.key === 'Home') reset();
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
        if (!separated) setSeparated(true); else pressKey();
      }
      wake();
    });
    new ResizeObserver(wake).observe(canvas);
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (!inView && raf) { cancelAnimationFrame(raf); raf = 0; previousTime = 0; }
      if (inView) wake();
    }, {rootMargin: '100px'}).observe(canvas);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; previousTime = 0; }
      else wake();
    });
    reducedMotion.addEventListener('change', () => { paused=reducedMotion.matches; updateMotionButton(); wake(); });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      clearTimeout(pressTimer);
      clearTimeout(statusTimer);
      fallback('3D 显示已暂停，已切换为静态示意；刷新页面可重试。');
    });
    wake();
  }
})();
