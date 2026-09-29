"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Full-bleed canvas behind the walkthrough. One scene, four beats:
 * 0 Together (coins fly in and ring up), 1 Pay in (coins drop into the pot),
 * 2 Jackpot (the pot bursts, one coin flies forward), 3 Your wallet (it lands on a phone).
 * Everything is drawn in code, so motion starts on the first frame. Reduced motion draws
 * each beat's settled pose once and never loops.
 */
export function JackpotScene({ beat, className }: { beat: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const beatRef = useRef(beat);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createScene(canvas, beatRef.current, reduceMotion);
    sceneRef.current = scene;
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, [reduceMotion]);

  useEffect(() => {
    beatRef.current = beat;
    sceneRef.current?.setBeat(beat);
  }, [beat]);

  return <canvas ref={canvasRef} data-testid="walkthrough-scene" aria-hidden className={className} />;
}

type Scene = { setBeat: (beat: number) => void; destroy: () => void };
type Coin = { x: number; y: number; r: number; spin: number; a: number };
type Layout = { w: number; h: number; cx: number; cy: number; s: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number };

const TAU = Math.PI * 2;
const COINS = 8;
const WINNER = 0;
const BURST_AT = 0.35;
// Settled moment drawn for reduced motion.
const STILL_TIME = 2.6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

function createScene(canvas: HTMLCanvasElement, initialBeat: number, still: boolean): Scene {
  const context = canvas.getContext("2d");
  if (!context) return { setBeat: () => {}, destroy: () => {} };
  const ctx: CanvasRenderingContext2D = context;

  let L: Layout = { w: 1, h: 1, cx: 0, cy: 0, s: 1 };
  let beat = initialBeat;
  let beatStart = performance.now();
  const t0 = beatStart;
  let blendFor = 1.4;
  let from: Coin[] = [];
  let current: Coin[] = [];
  let sparks: Spark[] = [];
  let burstDone = false;
  let raf = 0;
  let frame = 0;
  let last = t0;
  // Smoothed props so the pot and phone fade between beats instead of popping.
  const props = { pot: 0, phone: 0, ring: 0 };

  const dust = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: 0.5 + Math.random() * 1.8,
    speed: 0.008 + Math.random() * 0.025,
    phase: Math.random() * TAU,
  }));

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min(1.4, w / 390, (h * 0.62) / 520);
    L = { w, h, cx: w / 2, cy: h * 0.4, s };
    if (from.length === 0) from = edgeStart(L);
    if (still) draw(performance.now());
  };

  const setBeat = (next: number) => {
    if (next === beat) return;
    from = current.length ? current.map((c) => ({ ...c })) : edgeStart(L);
    beat = next;
    beatStart = performance.now();
    blendFor = 0.9;
    burstDone = false;
    sparks = [];
    if (still) draw(beatStart);
  };

  function draw(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = still ? STILL_TIME : (now - t0) / 1000;
    const tb = still ? STILL_TIME : (now - beatStart) / 1000;
    const blend = still ? 1 : easeInOut(clamp01(tb / blendFor));
    const { w, h, cx, cy, s } = L;
    const potY = cy + 70 * s;

    ctx.clearRect(0, 0, w, h);
    drawLight(ctx, L, t);
    drawDust(ctx, L, t, dust);

    current = Array.from({ length: COINS }, (_, i) => {
      const to = pose(beat, i, tb, t, L);
      const f = from[i] ?? to;
      return {
        x: lerp(f.x, to.x, blend),
        y: lerp(f.y, to.y, blend),
        r: lerp(f.r, to.r, blend),
        spin: lerp(f.spin, to.spin, blend),
        a: lerp(f.a, to.a, blend),
      };
    });

    const approach = (key: keyof typeof props, target: number, rate = 6) => {
      props[key] = still ? target : lerp(props[key], target, 1 - Math.exp(-dt * rate));
    };
    approach("ring", beat === 0 ? 1 : 0);
    approach("pot", beat === 1 || (beat === 2 && tb < BURST_AT) ? 1 : 0, beat === 2 ? 14 : 6);
    approach("phone", beat === 3 ? 1 : 0);

    // Beat 0: the circle the coins join.
    if (props.ring > 0.01) {
      ctx.save();
      ctx.globalAlpha = props.ring * 0.55;
      ctx.strokeStyle = "rgba(52, 211, 153, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 7]);
      ctx.lineDashOffset = -t * 12;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 105 * s, 94.5 * s, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Beat 2: the burst.
    if (beat === 2 && tb >= BURST_AT) {
      if (!burstDone) {
        burstDone = true;
        if (!still) sparks = burstSparks(cx, potY - 10 * s, s);
      }
      drawBurst(ctx, cx, potY - 10 * s, s, still ? 1.2 : tb - BURST_AT);
      const k = easeOut(clamp01((tb - BURST_AT) / 1.1));
      drawRays(ctx, current[WINNER].x, current[WINNER].y, current[WINNER].r, t, k);
    }

    if (props.phone > 0.01) drawPhone(ctx, L, props.phone, tb, still);
    if (props.pot > 0.01) drawPotBack(ctx, cx, potY, s, props.pot);

    for (const [i, c] of current.entries()) if (i !== WINNER) drawCoin(ctx, c);
    // The winner draws last so it passes in front on the jackpot.
    if (beat < 2) drawCoin(ctx, current[WINNER]);
    if (props.pot > 0.01) drawPotFront(ctx, cx, potY, s, props.pot, beat === 1 ? tb : 0);
    if (beat >= 2) drawCoin(ctx, current[WINNER]);

    if (beat === 3) drawLanding(ctx, current[WINNER], tb, s, still);

    sparks = sparks.filter((p) => p.life > 0);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of sparks) {
      p.vy += 260 * s * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.8;
      ctx.globalAlpha = clamp01(p.life);
      ctx.fillStyle = "#F7E7A1";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8 * s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    frame++;
    canvas.dataset.beat = String(beat);
    // A cheap heartbeat for tests: changes only while the loop runs.
    if (frame % 6 === 0 || still) canvas.dataset.frame = still ? "still" : String(frame);
  }

  const loop = (now: number) => {
    draw(now);
    raf = requestAnimationFrame(loop);
  };

  canvas.dataset.playing = String(!still);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  if (!still) raf = requestAnimationFrame(loop);

  return {
    setBeat,
    destroy: () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    },
  };
}

