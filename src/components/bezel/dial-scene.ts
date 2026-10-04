import * as THREE from "three";
import { type DialSpec, markState } from "./dial-spec";
import { EMBLEM_FULL, emblemSegments } from "./emblem";

// Hamza's end-card coin, rebuilt in code and set in emerald glass that carries the circle.
// Loaded on demand by <Dial/>; nothing here runs on the server.

const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ease = {
  out3: (t: number) => 1 - Math.pow(1 - t, 3),
  out4: (t: number) => 1 - Math.pow(1 - t, 4),
  inOut3: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2),
};
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const canvas2d = (w: number, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const GOLD = new THREE.Color("#f2cf83");
const GOLD_EDGE = new THREE.Color("#d9b064");
const MARK_GOLD = new THREE.Color("#efcb6a");
const LUME = new THREE.Color("#5cf2b6");
const LUME_FLASH = new THREE.Color("#ecfff7");
const SIGNAL = new THREE.Color("#ff7a5c");

export type DialView = "hero" | "top" | "create" | "result";
const VIEWS: Record<DialView, [elevation: number, distance: number]> = {
  hero: [1.0, 6.3],
  top: [1.1, 6.6],
  create: [1.2, 6.2],
  result: [1.05, 6.4],
};

export interface DialSceneOptions {
  light: boolean;
  view: DialView;
  /** Opaque page color behind the dial. Needed in light mode so the glass refracts the page. */
  background?: string;
  reducedMotion: boolean;
}

type Tween = { t0: number; dur: number; fn: (k: number) => void; resolve: () => void };
type Mark = THREE.Group & { userData: { dome?: THREE.Mesh } };

// ---------------------------------------------------------------- shared resources
function studioEnv(renderer: THREE.WebGLRenderer, light: boolean) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(light ? 0xd8d4c9 : 0x050707);
  const geo = new THREE.PlaneGeometry(1, 1);
  const mats: THREE.Material[] = [];
  const panel = (w: number, h: number, hex: number, k: number, pos: [number, number, number]) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide });
    mats.push(m);
    const mesh = new THREE.Mesh(geo, m);
    mesh.scale.set(w, h, 1);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  // The large soft box behind and above is what the coin face reflects from the usual angle.
  panel(7, 5, 0xfff1df, light ? 6 : 10, [0, 7, 1.5]);
  panel(9, 3.5, 0xfff3dc, light ? 5 : 9, [0, 5.5, -6.5]);
  panel(1.4, 8, 0xfff0da, light ? 5 : 8, [-7, 2.5, 2.5]);
  panel(1.1, 8, 0xe2f1ff, light ? 3 : 5, [7, 2, -2]);
  panel(6, 1.6, 0x2ad497, light ? 1.2 : 3.2, [0, -1.2, -7]);
  panel(4, 3, 0xffe7c8, light ? 1.6 : 2.6, [2.5, 3, 7]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.03).texture;
  pm.dispose();
  geo.dispose();
  mats.forEach((m) => m.dispose());
  return tex;
}

