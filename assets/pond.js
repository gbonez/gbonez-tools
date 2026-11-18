// The pond: a wave-equation height field drawn as ordered-dither dots.
// Pointer/touch drops ripples in; the lilypad links bob on the water.
(function () {
  'use strict';

  const canvas = document.getElementById('pond');
  const ctx = canvas.getContext('2d', { alpha: false });
  const padEls = Array.from(document.querySelectorAll('.pad'));
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const TAU = Math.PI * 2;
  const BG = '#121315';
  const PINPRICK = '#26272a';
  // Dot tiers by how far a cell's brightness clears its dither threshold.
  const TIERS = [
    { color: '#6c6a63', r: 1.0 },
    { color: '#c9c5b6', r: 1.5 },
    { color: '#9dffc4', r: 2.1 }
  ];

  const STEP = 1 / 50;      // simulation tick (s)
  const GAIN = 1.7;         // height -> brightness

  // 8x8 Bayer matrix, normalised to (0,1).
  const BAYER = (function () {
    let m = [[0]];
    for (let size = 1; size < 8; size *= 2) {
      const n = Array.from({ length: size * 2 }, () => new Array(size * 2));
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = m[y][x] * 4;
          n[y][x] = v;
          n[y][x + size] = v + 2;
          n[y + size][x] = v + 3;
          n[y + size][x + size] = v + 1;
        }
      }
      m = n;
    }
    const flat = new Float32Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) flat[y * 8 + x] = (m[y][x] + 0.5) / 64;
    return flat;
  })();

  let W = 0, H = 0, dpr = 1, cell = 9, cols = 0, rows = 0;
  let cur, prev, next, base, jx, jy;
  let bufX, bufY, counts;
  let layer = null;

  const pads = padEls.map((el, i) => ({
    el, hx: 0, hy: 0, r: 0,
    ox: 0, oy: 0, vx: 0, vy: 0, rot: 0,
    phase: i * 2.1 + 0.7,
    nextRipple: 1500 + i * 1700
  }));

  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    cell = W < 640 ? 7 : 9;
    cols = Math.ceil(W / cell) + 2;
    rows = Math.ceil(H / cell) + 2;
    const n = cols * rows;

    cur = new Float32Array(n);
    prev = new Float32Array(n);
    next = new Float32Array(n);
    base = new Float32Array(n);
    jx = new Float32Array(n);
    jy = new Float32Array(n);
    bufX = TIERS.map(() => new Float32Array(n));
    bufY = TIERS.map(() => new Float32Array(n));
    counts = new Int32Array(TIERS.length);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const nx = x / cols - 0.5;
        const ny = y / rows - 0.5;
        const vignette = Math.max(0, 1 - Math.pow(Math.hypot(nx, ny) * 1.35, 2.2));
        const slow = 0.5 + 0.5 * Math.sin(x * 0.07 + 1.3) * Math.sin(y * 0.06 + 0.4);
        const grain = hash(x, y);
        base[i] = (0.07 + 0.15 * (0.55 * slow + 0.45 * grain)) * (0.35 + 0.65 * vignette);
        jx[i] = (hash(y, x + 7) - 0.5) * cell * 0.55;
        jy[i] = (hash(x + 13, y) - 0.5) * cell * 0.55;
      }
    }

    // Static layer: background plus a faint pinprick in every cell.
    layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lctx = layer.getContext('2d');
    lctx.scale(dpr, dpr);
    lctx.fillStyle = BG;
    lctx.fillRect(0, 0, W, H);
    lctx.fillStyle = PINPRICK;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        lctx.fillRect(x * cell + jx[i], y * cell + jy[i], 1, 1);
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateHomes();
  }

  function updateHomes() {
    pads.forEach(p => {
      p.hx = p.el.offsetLeft + p.el.offsetWidth / 2;
      p.hy = p.el.offsetTop + p.el.offsetHeight / 2;
      p.r = p.el.offsetWidth * 0.34;
    });
  }

  function damping() {
    return reducedQuery.matches ? 0.972 : 0.99;
  }

  function step() {
    const c = cur, p = prev, n = next, d = damping();
    for (let y = 1; y < rows - 1; y++) {
      let i = y * cols + 1;
      for (let x = 1; x < cols - 1; x++, i++) {
        n[i] = ((c[i - 1] + c[i + 1] + c[i - cols] + c[i + cols]) * 0.5 - p[i]) * d;
      }
    }
    const t = prev;
    prev = cur;
    cur = next;
    next = t;
  }

  function splash(px, py, amp, rad) {
    const gx = Math.round(px / cell);
    const gy = Math.round(py / cell);
    const reach = Math.ceil(rad * 2);
    const inv = 1 / (rad * rad);
    for (let dy = -reach; dy <= reach; dy++) {
      const y = gy + dy;
      if (y < 1 || y >= rows - 1) continue;
      for (let dx = -reach; dx <= reach; dx++) {
        const x = gx + dx;
        if (x < 1 || x >= cols - 1) continue;
        cur[y * cols + x] += amp * Math.exp(-(dx * dx + dy * dy) * inv);
      }
    }
  }

  function sample(px, py) {
    const x = Math.min(cols - 2, Math.max(1, Math.round(px / cell)));
    const y = Math.min(rows - 2, Math.max(1, Math.round(py / cell)));
    return cur[y * cols + x];
  }

  function draw() {
    ctx.drawImage(layer, 0, 0, W, H);
    counts.fill(0);

    for (let y = 0; y < rows; y++) {
      const brow = (y & 7) * 8;
      const py = y * cell;
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const e = base[i] + cur[i] * GAIN - BAYER[brow + (x & 7)];
        if (e <= 0) continue;
        const t = e < 0.35 ? 0 : e < 0.72 ? 1 : 2;
        const k = counts[t]++;
        bufX[t][k] = x * cell + jx[i];
        bufY[t][k] = py + jy[i];
      }
    }

    for (let t = 0; t < TIERS.length; t++) {
      const r = TIERS[t].r;
      const xs = bufX[t], ys = bufY[t];
      ctx.fillStyle = TIERS[t].color;
      ctx.beginPath();
      for (let k = 0; k < counts[t]; k++) {
        ctx.moveTo(xs[k] + r, ys[k]);
        ctx.arc(xs[k], ys[k], r, 0, TAU);
      }
      ctx.fill();
    }
  }

  function updatePads(now) {
    const ts = now / 1000;
    const calm = reducedQuery.matches;

    pads.forEach(p => {
      const cx = p.hx + p.ox;
      const cy = p.hy + p.oy;
      const r = p.r;

      // Wave height on each side of the pad: its slope pushes and tilts it.
      const hR = sample(cx + r, cy), hL = sample(cx - r, cy);
      const hD = sample(cx, cy + r), hU = sample(cx, cy - r);
      const gx = (hR - hL) * 0.5;
      const gy = (hD - hU) * 0.5;
      const h = (hR + hL + hD + hU + sample(cx, cy)) / 5;

      const tx = calm ? 0 : Math.sin(ts * 0.35 + p.phase) * 9;
      const ty = calm ? 0 : Math.cos(ts * 0.27 + p.phase * 1.3) * 7;

      p.vx = (p.vx - gx * 2.2 + (tx - p.ox) * 0.012) * 0.92;
      p.vy = (p.vy - gy * 2.2 + (ty - p.oy) * 0.012) * 0.92;
      p.ox = Math.max(-44, Math.min(44, p.ox + p.vx));
      p.oy = Math.max(-44, Math.min(44, p.oy + p.vy));

      const sway = calm ? 0 : Math.sin(ts * 0.31 + p.phase * 0.8) * 3;
      const rotTarget = (gy - gx) * 16 + sway;
      p.rot += (rotTarget - p.rot) * 0.1;

      const lift = 1 + Math.max(-1, Math.min(1, h)) * 0.035;
      p.el.style.transform = `translate3d(${p.ox.toFixed(2)}px, ${p.oy.toFixed(2)}px, 0) scale(${lift.toFixed(3)})`;
      p.el.style.setProperty('--rot', `${p.rot.toFixed(2)}deg`);

      if (!calm && now > p.nextRipple) {
        splash(cx, cy, 0.32, 2.2);
        p.nextRipple = now + 2600 + Math.random() * 3200;
      }
    });
  }

  let nextDrop = 900;
  function ambient(now) {
    if (reducedQuery.matches || now < nextDrop) return;
    splash(Math.random() * W, Math.random() * H, 0.5 + Math.random() * 0.45, 1.6);
    nextDrop = now + 1400 + Math.random() * 2400;
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(0.05, (now - last) / 1000);
    last = now;
    let ticks = 0;
    while (acc >= STEP && ticks < 3) {
      step();
      acc -= STEP;
      ticks++;
    }
    if (ticks === 3) acc = 0;
    ambient(now);
    updatePads(now);
    draw();
    requestAnimationFrame(frame);
  }

  // ── input ────────────────────────────────────────────────────────────────
  let lx = null, ly = null;

  window.addEventListener('pointermove', e => {
    const x = e.clientX, y = e.clientY;
    if (lx === null) { lx = x; ly = y; }
    const dx = x - lx, dy = y - ly;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (cell * 0.75)));
    const amp = 0.12 + Math.min(dist / steps, 30) * 0.006;
    for (let s = 1; s <= steps; s++) {
      splash(lx + (dx * s) / steps, ly + (dy * s) / steps, amp, 1.8);
    }
    lx = x;
    ly = y;
  }, { passive: true });

  window.addEventListener('pointerdown', e => {
    splash(e.clientX, e.clientY, 2.4, 3.2);
    lx = e.clientX;
    ly = e.clientY;
  }, { passive: true });

  const lift = () => { lx = null; ly = null; };
  window.addEventListener('pointerup', lift, { passive: true });
  window.addEventListener('pointercancel', lift, { passive: true });
  document.addEventListener('pointerleave', lift, { passive: true });

  padEls.forEach(el => {
    const ripple = () => {
      const p = pads[padEls.indexOf(el)];
      splash(p.hx + p.ox, p.hy + p.oy, 1.3, 3.4);
    };
    el.addEventListener('pointerenter', ripple);
    el.addEventListener('focus', ripple);
  });

  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; build(); });
  });

  build();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateHomes);
  requestAnimationFrame(frame);
})();
