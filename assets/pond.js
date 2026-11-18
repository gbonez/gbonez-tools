// The pond: a wave-equation height field drawn as ordered-dither dots.
// Pointer/touch drops ripples in, the water drops a few on its own, and the
// link bubbles drift around it, freezing whenever the pointer is on one.
(function () {
  'use strict';

  const canvas = document.getElementById('pond');
  const ctx = canvas.getContext('2d', { alpha: false });
  const bubbleEls = Array.from(document.querySelectorAll('.bubble'));
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

  // Bubble motion, in px and seconds.
  const SEEK = 26;          // pull toward the current wander target
  const WANDER = 14;        // sideways meander
  const DRAG = 0.9;         // water resistance
  const WALL = 70;          // push back from the edges
  const SEPARATION = 240;   // keep bubbles from overlapping
  const WAVE_PUSH = 110;    // ripples nudge bubbles downhill

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

  const bubbles = bubbleEls.map((el, i) => ({
    el,
    body: el.querySelector('.bubble-body'),
    ready: false,
    hx: 0, hy: 0, r: 0,          // start position and radius
    x: 0, y: 0, vx: 0, vy: 0,
    ax: 0, ay: 0,
    tx: 0, ty: 0, nextTarget: 0, // wander target
    phase: i * 2.3 + 0.9,
    sx: 1, sy: 1,                // squash/stretch, eased
    held: false,
    wake: 0
  }));

  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function build() {
    const prevW = W, prevH = H;
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
    placeBubbles(prevW, prevH);
  }

  function placeBubbles(prevW, prevH) {
    bubbles.forEach(b => {
      b.hx = b.el.offsetLeft + b.el.offsetWidth / 2;
      b.hy = b.el.offsetTop + b.el.offsetHeight / 2;
      b.r = b.el.offsetWidth / 2;
      if (!b.ready) {
        b.x = b.hx;
        b.y = b.hy;
        b.ready = true;
      } else if (prevW && prevH) {
        b.x *= W / prevW;
        b.y *= H / prevH;
      }
      const lim = limits(b);
      b.x = clamp(b.x, lim.l, lim.r);
      b.y = clamp(b.y, lim.t, lim.b);
      b.nextTarget = 0;
    });
  }

  // Where a bubble's centre may go: clear of the corner readouts.
  function limits(b) {
    const l = b.r + 20, r = W - b.r - 20;
    const t = b.r + 60, bt = H - b.r - 56;
    return {
      l: Math.min(l, W / 2), r: Math.max(r, W / 2),
      t: Math.min(t, H / 2), b: Math.max(bt, H / 2)
    };
  }

  function damping() {
    return reducedQuery.matches ? 0.985 : 0.99;
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
    const x = clamp(Math.round(px / cell), 1, cols - 2);
    const y = clamp(Math.round(py / cell), 1, rows - 2);
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

  // ── bubbles ───────────────────────────────────────────────────────────────
  let pointer = null; // { x, y } while a mouse is over the page or a finger is down

  function isHeld(b) {
    if (document.activeElement === b.el && b.el.matches(':focus-visible')) return true;
    return !!pointer && Math.hypot(pointer.x - b.x, pointer.y - b.y) < b.r * 1.04;
  }

  function pickTarget(b, now) {
    const lim = limits(b);
    let tx = b.x, ty = b.y;
    // Prefer somewhere well away from here so trips cross the page.
    for (let tries = 0; tries < 8; tries++) {
      tx = lim.l + Math.random() * (lim.r - lim.l);
      ty = lim.t + Math.random() * (lim.b - lim.t);
      if (Math.hypot(tx - b.x, ty - b.y) > Math.min(W, H) * 0.3) break;
    }
    b.tx = tx;
    b.ty = ty;
    b.nextTarget = now + 6000 + Math.random() * 7000;
  }

  function updateBubbles(now, dt) {
    const ts = now / 1000;
    const calm = reducedQuery.matches;

    bubbles.forEach(b => {
      b.ax = 0;
      b.ay = 0;
      b.held = isHeld(b);
      if (b.held) return;

      if (calm) {
        // No wandering: ease back to the start spot.
        b.ax += (b.hx - b.x) * 2;
        b.ay += (b.hy - b.y) * 2;
      } else {
        if (now > b.nextTarget || Math.hypot(b.tx - b.x, b.ty - b.y) < b.r * 0.8) pickTarget(b, now);
        const dx = b.tx - b.x, dy = b.ty - b.y;
        const d = Math.hypot(dx, dy) || 1;
        b.ax += (dx / d) * SEEK;
        b.ay += (dy / d) * SEEK;

        // Sideways meander, perpendicular to the current heading.
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 1) {
          const w = Math.sin(ts * 0.7 + b.phase) * 0.6 + Math.sin(ts * 1.31 + b.phase * 2.3) * 0.4;
          b.ax += (-b.vy / sp) * w * WANDER;
          b.ay += (b.vx / sp) * w * WANDER;
        }
      }

      // Soft walls.
      const lim = limits(b);
      const soft = 90;
      if (b.x < lim.l + soft) b.ax += ((lim.l + soft - b.x) / soft) * WALL;
      if (b.x > lim.r - soft) b.ax -= ((b.x - (lim.r - soft)) / soft) * WALL;
      if (b.y < lim.t + soft) b.ay += ((lim.t + soft - b.y) / soft) * WALL;
      if (b.y > lim.b - soft) b.ay -= ((b.y - (lim.b - soft)) / soft) * WALL;

      // Ripples nudge it downhill.
      const r = b.r * 0.8;
      b.ax -= ((sample(b.x + r, b.y) - sample(b.x - r, b.y)) * 0.5) * WAVE_PUSH;
      b.ay -= ((sample(b.x, b.y + r) - sample(b.x, b.y - r)) * 0.5) * WAVE_PUSH;
    });

    // Bubbles ease apart instead of overlapping; a held one stays put.
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], c = bubbles[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const min = (a.r + c.r) * 1.35 + 24;
        if (d >= min) continue;
        const push = ((min - d) / min) * SEPARATION;
        const nx = dx / d, ny = dy / d;
        if (!a.held) { a.ax -= nx * push; a.ay -= ny * push; }
        if (!c.held) { c.ax += nx * push; c.ay += ny * push; }
      }
    }

    bubbles.forEach(b => {
      // Slow down as the pointer closes in, then stop dead on it.
      let slow = 0;
      if (pointer) {
        const d = Math.hypot(pointer.x - b.x, pointer.y - b.y);
        slow = clamp((b.r * 2.2 - d) / (b.r * 1.2), 0, 1);
      }
      const drag = b.held ? 30 : DRAG + slow * 5;

      b.vx = (b.vx + b.ax * dt) * Math.exp(-drag * dt);
      b.vy = (b.vy + b.ay * dt) * Math.exp(-drag * dt);
      if (b.held && Math.hypot(b.vx, b.vy) < 2) { b.vx = 0; b.vy = 0; }

      const maxV = 70;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > maxV) { b.vx *= maxV / sp; b.vy *= maxV / sp; }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      const lim = limits(b);
      if (b.x < lim.l) { b.x = lim.l; b.vx = Math.abs(b.vx) * 0.3; }
      if (b.x > lim.r) { b.x = lim.r; b.vx = -Math.abs(b.vx) * 0.3; }
      if (b.y < lim.t) { b.y = lim.t; b.vy = Math.abs(b.vy) * 0.3; }
      if (b.y > lim.b) { b.y = lim.b; b.vy = -Math.abs(b.vy) * 0.3; }

      // A faint wake behind a moving bubble.
      const speed = Math.hypot(b.vx, b.vy);
      if (!b.held && !calm) {
        b.wake += speed * dt;
        if (b.wake > 30) {
          splash(b.x, b.y, 0.05 + speed * 0.0015, 2.6);
          b.wake = 0;
        }
      }

      // Soft squash and stretch along the motion; the text never moves.
      const fx = clamp(Math.abs(b.vx) / 45, 0, 1);
      const fy = clamp(Math.abs(b.vy) / 45, 0, 1);
      const breathe = clamp(sample(b.x, b.y), -1, 1) * 0.03;
      const tsx = 1 + fx * 0.05 - fy * 0.03 + breathe;
      const tsy = 1 + fy * 0.05 - fx * 0.03 + breathe;
      b.sx += (tsx - b.sx) * 0.12;
      b.sy += (tsy - b.sy) * 0.12;

      b.el.style.transform = `translate3d(${(b.x - b.hx).toFixed(2)}px, ${(b.y - b.hy).toFixed(2)}px, 0)`;
      b.body.style.transform = `scale(${b.sx.toFixed(3)}, ${b.sy.toFixed(3)})`;
    });
  }

  // ── ambient ripples ───────────────────────────────────────────────────────
  // A few light drops on their own, so the pond is never still.
  let nextDrop = 1200;
  function ambient(now) {
    if (now < nextDrop) return;
    const calm = reducedQuery.matches;
    const amp = 0.45 + Math.random() * 0.35;
    const x = Math.random() * W, y = Math.random() * H;
    splash(x, y, amp, 2.1);
    // Now and then, a second drop close behind the first.
    if (!calm && Math.random() < 0.22) {
      setTimeout(() => splash(x + (Math.random() - 0.5) * 140, y + (Math.random() - 0.5) * 140, amp * 0.8, 1.6), 260);
    }
    // Same light drops either way; reduced-motion visitors just get fewer.
    nextDrop = now + (calm ? 4000 + Math.random() * 3000 : 2200 + Math.random() * 3600);
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    let ticks = 0;
    while (acc >= STEP && ticks < 3) {
      step();
      acc -= STEP;
      ticks++;
    }
    if (ticks === 3) acc = 0;
    ambient(now);
    updateBubbles(now, dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ── input ────────────────────────────────────────────────────────────────
  let lx = null, ly = null;

  window.addEventListener('pointermove', e => {
    const x = e.clientX, y = e.clientY;
    pointer = { x, y };
    if (lx === null) { lx = x; ly = y; }
    const dx = x - lx, dy = y - ly;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (cell * 1.2)));
    const amp = 0.04 + Math.min(dist / steps, 24) * 0.0022;
    for (let s = 1; s <= steps; s++) {
      splash(lx + (dx * s) / steps, ly + (dy * s) / steps, amp, 1.6);
    }
    lx = x;
    ly = y;
  }, { passive: true });

  window.addEventListener('pointerdown', e => {
    pointer = { x: e.clientX, y: e.clientY };
    splash(e.clientX, e.clientY, 1.3, 2.6);
    lx = e.clientX;
    ly = e.clientY;
  }, { passive: true });

  // A lifted finger isn't hovering; a mouse still is.
  const lift = e => {
    lx = null;
    ly = null;
    if (e.pointerType && e.pointerType !== 'mouse') pointer = null;
  };
  window.addEventListener('pointerup', lift, { passive: true });
  window.addEventListener('pointercancel', lift, { passive: true });
  // Fires only when the pointer actually leaves the page.
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; lx = null; ly = null; }, { passive: true });

  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; build(); });
  });

  build();
  requestAnimationFrame(frame);
})();