function hammeredTextures() {
  const S = 1024;
  const bump = canvas2d(S);
  const rough = canvas2d(S);
  const b = bump.getContext("2d")!;
  const r = rough.getContext("2d")!;
  b.fillStyle = "#808080";
  b.fillRect(0, 0, S, S);
  r.fillStyle = "#8a8a8a";
  r.fillRect(0, 0, S, S);
  const R = rng(7);
  for (let i = 0; i < 2600; i++) {
    const x = R() * S;
    const y = R() * S;
    const rad = S * (0.005 + R() * 0.014);
    const g = b.createRadialGradient(x - rad * 0.25, y - rad * 0.25, 0, x, y, rad);
    g.addColorStop(0, "rgba(34,34,34,0.42)");
    g.addColorStop(0.6, "rgba(100,100,100,0.16)");
    g.addColorStop(0.92, "rgba(160,160,160,0.1)");
    g.addColorStop(1, "rgba(128,128,128,0)");
    b.fillStyle = g;
    b.beginPath();
    b.arc(x, y, rad, 0, TAU);
    b.fill();
    const v = R() < 0.5 ? 205 : 96;
    const h = r.createRadialGradient(x, y, 0, x, y, rad);
    h.addColorStop(0, `rgba(${v},${v},${v},0.26)`);
    h.addColorStop(1, "rgba(138,138,138,0)");
    r.fillStyle = h;
    r.beginPath();
    r.arc(x, y, rad, 0, TAU);
    r.fill();
  }
  const tb = new THREE.CanvasTexture(bump);
  const tr = new THREE.CanvasTexture(rough);
  for (const t of [tb, tr]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { bump: tb, rough: tr };
}

function reedTexture() {
  const c = canvas2d(1024, 4);
  const g = c.getContext("2d")!;
  const img = g.createImageData(1024, 4);
  for (let x = 0; x < 1024; x++) {
    const v = 128 + 115 * Math.cos((x / 1024) * TAU * 128);
    for (let y = 0; y < 4; y++) {
      const i = (y * 1024 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.5, 1);
  return t;
}

function radialTexture(stops: [number, string][], size = 128) {
  const c = canvas2d(size);
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const goldMat = (opts: { rough?: number; bump?: THREE.Texture; bumpScale?: number; roughMap?: THREE.Texture; color?: THREE.Color } = {}) =>
  new THREE.MeshStandardMaterial({
    color: opts.color ?? GOLD,
    metalness: 1,
    roughness: opts.rough ?? 0.3,
    bumpMap: opts.bump ?? null,
    bumpScale: opts.bumpScale ?? 1,
    roughnessMap: opts.roughMap ?? null,
  });

// Minted relief: each wall of the maze is a beveled extrusion, so it catches light like a struck coin.
function buildEmblem(mat: THREE.Material, H: number) {
  const W = 0.027;
  const bevel = 0.0058;
  const hw = W / 2 - bevel;
  const shapes = emblemSegments(EMBLEM_FULL).map(([x1, z1, x2, z2]) => {
    const ax = x1;
    const ay = -z1;
    const bx = x2;
    const by = -z2;
    const L = Math.hypot(bx - ax, by - ay);
    const dx = (bx - ax) / L;
    const dy = (by - ay) / L;
    const nx = -dy;
    const ny = dx;
    const sh = new THREE.Shape();
    sh.moveTo(ax - dx * hw + nx * hw, ay - dy * hw + ny * hw);
    sh.lineTo(bx + dx * hw + nx * hw, by + dy * hw + ny * hw);
    sh.lineTo(bx + dx * hw - nx * hw, by + dy * hw - ny * hw);
    sh.lineTo(ax - dx * hw - nx * hw, ay - dy * hw - ny * hw);
    sh.closePath();
    return sh;
  });
  const s = 0.1;
  const sq: [number, number][] = [
    [0, -s],
    [s, 0],
    [0, s],
    [-s, 0],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = sq[i];
    const [bx, bz] = sq[(i + 1) % 4];
    const L = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / L;
    const dy = (-bz + az) / L;
    const nx = -dy;
    const ny = dx;
    const sh = new THREE.Shape();
    sh.moveTo(ax - dx * hw + nx * hw, -az - dy * hw + ny * hw);
    sh.lineTo(bx + dx * hw + nx * hw, -bz + dy * hw + ny * hw);
    sh.lineTo(bx + dx * hw - nx * hw, -bz + dy * hw - ny * hw);
    sh.lineTo(ax - dx * hw - nx * hw, -az - dy * hw - ny * hw);
    sh.closePath();
    shapes.push(sh);
  }
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, H - 0.003, 0);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  // square-cut emerald: a four-sided lathe, faceted
  const gemPts = [
    [0, -0.034],
    [0.074, -0.002],
    [0.078, 0.006],
    [0.052, 0.03],
    [0, 0.03],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const gem = new THREE.Mesh(
    new THREE.LatheGeometry(gemPts, 4),
    new THREE.MeshPhysicalMaterial({ color: "#1ec98a", roughness: 0.02, metalness: 0, transmission: 0.55, thickness: 0.16, ior: 1.58, emissive: "#0a6b45", emissiveIntensity: 0.6, flatShading: true, specularIntensity: 1 })
  );
  gem.position.y = H + 0.03;
  g.add(gem);
  return g;
}

function buildCoin() {
  const g = new THREE.Group();
  const hm = hammeredTextures();
  const field = goldMat({ rough: 0.62, roughMap: hm.rough, bump: hm.bump, bumpScale: 1.15 });
  const polish = goldMat({ rough: 0.16 });
  const edge = goldMat({ rough: 0.3, bump: reedTexture(), bumpScale: 1.4, color: GOLD_EDGE });
  const H = 0.07;
  const face = new THREE.CircleGeometry(0.86, 160);
  const top = new THREE.Mesh(face, field);
  top.rotation.x = -Math.PI / 2;
  top.position.y = H;
  const bottom = new THREE.Mesh(face, field);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -H;
  const rimTop = [
    [1.0, 0.075],
    [0.988, 0.094],
    [0.955, 0.102],
    [0.885, 0.102],
    [0.866, 0.094],
    [0.86, 0.07],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const rimBottom = rimTop.map((v) => new THREE.Vector2(v.x, -v.y)).reverse();
  g.add(
    top,
    bottom,
    new THREE.Mesh(new THREE.LatheGeometry(rimTop, 192), polish),
    new THREE.Mesh(new THREE.LatheGeometry(rimBottom, 192), polish),
    new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.15, 256, 1, true), edge)
  );
  g.add(buildEmblem(polish, H));
  const back = buildEmblem(polish, H);
  back.rotation.x = Math.PI;
  g.add(back);
  return g;
}

function buildBezel() {
  const inner = 1.03;
  const outer = 1.32;
  const half = 0.16;
  const corner = 0.05;
  const pts: THREE.Vector2[] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number, n = 10) => {
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n);
      pts.push(new THREE.Vector2(cx + corner * Math.cos(a), cy + corner * Math.sin(a)));
    }
  };
  arc(outer - corner, -half + corner, -Math.PI / 2, 0);
  arc(outer - corner, half - corner, 0, Math.PI / 2);
  arc(inner + corner, half - corner, Math.PI / 2, Math.PI);
  arc(inner + corner, -half + corner, Math.PI, 1.5 * Math.PI);
  pts.push(pts[0].clone());
  return new THREE.Mesh(
    new THREE.LatheGeometry(pts, 192),
    new THREE.MeshPhysicalMaterial({
      color: "#e8fff5",
      roughness: 0.04,
      metalness: 0,
      transmission: 1,
      thickness: 0.45,
      ior: 1.56,
      attenuationColor: new THREE.Color("#1fae78"),
      attenuationDistance: 0.95,
      specularIntensity: 1,
      envMapIntensity: 1.3,
      dispersion: 0.25,
    })
  );
}