/** Where coin i wants to be at this moment of a beat. */
function pose(beat: number, i: number, tb: number, t: number, L: Layout): Coin {
  const { cx, cy, s } = L;
  const potY = cy + 70 * s;
  if (beat === 0) {
    const angle = (i / COINS) * TAU + t * 0.35;
    return {
      x: cx + Math.cos(angle) * 105 * s,
      y: cy + Math.sin(angle) * 94.5 * s,
      r: 17 * s,
      spin: t * 1.6 + i,
      a: 1,
    };
  }
  if (beat === 1) {
    const p = (tb * 0.5 + i / COINS) % 1;
    return {
      x: cx + ((i % 4) - 1.5) * 16 * s * (1 - p * 0.7),
      y: lerp(cy - 200 * s, potY - 4 * s, p * p),
      r: 15 * s,
      spin: tb * 5 + i,
      a: p < 0.1 ? p / 0.1 : p > 0.9 ? (1 - p) / 0.1 : 1,
    };
  }
  if (beat === 2) {
    const mouth = potY - 10 * s;
    const k = easeOut(clamp01((tb - BURST_AT) / 1.1));
    if (i === WINNER) {
      const shake = tb < BURST_AT ? Math.sin(tb * 70) * 2 * s : 0;
      return {
        x: cx + shake,
        y: lerp(mouth, cy - 40 * s, k) + Math.sin(t * 1.6) * 4 * s * k,
        r: lerp(15 * s, 58 * s, k),
        // Spins hard out of the pot, then settles face-on with a gentle wobble.
        spin: (1 - k) * tb * 12 + k * Math.sin(t * 1.3) * 0.5,
        a: 1,
      };
    }
    const angle = ((i - 1) / (COINS - 1)) * TAU + t * 0.15;
    const d = easeOut(clamp01((tb - BURST_AT) / 1.4)) * 165 * s;
    return {
      x: cx + Math.cos(angle) * d,
      y: mouth + Math.sin(angle) * d * 0.85,
      r: 10 * s,
      spin: t * 3 + i,
      a: tb < BURST_AT ? 0 : lerp(1, 0.35, k),
    };
  }
  // Beat 3: the winner settles on the phone screen; the rest dissolve into the dust.
  if (i === WINNER) {
    return {
      x: cx,
      y: cy - 42 * s + Math.sin(t * 1.4) * 2.5 * s,
      r: 30 * s,
      spin: Math.sin(t * 1.2) * 0.6,
      a: 1,
    };
  }
  const angle = (i / COINS) * TAU + t * 0.1;
  return { x: cx + Math.cos(angle) * 220 * s, y: cy + Math.sin(angle) * 220 * s, r: 6 * s, spin: t, a: 0 };
}

