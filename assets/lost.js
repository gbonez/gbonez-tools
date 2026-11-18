// 404: the "0" is a googly eye, and a tiny man holds the Home bubble on a leash.
(function () {
  'use strict';

  const eyeEl = document.getElementById('eye');
  const pupil = document.getElementById('pupil');
  const lid = document.getElementById('lid');
  const person = document.getElementById('person');
  const arm = document.getElementById('arm');
  const hand = document.getElementById('hand');
  const legL = document.getElementById('legL');
  const legR = document.getElementById('legR');
  const leash = document.getElementById('leash');
  const knot = document.getElementById('knot');
  const say = document.getElementById('say');
  const turb = document.getElementById('boilTurb');
  const bubble = document.querySelector('.bubble--home');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const RAD = Math.PI / 180;

  let W = innerWidth, H = innerHeight;
  let pointer = null;

  window.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  window.addEventListener('pointerdown', e => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  window.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') pointer = null; }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; }, { passive: true });
  window.addEventListener('resize', () => { W = innerWidth; H = innerHeight; });

  // ── pupil: a loose googly spring ──────────────────────────────────────────
  const pup = { x: 0, y: 0, vx: 0, vy: 0 };
  const RANGE_X = 24, RANGE_Y = 30;

  function stepEye(f, bc) {
    const r = eyeEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.52;
    const target = pointer || bc; // no pointer (touch)? watch the bubble instead
    const dx = target.x - cx, dy = target.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const k = clamp(d / 140, 0, 1);
    const tx = (dx / d) * RANGE_X * k;
    const ty = (dy / d) * RANGE_Y * k;

    pup.vx = (pup.vx + (tx - pup.x) * 0.16 * f) * Math.pow(0.8, f);
    pup.vy = (pup.vy + (ty - pup.y) * 0.16 * f) * Math.pow(0.8, f);
    pup.x += pup.vx * f;
    pup.y += pup.vy * f;

    // Keep the pupil inside the eye, bouncing it a little off the rim.
    const n = Math.hypot(pup.x / (RANGE_X + 2), pup.y / (RANGE_Y + 2));
    if (n > 1) {
      pup.x /= n;
      pup.y /= n;
      pup.vx *= -0.35;
      pup.vy *= -0.35;
    }
    pupil.setAttribute('transform', `translate(${pup.x.toFixed(2)} ${pup.y.toFixed(2)})`);
  }

  // ── blinking ─────────────────────────────────────────────────────────────
  let blinkStart = -1, nextBlink = 1800, doubleBlink = false;

  function stepBlink(now) {
    if (reduced.matches) return;
    if (blinkStart < 0 && now > nextBlink) blinkStart = now;
    if (blinkStart >= 0) {
      const t = (now - blinkStart) / 240;
      if (t >= 1) {
        lid.setAttribute('height', 0);
        blinkStart = -1;
        if (!doubleBlink && Math.random() < 0.3) {
          doubleBlink = true;
          nextBlink = now + 140;
        } else {
          doubleBlink = false;
          nextBlink = now + 2200 + Math.random() * 3200;
        }
      } else {
        lid.setAttribute('height', (106 * Math.sin(Math.PI * t)).toFixed(1));
      }
    }
  }

  // ── tiny man + leash ─────────────────────────────────────────────────────
  const LINES = ['come back!', 'sir??', 'pls hold still', 'i have a leash', 'nobody panic', 'it was right here'];
  let lineIdx = 0, nextLine = 0;
  let lastB = null, effort = 0.5;

  function stepMan(now, f, bc, br) {
    const t = now / 1000;
    const s = W < 480 ? 0.85 : 1.15;
    const px = clamp(W * 0.15, 66, 240);
    const py = H - 70;

    const held = !!pointer && Math.hypot(pointer.x - bc.x, pointer.y - bc.y) < br * 1.05;
    const speed = lastB ? Math.hypot(bc.x - lastB.x, bc.y - lastB.y) / Math.max(f, 0.2) : 0;
    lastB = bc;
    effort += ((held ? 0.1 : clamp(0.35 + speed * 0.7, 0.35, 1)) - effort) * 0.08 * f;
    const calm = reduced.matches;
    const e = calm ? 0 : effort;

    const lean = clamp(((bc.x - px) / W) * 22, -16, 16) + (calm ? 0 : Math.sin(t * 17) * 0.9 * e);
    const bob = calm ? 0 : Math.abs(Math.sin(t * 7)) * -2 * e;
    person.setAttribute('transform', `translate(${px.toFixed(1)} ${(py + bob).toFixed(1)}) rotate(${lean.toFixed(2)}) scale(${s})`);

    const swing = Math.sin(t * 7) * 15 * e;
    legL.setAttribute('transform', `rotate(${swing.toFixed(1)} -7 -34)`);
    legR.setAttribute('transform', `rotate(${(-swing).toFixed(1)} 7 -34)`);

    // The near arm points at the bubble.
    const lr = lean * RAD;
    const shoulderX = px + s * (11 * Math.cos(lr) + 62 * Math.sin(lr));
    const shoulderY = py + bob + s * (11 * Math.sin(lr) - 62 * Math.cos(lr));
    let ang = Math.atan2(bc.y - shoulderY, bc.x - shoulderX);
    ang = clamp(ang, -175 * RAD, 50 * RAD) - lr;
    const hx = 11 + 31 * Math.cos(ang);
    const hy = -62 + 31 * Math.sin(ang);
    arm.setAttribute('d', `M11 -62 L${hx.toFixed(1)} ${hy.toFixed(1)}`);
    hand.setAttribute('cx', hx.toFixed(1));
    hand.setAttribute('cy', hy.toFixed(1));

    // Hand → screen, then a sagging leash to the bubble's edge.
    const handX = px + s * (hx * Math.cos(lr) - hy * Math.sin(lr));
    const handY = py + bob + s * (hx * Math.sin(lr) + hy * Math.cos(lr));
    let vx = handX - bc.x, vy = handY - bc.y;
    const vd = Math.hypot(vx, vy) || 1;
    const ex = bc.x + (vx / vd) * br * 0.97;
    const ey = bc.y + (vy / vd) * br * 0.97;
    const len = Math.hypot(ex - handX, ey - handY);
    const sag = clamp(len * 0.13, 8, 64) * (calm ? 1 : 0.85 + 0.15 * Math.sin(t * 3.1)) * (held ? 1.4 : 1);
    leash.setAttribute('d', `M${handX.toFixed(1)} ${handY.toFixed(1)} Q${((handX + ex) / 2).toFixed(1)} ${((handY + ey) / 2 + sag).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
    knot.setAttribute('cx', ex.toFixed(1));
    knot.setAttribute('cy', ey.toFixed(1));

    if (held) {
      say.textContent = 'got it!';
      nextLine = now + 1800;
    } else if (now > nextLine) {
      say.textContent = LINES[lineIdx++ % LINES.length];
      nextLine = now + 3300;
    }
  }

  // ── loop ─────────────────────────────────────────────────────────────────
  let last = performance.now();
  function frame(now) {
    const f = clamp((now - last) / 16.667, 0.2, 3);
    last = now;
    const r = bubble.getBoundingClientRect();
    const bc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    stepEye(f, bc);
    stepBlink(now);
    stepMan(now, f, bc, r.width / 2);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Re-seeding the noise a few times a second is what makes the lines boil.
  if (!reduced.matches) {
    let seed = 1;
    setInterval(() => {
      seed = (seed % 5) + 1;
      turb.setAttribute('seed', seed);
    }, 150);
  }
})();