// ---------------------------------------------------------------- the scene
export class DialScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  private root = new THREE.Group();
  private coinPivot = new THREE.Group();
  private dial = new THREE.Group();
  private marks: Mark[] = [];
  private tweens: Tween[] = [];
  private now = 0;
  private running = false;
  private spec: DialSpec;
  private geo: Record<string, THREE.BufferGeometry>;
  private mats: Record<string, THREE.Material>;
  private glowTex: THREE.Texture;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private canvas: HTMLCanvasElement,
    spec: DialSpec,
    private opts: DialSceneOptions
  ) {
    const lowPower = typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !opts.background, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    if (opts.background) this.renderer.setClearColor(new THREE.Color(opts.background), 1);
    else this.renderer.setClearColor(0x000000, 0);
    this.scene.environment = studioEnv(this.renderer, opts.light);

    this.scene.add(this.root);
    this.coinPivot.add(buildCoin());
    this.root.add(this.coinPivot, buildBezel(), this.dial);
    const back = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 0.03, 160),
      new THREE.MeshStandardMaterial({ color: opts.light ? "#e6e2d6" : "#0c1613", roughness: opts.light ? 0.5 : 0.35, metalness: opts.light ? 0 : 0.3 })
    );
    back.position.y = -0.17;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({
        map: radialTexture([[0, "rgba(0,0,0,0.75)"], [0.55, "rgba(0,0,0,0.35)"], [1, "rgba(0,0,0,0)"]], 256),
        transparent: true,
        depthWrite: false,
        opacity: opts.light ? 0.32 : 0.7,
        color: 0x000000,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.2;
    // fixed lume pip at twelve o'clock: the draw stops a seat under it
    const tri = new THREE.Shape();
    tri.moveTo(0, 0.99);
    tri.lineTo(-0.03, 0.93);
    tri.lineTo(0.03, 0.93);
    tri.closePath();
    const pip = new THREE.Mesh(new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: LUME, toneMapped: false }));
    pip.position.y = 0.104;
    this.root.add(back, shadow, pip);
    const key = new THREE.DirectionalLight(0xfff1de, 1.1);
    key.position.set(-2, 5, 3);
    this.scene.add(key);

    this.glowTex = radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.25, "rgba(255,255,255,0.55)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    this.geo = {
      dome: new THREE.SphereGeometry(0.034, 28, 14, 0, TAU, 0, Math.PI / 2),
      cup: new THREE.TorusGeometry(0.04, 0.0075, 10, 40).rotateX(Math.PI / 2),
      open: new THREE.TorusGeometry(0.033, 0.0048, 8, 36).rotateX(Math.PI / 2),
      you: new THREE.TorusGeometry(0.066, 0.0058, 8, 56).rotateX(Math.PI / 2),
      ripple: new THREE.TorusGeometry(0.06, 0.006, 6, 48).rotateX(Math.PI / 2),
    };
    this.mats = {
      taken: new THREE.MeshPhysicalMaterial({ color: opts.light ? "#dfe5e1" : "#101815", roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 }),
      lit: new THREE.MeshBasicMaterial({ color: LUME, toneMapped: false }),
      won: goldMat({ rough: 0.18, color: MARK_GOLD }),
      late: new THREE.MeshBasicMaterial({ color: SIGNAL, toneMapped: false }),
      cup: goldMat({ rough: 0.2 }),
      open: new THREE.MeshBasicMaterial({ color: opts.light ? "#8e9b95" : "#55655e" }),
      you: goldMat({ rough: 0.14, color: new THREE.Color("#ffe39a") }),
      glow: new THREE.SpriteMaterial({ map: this.glowTex, color: LUME, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true, opacity: opts.light ? 0.35 : 0.7 }),
      glowLate: new THREE.SpriteMaterial({ map: this.glowTex, color: SIGNAL, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true, opacity: opts.light ? 0.3 : 0.6 }),
    };
    this.spec = spec;
    this.build();
  }

  // ---------- public
  resize(width: number, height: number) {
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.aim();
    if (!this.running) this.render();
  }

  setView(view: DialView) {
    this.opts.view = view;
    this.aim();
    if (!this.running) this.render();
  }

  start() {
    if (this.running || this.opts.reducedMotion) return;
    this.running = true;
    let last = performance.now();
    this.renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      this.step(dt);
      if (this.scene.environmentRotation) this.scene.environmentRotation.y += dt * 0.12;
      this.render();
    });
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  /** Move to a new state, animating what changed: C3 seats, C2 a new winner, C1 new payments. */
  update(next: DialSpec) {
    this.queue = this.queue.then(() => this.transition(next)).catch(() => undefined);
    return this.queue;
  }

  /** Where each seat number sits on screen, 0–1 in the canvas, following the current turn. */
  seatLabels() {
    this.root.updateMatrixWorld(true);
    return Array.from({ length: this.spec.seats }, (_, i) => {
      const a = this.seatAngle(i) - this.dial.rotation.y;
      const v = new THREE.Vector3(1.47 * Math.cos(a), 0.16, 1.47 * Math.sin(a)).project(this.camera);
      return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
    });
  }

  dispose() {
    this.stop();
    this.tweens = [];
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
    Object.values(this.geo).forEach((g) => g.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
    this.glowTex.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ---------- internals
  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  private aim() {
    const [elev, dist] = VIEWS[this.opts.view];
    this.camera.position.set(0, -0.02 + dist * Math.sin(elev), dist * Math.cos(elev));
    this.camera.lookAt(0, -0.02, 0);
    this.camera.updateProjectionMatrix();
  }

  private tween(dur: number, fn: (k: number) => void) {
    return new Promise<void>((resolve) => {
      if (this.opts.reducedMotion || !this.running) {
        fn(1);
        resolve();
        if (!this.running) this.render();
        return;
      }
      this.tweens.push({ t0: this.now, dur, fn, resolve });
    });
  }

  private step(dt: number) {
    this.now += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      const k = tw.dur === 0 ? 1 : clamp01((this.now - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.resolve();
      }
    }
  }

  private seatAngle(i: number, n = this.spec.seats) {
    return -Math.PI / 2 + (i * TAU) / n;
  }

  private build(grow = false) {
    this.dial.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.userData?.ownGeo) mesh.geometry.dispose();
      if (mesh.userData?.ownMat) (mesh.material as THREE.Material).dispose();
    });
    this.dial.clear();
    const s = this.spec;
    const n = s.seats;
    const R = 1.2;
    this.marks = [];
    for (let i = 0; i < n; i++) {
      const a = this.seatAngle(i);
      const g = new THREE.Group() as Mark;
      g.position.set(R * Math.cos(a), 0.162, R * Math.sin(a));
      const st = markState(s, i);
      if (st === "open") {
        g.add(new THREE.Mesh(this.geo.open, this.mats.open));
      } else {
        g.add(new THREE.Mesh(this.geo.cup, this.mats.cup));
        const dome = new THREE.Mesh(this.geo.dome, this.mats[st]);
        dome.scale.set(1, 0.6, 1);
        g.add(dome);
        g.userData.dome = dome;
        if (st === "lit" || st === "late") {
          const glow = new THREE.Sprite(st === "lit" ? (this.mats.glow as THREE.SpriteMaterial) : (this.mats.glowLate as THREE.SpriteMaterial));
          glow.scale.setScalar(0.2);
          glow.position.y = 0.02;
          g.add(glow);
        }
      }
      if (i === s.you) g.add(new THREE.Mesh(this.geo.you, this.mats.you));
      if (grow && !this.opts.reducedMotion) g.scale.setScalar(0.01);
      this.dial.add(g);
      this.marks.push(g);
    }
    // round track: gold done, lume now, dark next
    const off = new THREE.Color(this.opts.light ? "#b3bfb9" : "#33423c");
    const gap = Math.min(0.08, TAU / n / 5);
    for (let i = 0; i < n; i++) {
      const len = TAU / n - gap;
      const geo = new THREE.TorusGeometry(1.075, 0.008, 6, 48, len).rotateX(-Math.PI / 2);
      let col = off;
      if (s.mode === "complete") col = MARK_GOLD;
      else if (s.mode === "active") col = i < (s.round ?? 1) - 1 ? MARK_GOLD : i === (s.round ?? 1) - 1 ? LUME : off;
      const arc = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col.clone(), toneMapped: false }));
      arc.userData = { ownGeo: true, ownMat: true };
      const start = this.seatAngle(i) - TAU / n / 2 + gap / 2;
      arc.rotation.y = -(start + len);
      arc.position.y = 0.161;
      this.dial.add(arc);
    }
    this.coinPivot.visible = s.coin !== false;
    if (grow) {
      this.marks.forEach((m, i) => this.tween(0.18 + i * 0.012, (k) => m.scale.setScalar(Math.max(0.01, ease.outBack(k)))));
    }
    if (!this.running) this.render();
  }

  private async transition(next: DialSpec) {
    const prev = this.spec;
    if (next.seats !== prev.seats) {
      this.spec = next;
      this.dial.rotation.y = 0;
      this.build(true);
      await this.tick(0.03);
      return;
    }
    const newWin = (next.won ?? []).find((i) => !(prev.won ?? []).includes(i));
    if (newWin !== undefined && next.mode !== "pending") {
      await this.spinTo(newWin);
      this.spec = next;
      this.build();
      await this.flip();
      return;
    }
    const litBefore = (i: number) => markState(prev, i) === "lit";
    const newlyLit = Array.from({ length: next.seats }, (_, i) => i).filter((i) => markState(next, i) === "lit" && !litBefore(i));
    this.spec = next;
    this.build();
    for (const i of newlyLit) await this.detent(i);
  }

  private tick(amount: number) {
    const base = this.dial.rotation.y;
    return this.tween(0.22, (k) => (this.dial.rotation.y = base + amount * Math.sin(k * Math.PI)));
  }

  // C1: the mark flashes, settles to lume, a ripple leaves it, the bezel ticks one notch
  private async detent(i: number) {
    const g = this.marks[i];
    const dome = g?.userData.dome;
    if (!g || !dome) return;
    const flash = new THREE.MeshBasicMaterial({ color: LUME_FLASH.clone(), toneMapped: false });
    const prevMat = dome.material;
    dome.material = flash;
    const ripple = new THREE.Mesh(this.geo.ripple, new THREE.MeshBasicMaterial({ color: LUME.clone(), transparent: true, toneMapped: false }));
    g.add(ripple);
    this.tick(0.035);
    await this.tween(0.5, (k) => {
      flash.color.copy(LUME_FLASH).lerp(LUME, smooth(0.25, 1, k));
      ripple.scale.setScalar(1 + 5 * ease.out3(k));
      (ripple.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
    g.remove(ripple);
    (ripple.material as THREE.Material).dispose();
    dome.material = prevMat;
    flash.dispose();
    if (!this.running) this.render();
  }

  // C2: spin, slow through detents, stop with the winner under the pip
  private async spinTo(winner: number) {
    const step = TAU / this.spec.seats;
    const from = this.dial.rotation.y;
    const target = (winner * step) % TAU;
    const delta = (target - (from % TAU) + TAU * 2) % TAU;
    const total = TAU * 3 + delta;
    await this.tween(2.6, (k) => {
      const cont = total * ease.out4(k);
      const q = cont / step;
      const stepped = step * (Math.floor(q) + smooth(0.62, 1, q - Math.floor(q)));
      this.dial.rotation.y = from + lerp(cont, stepped, smooth(0.45, 0.8, k));
    });
    this.dial.rotation.y = from + total;
  }

  private async flip() {
    await this.tween(0.8, (k) => {
      this.coinPivot.rotation.x = Math.PI * ease.inOut3(k);
      this.coinPivot.position.y = 0.45 * Math.sin(Math.PI * k);
    });
    this.coinPivot.rotation.x = 0;
    this.coinPivot.position.y = 0;
    if (!this.running) this.render();
  }
}