function edgeStart(L: Layout): Coin[] {
  const far = Math.max(L.w, L.h) * 0.75;
  return Array.from({ length: COINS }, (_, i) => {
    const angle = (i / COINS) * TAU + 0.4;
    return {
      x: L.cx + Math.cos(angle) * far,
      y: L.cy + Math.sin(angle) * far,
      r: 22 * L.s,
      spin: i * 1.7,
      a: 1,
    };
  });
}

function drawCoin(ctx: CanvasRenderingContext2D, c: Coin) {
  if (c.a <= 0.01 || c.r < 0.5) return;
  const face = Math.cos(c.spin);
  const sx = Math.max(0.14, Math.abs(face));
  ctx.save();
  ctx.globalAlpha = c.a;
  ctx.translate(c.x, c.y);

  const glow = ctx.createRadialGradient(0, 0, c.r * 0.3, 0, 0, c.r * 2.2);
  glow.addColorStop(0, "rgba(212, 175, 55, 0.32)");
  glow.addColorStop(1, "rgba(212, 175, 55, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, c.r * 2.2, 0, TAU);
  ctx.fill();

  // Edge: a darker coin peeking out on the side it is turning towards.
  const edge = (1 - sx) * c.r * 0.16 * Math.sign(face || 1);
  ctx.save();
  ctx.scale(sx, 1);
  ctx.fillStyle = "#8A6A17";
  ctx.beginPath();
  ctx.arc(edge / sx, 0, c.r, 0, TAU);
  ctx.fill();

  const body = ctx.createLinearGradient(-c.r, -c.r, c.r, c.r);
  body.addColorStop(0, "#F8E7A0");
  body.addColorStop(0.45, "#D4AF37");
  body.addColorStop(1, "#9C7A1E");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, c.r, 0, TAU);
  ctx.fill();

  ctx.lineWidth = Math.max(1, c.r * 0.07);
  ctx.strokeStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(0, 0, c.r * 0.9, 0, TAU);
  ctx.stroke();

  ctx.lineWidth = Math.max(0.8, c.r * 0.05);
  ctx.strokeStyle = "rgba(122, 92, 18, 0.55)";
  ctx.beginPath();
  ctx.arc(0, 0, c.r * 0.66, 0, TAU);
  ctx.stroke();

  // Shine
  ctx.lineWidth = Math.max(1, c.r * 0.12);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 250, 225, 0.55)";
  ctx.beginPath();
  ctx.arc(0, 0, c.r * 0.46, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawLight(ctx: CanvasRenderingContext2D, L: Layout, t: number) {
  const { w, h, cx, cy } = L;
  const big = Math.max(w, h);
  const blob = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  blob(w * (0.2 + Math.sin(t * 0.21) * 0.08), h * 0.88, big * 0.6, "rgba(16, 185, 129, 0.22)");
  blob(w * (0.8 + Math.cos(t * 0.17) * 0.08), h * (0.18 + Math.sin(t * 0.13) * 0.05), big * 0.5, "rgba(212, 175, 55, 0.14)");
  // Stage light under the scene, breathing slowly.
  blob(cx, cy, big * (0.32 + Math.sin(t * 0.9) * 0.02), "rgba(212, 175, 55, 0.12)");
  ctx.restore();
}

function drawDust(ctx: CanvasRenderingContext2D, L: Layout, t: number, dust: { x: number; y: number; size: number; speed: number; phase: number }[]) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#E9C866";
  for (const d of dust) {
    const y = (((d.y - t * d.speed) % 1) + 1) % 1;
    const x = d.x + Math.sin(t * 0.4 + d.phase) * 0.015;
    ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 + d.phase));
    ctx.beginPath();
    ctx.arc(x * L.w, y * L.h, d.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

const POT_W = 78;

function drawPotBack(ctx: CanvasRenderingContext2D, cx: number, y: number, s: number, a: number) {
  ctx.save();
  ctx.globalAlpha = a;
  const inner = ctx.createRadialGradient(cx, y, 0, cx, y, POT_W * s);
  inner.addColorStop(0, "rgba(212, 175, 55, 0.55)");
  inner.addColorStop(1, "#1b120a");
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.ellipse(cx, y, POT_W * s, 17 * s, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPotFront(ctx: CanvasRenderingContext2D, cx: number, y: number, s: number, a: number, filling: number) {
  const W = POT_W * s;
  ctx.save();
  ctx.globalAlpha = a;
  const body = ctx.createLinearGradient(cx - W, y, cx + W, y + 80 * s);
  body.addColorStop(0, "#5a3f1c");
  body.addColorStop(0.5, "#2c1d0e");
  body.addColorStop(1, "#140d07");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cx - W, y);
  ctx.bezierCurveTo(cx - W, y + 70 * s, cx - W * 0.5, y + 88 * s, cx, y + 88 * s);
  ctx.bezierCurveTo(cx + W * 0.5, y + 88 * s, cx + W, y + 70 * s, cx + W, y);
  ctx.ellipse(cx, y, W, 17 * s, 0, 0, Math.PI);
  ctx.fill();

  ctx.strokeStyle = "#D4AF37";
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.ellipse(cx, y, W, 17 * s, 0, 0, TAU);
  ctx.stroke();
  // Emerald band, matching the coin ring.
  ctx.strokeStyle = "rgba(16, 185, 129, 0.8)";
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.ellipse(cx, y + 34 * s, W * 0.93, 13 * s, 0, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // Glow rising out of the pot as it fills.
  const glowA = 0.25 + 0.2 * Math.sin(filling * 5) ** 2 + Math.min(0.3, filling * 0.08);
  const g = ctx.createRadialGradient(cx, y - 6 * s, 0, cx, y - 6 * s, W * 1.1);
  g.addColorStop(0, `rgba(248, 231, 160, ${glowA})`);
  g.addColorStop(1, "rgba(248, 231, 160, 0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, y - 6 * s, W * 1.1, 40 * s, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function burstSparks(x: number, y: number, s: number): Spark[] {
  return Array.from({ length: 46 }, () => {
    const angle = Math.random() * TAU;
    const speed = (120 + Math.random() * 260) * s;
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 140 * s, life: 0.7 + Math.random() * 0.6 };
  });
}

function drawBurst(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, since: number) {
  if (since > 1.2) return;
  const k = clamp01(since / 1.2);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const flash = ctx.createRadialGradient(x, y, 0, x, y, 180 * s);
  flash.addColorStop(0, `rgba(255, 244, 200, ${0.9 * (1 - k)})`);
  flash.addColorStop(1, "rgba(255, 244, 200, 0)");
  ctx.fillStyle = flash;
  ctx.beginPath();
  ctx.arc(x, y, 180 * s, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(212, 175, 55, ${1 - k})`;
  ctx.lineWidth = 3 * s * (1 - k) + 0.5;
  ctx.beginPath();
  ctx.arc(x, y, easeOut(k) * 200 * s, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawRays(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, k: number) {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  ctx.rotate(t * 0.25);
  const reach = r * 3.4;
  const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, reach);
  g.addColorStop(0, `rgba(248, 231, 160, ${0.35 * k})`);
  g.addColorStop(1, "rgba(248, 231, 160, 0)");
  ctx.fillStyle = g;
  for (let i = 0; i < 12; i++) {
    ctx.rotate(TAU / 12);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(reach, -reach * 0.09);
    ctx.lineTo(reach, reach * 0.09);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const PHONE = { w: 132, h: 250, top: -110 };

function drawPhone(ctx: CanvasRenderingContext2D, L: Layout, a: number, tb: number, still: boolean) {
  const { cx, cy, s } = L;
  const w = PHONE.w * s;
  const h = PHONE.h * s;
  const x = cx - w / 2;
  const y = cy + PHONE.top * s + (1 - a) * 40 * s;
  ctx.save();
  ctx.globalAlpha = a;

  roundRect(ctx, x, y, w, h, 24 * s);
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.stroke();

  const pad = 7 * s;
  roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 18 * s);
  const screen = ctx.createLinearGradient(x, y, x, y + h);
  screen.addColorStop(0, "rgba(6, 40, 30, 0.85)");
  screen.addColorStop(1, "rgba(20, 13, 8, 0.9)");
  ctx.fillStyle = screen;
  ctx.fill();

  roundRect(ctx, cx - 18 * s, y + 14 * s, 36 * s, 7 * s, 3.5 * s);
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fill();

  // Approve button: fills in once the coin has landed, then a check draws itself.
  const bw = 88 * s;
  const bh = 30 * s;
  const bx = cx - bw / 2;
  const by = y + h - 58 * s;
  const fill = still ? 1 : easeOut(clamp01((tb - 1.1) / 0.5));
  const pulse = still ? 0 : 0.5 + 0.5 * Math.sin(tb * 3);
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fillStyle = "rgba(16, 185, 129, 0.18)";
  ctx.fill();
  if (fill > 0) {
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.clip();
    ctx.fillStyle = "#10b981";
    ctx.fillRect(bx, by, bw * fill, bh);
    ctx.restore();
  }
  ctx.lineWidth = 1 + pulse;
  ctx.strokeStyle = `rgba(52, 211, 153, ${0.5 + pulse * 0.5})`;
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.stroke();

  const check = still ? 1 : clamp01((tb - 1.5) / 0.35);
  if (check > 0) {
    const p1 = { x: cx - 9 * s, y: by + bh / 2 };
    const p2 = { x: cx - 2 * s, y: by + bh / 2 + 7 * s };
    const p3 = { x: cx + 11 * s, y: by + bh / 2 - 7 * s };
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3 * s;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    const k1 = clamp01(check / 0.4);
    ctx.lineTo(lerp(p1.x, p2.x, k1), lerp(p1.y, p2.y, k1));
    if (check > 0.4) {
      const k2 = (check - 0.4) / 0.6;
      ctx.lineTo(lerp(p2.x, p3.x, k2), lerp(p2.y, p3.y, k2));
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawLanding(ctx: CanvasRenderingContext2D, coin: Coin, tb: number, s: number, still: boolean) {
  if (still || tb < 0.8) return;
  // A ripple every two seconds from the landed coin.
  const k = ((tb - 0.8) % 2) / 2;
  ctx.save();
  ctx.strokeStyle = `rgba(212, 175, 55, ${0.6 * (1 - k)})`;
  ctx.lineWidth = 2 * s * (1 - k) + 0.5;
  ctx.beginPath();
  ctx.arc(coin.x, coin.y, coin.r + easeOut(k) * 60 * s, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
