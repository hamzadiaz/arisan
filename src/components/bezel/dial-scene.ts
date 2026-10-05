import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { type DialSpec, markState } from "./dial-spec";
import { EMBLEM_FULL, emblemSegments } from "./emblem";

// Hamza's end-card coin, rebuilt in code and set in emerald glass that carries the circle.
// One engine (one renderer, one canvas) for the whole session: <Dial/> lends it a host
// element while it's on screen. It draws only when something changes.

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

const MARK_GOLD = new Color("#efcb6a");
const LUME = new Color("#5cf2b6");
const LUME_FLASH = new Color("#ecfff7");
const SIGNAL = new Color("#ff7a5c");
const PIP = new Color("#f1da92");

export type DialView = "hero" | "top" | "create" | "result";
const VIEWS: Record<DialView, [elevation: number, distance: number]> = {
  hero: [1.0, 6.5],
  top: [1.1, 6.8],
  create: [1.2, 6.4],
  result: [1.05, 6.6],
};

type Theme = "dark" | "light";
type Tween = { t0: number; dur: number; fn: (k: number) => void; resolve: () => void };
/** The Dial currently holding the canvas: told when it loses it. */
export interface DialOwner {
  /** The WebGL context was lost; the SVG dial should show. */
  onLost?: () => void;
  /** Another Dial took the shared canvas; `still` is its last frame, to show while it leaves. */
  onEvict?: (still: HTMLCanvasElement | null) => void;
}
type MarkGroup = Group & { userData: { dome?: Mesh } };

// ---------------------------------------------------------------- textures and materials
function studioEnv(renderer: WebGLRenderer, light: boolean) {
  const scene = new Scene();
  scene.background = new Color(light ? 0xd8d4c9 : 0x050707);
  const geo = new PlaneGeometry(1, 1);
  const mats: Material[] = [];
  const panel = (w: number, h: number, hex: number, k: number, pos: [number, number, number]) => {
    const m = new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(k), side: DoubleSide });
    mats.push(m);
    const mesh = new Mesh(geo, m);
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
  panel(6, 1.6, 0x0e8c70, 0.35, [0, -1.2, -7]);
  panel(4, 3, 0xffe7c8, light ? 1.6 : 2.6, [2.5, 3, 7]);
  const pm = new PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.03).texture;
  pm.dispose();
  geo.dispose();
  mats.forEach((m) => m.dispose());
  return tex;
}

// Beaten metal: overlapping shallow strikes, coarse like the film's coin.
function hammeredTextures() {
  const S = 512;
  const bump = canvas2d(S);
  const rough = canvas2d(S);
  const b = bump.getContext("2d")!;
  const r = rough.getContext("2d")!;
  b.fillStyle = "#808080";
  b.fillRect(0, 0, S, S);
  r.fillStyle = "#8a8a8a";
  r.fillRect(0, 0, S, S);
  const R = rng(7);
  for (let i = 0; i < 1100; i++) {
    const x = R() * S;
    const y = R() * S;
    const rad = S * (0.014 + R() * 0.03);
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
  const tb = new CanvasTexture(bump);
  const tr = new CanvasTexture(rough);
  for (const t of [tb, tr]) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 4;
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
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
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
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const goldMat = (opts: { color: Color; rough: number; bump?: Texture; bumpScale?: number; roughMap?: Texture; transparent?: boolean }) =>
  new MeshStandardMaterial({
    color: opts.color,
    metalness: 1,
    roughness: opts.rough,
    bumpMap: opts.bump ?? null,
    bumpScale: opts.bumpScale ?? 1,
    roughnessMap: opts.roughMap ?? null,
    transparent: opts.transparent ?? false,
  });

// Minted relief: each wall of the maze is a beveled extrusion, so it catches light like a struck coin.
function emblemGeometry(H: number) {
  const W = 0.046;
  const bevel = 0.009;
  const hw = W / 2 - bevel;
  const quad = (ax: number, ay: number, bx: number, by: number) => {
    const L = Math.hypot(bx - ax, by - ay);
    const dx = (bx - ax) / L;
    const dy = (by - ay) / L;
    const nx = -dy;
    const ny = dx;
    const sh = new Shape();
    sh.moveTo(ax - dx * hw + nx * hw, ay - dy * hw + ny * hw);
    sh.lineTo(bx + dx * hw + nx * hw, by + dy * hw + ny * hw);
    sh.lineTo(bx + dx * hw - nx * hw, by + dy * hw - ny * hw);
    sh.lineTo(ax - dx * hw - nx * hw, ay - dy * hw - ny * hw);
    sh.closePath();
    return sh;
  };
  const shapes = emblemSegments(EMBLEM_FULL).map(([x1, z1, x2, z2]) => quad(x1, -z1, x2, -z2));
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
    shapes.push(quad(ax, -az, bx, -bz));
  }
  const geo = new ExtrudeGeometry(shapes, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.009, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, H - 0.003, 0);
  return geo;
}

function bezelGeometry() {
  const inner = 1.03;
  const outer = 1.34;
  const half = 0.19;
  const corner = 0.06;
  const pts: Vector2[] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number, n = 10) => {
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n);
      pts.push(new Vector2(cx + corner * Math.cos(a), cy + corner * Math.sin(a)));
    }
  };
  arc(outer - corner, -half + corner, -Math.PI / 2, 0);
  arc(outer - corner, half - corner, 0, Math.PI / 2);
  arc(inner + corner, half - corner, Math.PI / 2, Math.PI);
  arc(inner + corner, -half + corner, Math.PI, 1.5 * Math.PI);
  pts.push(pts[0].clone());
  return new LatheGeometry(pts, 192);
}

// ---------------------------------------------------------------- the engine
export interface AttachOptions {
  theme: Theme;
  view: DialView;
  /** The page color under the dial; light mode draws it opaque so the glass refracts the page. */
  background: string;
  reducedMotion: boolean;
}

class DialEngine {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(26, 1, 0.1, 50);
  private root = new Group();
  private coinPivot = new Group();
  private dial = new Group();
  private marks: MarkGroup[] = [];
  private tweens: Tween[] = [];
  private now = 0;
  private looping = false;
  private raf = 0;
  private spinning = false;
  /** Bumped on every attach and detach; animations from an older hosting stop touching the dial. */
  private gen = 0;
  /** Shaders compiled; nothing renders before, so the first frame never compiles on the main thread. */
  private ready = false;
  /** Latest spec waiting for the queue: a ruler drag collapses into one transition. */
  private pending: DialSpec | null = null;
  private owner: DialOwner | null = null;
  private themeApplied: Theme | null = null;
  /** The shader compile in flight: a lost context must not dispose the renderer under it */
  private compiling: Promise<void> | null = null;
  private spec: DialSpec = { seats: 6, mode: "pending" };
  private opts: AttachOptions = { theme: "dark", view: "hero", background: "#0a0f0d", reducedMotion: false };
  private host: HTMLElement | null = null;
  private queue: Promise<void> = Promise.resolve();
  private envs = new Map<Theme, Texture>();
  private geo: Record<string, BufferGeometry> = {};
  private mats: Record<string, Material> = {};
  private themed: {
    back: MeshStandardMaterial;
    glass: MeshPhysicalMaterial;
    shadow: MeshBasicMaterial;
    gold: MeshStandardMaterial[];
    relief: MeshStandardMaterial;
  };
  private backMesh!: Mesh;
  private caseEmpty!: MeshBasicMaterial;
  private glowTex: Texture;
  private lost = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "pointer-events-none absolute inset-0 size-full";
    this.canvas.setAttribute("aria-hidden", "true");
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: "default" });
    const lowPower = (navigator.hardwareConcurrency ?? 8) <= 4;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.transmissionResolutionScale = 0.5;
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
      this.stopLoop();
      this.finishTweens();
      const owner = this.owner;
      this.owner = null;
      if (this.host && this.canvas.parentElement === this.host) this.host.removeChild(this.canvas);
      this.host = null;
      const dispose = () => {
        try {
          this.renderer.dispose();
        } catch {
          /* already gone */
        }
      };
      if (this.compiling) this.compiling.finally(dispose);
      else dispose();
      owner?.onLost?.();
    });

    const hm = hammeredTextures();
    const gold = new Color("#d9bc76");
    const field = goldMat({ color: gold, rough: 0.58, roughMap: hm.rough, bump: hm.bump, bumpScale: 0.8 });
    const polish = goldMat({ color: gold, rough: 0.16 });
    // The maze stays legible on pale light-theme gold with a deeper tint of its own
    const relief = goldMat({ color: gold, rough: 0.16 });
    const edge = goldMat({ color: new Color("#c99a3e"), rough: 0.3, bump: reedTexture(), bumpScale: 1.4 });
    const H = 0.07;
    const face = new CircleGeometry(0.86, 160);
    const top = new Mesh(face, field);
    top.rotation.x = -Math.PI / 2;
    top.position.y = H;
    const bottom = new Mesh(face, field);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = -H;
    const rimTop = [
      [1.0, 0.075],
      [0.988, 0.094],
      [0.955, 0.102],
      [0.885, 0.102],
      [0.866, 0.094],
      [0.86, 0.07],
    ].map(([x, y]) => new Vector2(x, y));
    const rimBottom = rimTop.map((v) => new Vector2(v.x, -v.y)).reverse();
    const emblem = emblemGeometry(H);
    const frontEmblem = new Mesh(emblem, relief);
    const backEmblem = new Mesh(emblem, relief);
    backEmblem.rotation.x = Math.PI;
    const gemPts = [
      [0, -0.034],
      [0.074, -0.002],
      [0.078, 0.006],
      [0.052, 0.03],
      [0, 0.03],
    ].map(([x, y]) => new Vector2(x, y));
    const gem = new Mesh(
      new LatheGeometry(gemPts, 4),
      new MeshPhysicalMaterial({ color: "#1ec98a", roughness: 0.02, metalness: 0, transmission: 0.55, thickness: 0.16, ior: 1.58, emissive: "#0a6b45", emissiveIntensity: 0.6, flatShading: true })
    );
    gem.position.y = H + 0.03;
    this.coinPivot.add(
      top,
      bottom,
      new Mesh(new LatheGeometry(rimTop, 192), polish),
      new Mesh(new LatheGeometry(rimBottom, 192), polish),
      new Mesh(new CylinderGeometry(1, 1, 0.15, 256, 1, true), edge),
      frontEmblem,
      backEmblem,
      gem
    );

    const glass = new MeshPhysicalMaterial({
      color: "#f2fff8",
      roughness: 0.035,
      metalness: 0,
      transmission: 1,
      thickness: 0.45,
      ior: 1.56,
      attenuationColor: new Color("#12a08e"),
      attenuationDistance: 1.0,
      specularIntensity: 1,
      envMapIntensity: 0.9,
      // A trace of fire at the edges; more splits the rim into lime
      dispersion: 0.015,
    });
    const back = new MeshStandardMaterial({ color: "#0c1613", roughness: 0.35, metalness: 0.3 });
    const backMesh = new Mesh(new CylinderGeometry(1.32, 1.32, 0.03, 160), back);
    this.backMesh = backMesh;
    // With the coin hidden (empty and error states) the case-back takes the page's tone
    this.caseEmpty = new MeshBasicMaterial({ color: "#0a0f0d", toneMapped: false });
    backMesh.position.y = -0.2;
    const shadow = new MeshBasicMaterial({
      map: radialTexture([[0, "rgba(0,0,0,0.75)"], [0.55, "rgba(0,0,0,0.35)"], [1, "rgba(0,0,0,0)"]], 256),
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
      color: 0x000000,
    });
    const shadowMesh = new Mesh(new PlaneGeometry(3.1, 3.1), shadow);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -0.22;
    // fixed gold pip at twelve o'clock: the draw stops a seat under it
    const tri = new Shape();
    tri.moveTo(0, 0.99);
    tri.lineTo(-0.03, 0.93);
    tri.lineTo(0.03, 0.93);
    tri.closePath();
    const pip = new Mesh(new ShapeGeometry(tri).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: PIP, toneMapped: false, transparent: true }));
    pip.position.y = 0.104;
    this.root.add(this.coinPivot, new Mesh(bezelGeometry(), glass), backMesh, shadowMesh, pip, this.dial);
    this.scene.add(this.root);
    const key = new DirectionalLight(0xfff1de, 1.1);
    key.position.set(-2, 5, 3);
    this.scene.add(key);
    this.themed = { back, glass, shadow, gold: [field, polish], relief };

    // Marks sit on the glass as flush points. Transparent materials stay out of the glass's
    // refraction pass, so a mark never shows twice.
    this.glowTex = radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.25, "rgba(255,255,255,0.55)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    this.geo = {
      dome: new SphereGeometry(0.052, 28, 14, 0, TAU, 0, Math.PI / 2),
      ring: new TorusGeometry(0.05, 0.009, 8, 44).rotateX(Math.PI / 2),
      lateRing: new TorusGeometry(0.052, 0.015, 10, 44).rotateX(Math.PI / 2),
      wonRing: new TorusGeometry(0.075, 0.0065, 8, 48).rotateX(Math.PI / 2),
      open: new TorusGeometry(0.054, 0.009, 8, 40).rotateX(Math.PI / 2),
      you: new TorusGeometry(0.095, 0.0075, 8, 60).rotateX(Math.PI / 2),
      ripple: new TorusGeometry(0.09, 0.008, 6, 48).rotateX(Math.PI / 2),
    };
    const flat = (color: Color, opacity = 1) => new MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity });
    this.mats = {
      // Filled means paid, as everywhere else in the app: a joined, unpaid seat is a hollow ring
      taken: flat(new Color("#9fb2a9"), 0.95),
      lit: flat(LUME),
      won: goldMat({ color: MARK_GOLD, rough: 0.18, transparent: true }),
      late: flat(SIGNAL),
      open: flat(new Color("#a8b6af"), 0.75),
      you: goldMat({ color: new Color("#ffe39a"), rough: 0.14, transparent: true }),
      glow: new SpriteMaterial({ map: this.glowTex, color: LUME, blending: AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true, opacity: 0.7 }),
      glowLate: new SpriteMaterial({ map: this.glowTex, color: SIGNAL, blending: AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true, opacity: 0.6 }),
    };
  }

  get isLost() {
    return this.lost;
  }

  /** Shaders compiled and the context alive: a new host draws in the same frame. */
  get isReady() {
    return this.ready && !this.lost;
  }

  // ---------- hosting
  attach(host: HTMLElement, spec: DialSpec, opts: AttachOptions, owner: DialOwner = {}) {
    if (this.owner && this.host !== host) this.owner.onEvict?.(this.still());
    this.reset();
    this.owner = owner;
    this.host = host;
    host.appendChild(this.canvas);
    this.opts = opts;
    this.applyTheme(opts.theme, opts.background);
    this.spec = spec;
    this.dial.rotation.y = 0;
    this.coinPivot.rotation.set(0, 0, 0);
    this.coinPivot.position.y = 0;
    this.build();
    const r = host.getBoundingClientRect();
    this.resize(r.width, r.height);
  }

  detach(host: HTMLElement) {
    if (this.host !== host) return;
    this.reset();
    if (this.canvas.parentElement === host) host.removeChild(this.canvas);
    this.host = null;
    this.owner = null;
  }

  /** Compile shaders off the critical path, then draw the first frame. */
  async warm() {
    if (!this.ready) {
      // A second Dial attaching mid-compile waits for the same compile
      this.compiling ??= this.compile();
      await this.compiling;
      if (this.lost) return;
    }
    this.render();
  }

  private async compile() {
    // One hidden mesh per mark material, so a first win or payment doesn't compile mid-animation
    const warmers = new Group();
    for (const mat of Object.values(this.mats)) {
      if (mat instanceof SpriteMaterial) warmers.add(new Sprite(mat));
      else warmers.add(new Mesh(this.geo.dome, mat));
    }
    warmers.scale.setScalar(1e-4);
    this.scene.add(warmers);
    // An optimisation only: a failed compile (even a synchronous throw) still settles
    await Promise.resolve()
      .then(() => this.renderer.compileAsync(this.scene, this.camera))
      .catch(() => undefined);
    this.scene.remove(warmers);
    this.compiling = null;
    if (!this.lost) this.ready = true;
  }

  /** Jump to a state at once, cutting any animation in flight (the intro's beats). */
  show(spec: DialSpec) {
    this.reset();
    if (spec.seats !== this.spec.seats) this.dial.rotation.y = 0;
    this.coinPivot.rotation.set(0, 0, 0);
    this.coinPivot.position.y = 0;
    this.spec = spec;
    this.build();
  }

  /** The current frame as a plain canvas, for the Dial that is giving up the shared one. */
  private still() {
    if (!this.host || !this.ready || this.lost || !this.canvas.width) return null;
    const c = canvas2d(this.canvas.width, this.canvas.height);
    c.className = this.canvas.className;
    c.setAttribute("aria-hidden", "true");
    // Read back in the same task as the render: the drawing buffer isn't preserved after that
    this.renderer.render(this.scene, this.camera);
    c.getContext("2d")?.drawImage(this.canvas, 0, 0);
    return c;
  }

  /** Follow a theme change in place, without handing the canvas back. */
  setTheme(theme: Theme, background: string) {
    this.opts = { ...this.opts, theme, background };
    this.applyTheme(theme, background);
    this.build();
  }

  resize(width: number, height: number) {
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.aim();
    this.render();
  }

  /** Where each seat number sits on screen (0–1), following the current turn. */
  seatLabels() {
    this.root.updateMatrixWorld(true);
    return Array.from({ length: this.spec.seats }, (_, i) => {
      const a = this.seatAngle(i) - this.dial.rotation.y;
      const r = 1.48 + 0.12 * Math.max(0, Math.sin(a));
      const v = new Vector3(r * Math.cos(a), 0.19, r * Math.sin(a)).project(this.camera);
      return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
    });
  }

  /** Move to a new state, animating what changed: C3 seats, C2 a new winner, C1 new payments. */
  update(next: DialSpec) {
    const queued = this.pending !== null;
    this.pending = next;
    if (!queued) {
      const gen = this.gen;
      this.queue = this.queue
        .then(() => {
          // A re-attach owns `pending` now; this link belongs to the old hosting
          if (gen !== this.gen) return;
          const spec = this.pending;
          this.pending = null;
          if (spec) return this.transition(spec);
        })
        .catch(() => undefined);
    }
    return this.queue;
  }

  /**
   * Keep the bezel turning while a draw is in flight (two approvals and the slot hash).
   * When it stops, the bezel settles on the nearest seat so the numbers line up again;
   * a new winner's spin, queued by update(), starts from there.
   */
  setDrawing(on: boolean): Promise<void> {
    if (this.opts.reducedMotion) return Promise.resolve();
    if (on) {
      this.spinning = true;
      this.startLoop();
      return Promise.resolve();
    }
    const gen = this.gen;
    this.queue = this.queue
      .then(() => {
        if (gen !== this.gen) return;
        this.spinning = false;
        const step = TAU / this.spec.seats;
        const from = this.dial.rotation.y;
        const to = Math.round(from / step) * step;
        if (Math.abs(to - from) < 1e-4) return;
        return this.tween(0.45, (k) => (this.dial.rotation.y = lerp(from, to, ease.out3(k))));
      })
      .catch(() => undefined);
    return this.queue;
  }

  // ---------- internals
  private applyTheme(theme: Theme, background: string) {
    const light = theme === "light";
    // Light draws the page colour opaque so the glass refracts the page, not black.
    this.renderer.setClearColor(new Color(light ? background : "#000000"), light ? 1 : 0);
    if (theme === this.themeApplied) return;
    this.themeApplied = theme;
    // Each theme's studio is built the first time it's needed, not up front.
    let env = this.envs.get(theme);
    if (!env) {
      env = studioEnv(this.renderer, light);
      this.envs.set(theme, env);
    }
    this.scene.environment = env;
    this.themed.back.color.set(light ? "#dfe8e2" : "#0c1613");
    this.themed.glass.attenuationColor.set(light ? "#45cfa6" : "#12a08e");
    this.themed.glass.attenuationDistance = light ? 2.6 : 1.0;
    this.themed.shadow.opacity = light ? 0.32 : 0.7;
    for (const m of this.themed.gold) m.color.set(light ? "#d6c084" : "#d9bc76");
    this.themed.relief.color.set(light ? "#b98d33" : "#d9bc76");
    this.caseEmpty.color.set(light ? "#f3f1ea" : "#0a0f0d");
    // On mint glass: due seats a dark ring, paid seats a solid emerald dome, open seats faint
    (this.mats.taken as MeshBasicMaterial).color.set(light ? "#4f6b60" : "#9fb2a9");
    (this.mats.lit as MeshBasicMaterial).color.set(light ? "#0e8a5f" : LUME);
    const open = this.mats.open as MeshBasicMaterial;
    open.color.set(light ? "#6f8a7e" : "#a8b6af");
    open.opacity = light ? 0.6 : 0.45;
    // Additive glow vanishes on a light page; the dome carries it there
    (this.mats.glow as SpriteMaterial).opacity = light ? 0 : 0.7;
    (this.mats.glowLate as SpriteMaterial).opacity = light ? 0.3 : 0.6;
  }

  private render() {
    if (this.lost || !this.host || !this.ready) return;
    this.renderer.render(this.scene, this.camera);
  }

  /** Drop the previous hosting's motion: finish its tweens so nothing waits on them forever. */
  private reset() {
    this.gen++;
    this.stopLoop();
    this.finishTweens();
    this.queue = Promise.resolve();
    this.pending = null;
    this.spinning = false;
  }

  private finishTweens() {
    const cut = this.tweens;
    this.tweens = [];
    for (const tw of cut) {
      try {
        tw.fn(1);
      } catch {
        /* the mark it animated may be gone */
      }
      tw.resolve();
    }
  }

  private aim() {
    const [elev, dist] = VIEWS[this.opts.view];
    this.camera.position.set(0, -0.02 + dist * Math.sin(elev), dist * Math.cos(elev));
    this.camera.lookAt(0, -0.02, 0);
    this.camera.updateProjectionMatrix();
  }

  private startLoop() {
    if (this.looping || this.lost) return;
    this.looping = true;
    let last = performance.now();
    const frame = (t: number) => {
      if (!this.looping) return;
      // rAF timestamps can trail performance.now(): never step backwards
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      this.step(dt);
      if (this.spinning) this.dial.rotation.y += dt * 2.4;
      this.render();
      if (!this.tweens.length && !this.spinning) {
        this.looping = false;
        this.raf = 0;
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stopLoop() {
    this.looping = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tween(dur: number, fn: (k: number) => void) {
    return new Promise<void>((resolve) => {
      if (this.opts.reducedMotion || !this.host || document.hidden) {
        fn(1);
        resolve();
        this.render();
        return;
      }
      this.tweens.push({ t0: this.now, dur, fn, resolve });
      this.startLoop();
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

  /** `grow`: every mark scales in (a new seat count), or just the listed seats (someone joined). */
  private build(grow: boolean | number[] = false) {
    this.dial.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.userData?.own) {
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
      }
    });
    this.dial.clear();
    const s = this.spec;
    const n = s.seats;
    const R = 1.19;
    this.marks = [];
    for (let i = 0; i < n; i++) {
      const a = this.seatAngle(i);
      const g = new Group() as MarkGroup;
      g.position.set(R * Math.cos(a), 0.192, R * Math.sin(a));
      const st = markState(s, i);
      if (st === "open") g.add(new Mesh(this.geo.open, this.mats.open));
      else if (st === "taken") g.add(new Mesh(this.geo.ring, this.mats.taken));
      else if (st === "late") {
        g.add(new Mesh(this.geo.lateRing, this.mats.late));
        const glow = new Sprite(this.mats.glowLate as SpriteMaterial);
        glow.scale.setScalar(0.2);
        g.add(glow);
      } else {
        const dome = new Mesh(this.geo.dome, this.mats[st]);
        dome.scale.set(1, 0.5, 1);
        g.add(dome);
        g.userData.dome = dome;
        if (st === "won") g.add(new Mesh(this.geo.wonRing, this.mats.won));
        if (st === "lit") {
          const glow = new Sprite(this.mats.glow as SpriteMaterial);
          glow.scale.setScalar(0.23);
          glow.position.y = 0.012;
          g.add(glow);
        }
      }
      if (i === s.you) g.add(new Mesh(this.geo.you, this.mats.you));
      const grows = grow === true || (Array.isArray(grow) && grow.includes(i));
      if (grows && !this.opts.reducedMotion) g.scale.setScalar(0.01);
      this.dial.add(g);
      this.marks.push(g);
    }
    // round track on the inner edge of the glass: gold done, lume now, dark next
    const off = new Color(this.opts.theme === "light" ? "#b3bfb9" : "#33423c");
    const gap = Math.min(0.08, TAU / n / 5);
    for (let i = 0; i < n; i++) {
      const len = TAU / n - gap;
      let col = off;
      if (s.mode === "complete") col = MARK_GOLD;
      else if (s.mode === "active") col = i < (s.round ?? 1) - 1 ? MARK_GOLD : i === (s.round ?? 1) - 1 ? LUME : off;
      const arc = new Mesh(new TorusGeometry(1.075, 0.008, 6, 48, len).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: col.clone(), toneMapped: false, transparent: true }));
      arc.userData = { own: true };
      const start = this.seatAngle(i) - TAU / n / 2 + gap / 2;
      arc.rotation.y = -(start + len);
      arc.position.y = 0.191;
      this.dial.add(arc);
    }
    this.coinPivot.visible = s.coin !== false;
    this.backMesh.material = s.coin === false ? this.caseEmpty : this.themed.back;
    if (grow === true) this.marks.forEach((m, i) => void this.tween(0.18 + i * 0.012, (k) => m.scale.setScalar(Math.max(0.01, ease.outBack(k)))));
    else if (grow)
      for (const m of grow.map((i) => this.marks[i]).filter(Boolean)) void this.tween(0.34, (k) => m.scale.setScalar(Math.max(0.01, ease.outBack(k))));
    this.render();
  }

  private async transition(next: DialSpec) {
    const gen = this.gen;
    const prev = this.spec;
    if (next.seats !== prev.seats) {
      this.spec = next;
      this.dial.rotation.y = 0;
      this.build(true);
      // Skip the wobble while the ruler is still moving
      if (this.pending === null) await this.tick(0.03);
      return;
    }
    const newWin = (next.won ?? []).find((i) => !(prev.won ?? []).includes(i));
    if (newWin !== undefined && next.mode !== "pending") {
      this.spinning = false;
      await this.spinTo(newWin);
      if (gen !== this.gen) return;
      this.spec = next;
      this.build();
      await this.flip();
      return;
    }
    const seats = Array.from({ length: next.seats }, (_, i) => i);
    const newlyLit = seats.filter((i) => markState(next, i) === "lit" && markState(prev, i) !== "lit");
    // Someone took an open seat: its mark pops into place and a faint ring leaves it
    const joined = seats.filter((i) => markState(prev, i) === "open" && markState(next, i) !== "open");
    this.spec = next;
    this.build(joined);
    for (const i of joined) void this.ripple(i);
    for (const i of newlyLit) {
      if (gen !== this.gen) return;
      await this.detent(i);
    }
  }

  private tick(amount: number) {
    // A free spin owns the rotation; a tick would snap it back
    if (this.spinning) return Promise.resolve();
    const base = this.dial.rotation.y;
    return this.tween(0.22, (k) => (this.dial.rotation.y = base + amount * Math.sin(k * Math.PI)));
  }

  private async ripple(i: number) {
    const g = this.marks[i];
    if (!g) return;
    const ring = new Mesh(this.geo.ripple, new MeshBasicMaterial({ color: (this.mats.taken as MeshBasicMaterial).color.clone(), transparent: true, toneMapped: false }));
    g.add(ring);
    await this.tween(0.6, (k) => {
      ring.scale.setScalar(1 + 3.2 * ease.out3(k));
      (ring.material as MeshBasicMaterial).opacity = 0.7 * (1 - k);
    });
    g.remove(ring);
    (ring.material as Material).dispose();
    this.render();
  }

  // C1: the mark flashes, settles to lume, a ripple leaves it, the bezel ticks one notch
  private async detent(i: number) {
    const g = this.marks[i];
    const dome = g?.userData.dome;
    if (!g || !dome) return;
    const flash = new MeshBasicMaterial({ color: LUME_FLASH.clone(), toneMapped: false, transparent: true });
    const prevMat = dome.material;
    dome.material = flash;
    const ripple = new Mesh(this.geo.ripple, new MeshBasicMaterial({ color: LUME.clone(), transparent: true, toneMapped: false }));
    g.add(ripple);
    void this.tick(0.035);
    await this.tween(0.5, (k) => {
      flash.color.copy(LUME_FLASH).lerp(LUME, smooth(0.25, 1, k));
      ripple.scale.setScalar(1 + 5 * ease.out3(k));
      (ripple.material as MeshBasicMaterial).opacity = 1 - k;
    });
    g.remove(ripple);
    (ripple.material as Material).dispose();
    dome.material = prevMat;
    flash.dispose();
    this.render();
  }

  // C2: spin, slow through detents, stop with the winner under the pip
  private async spinTo(winner: number) {
    const gen = this.gen;
    const step = TAU / this.spec.seats;
    const from = this.dial.rotation.y;
    const target = (winner * step) % TAU;
    const delta = (((target - from) % TAU) + TAU * 2) % TAU;
    const total = TAU * 2 + delta;
    await this.tween(2.6, (k) => {
      const abs = from + total * ease.out4(k);
      const q = abs / step;
      const stepped = step * (Math.floor(q) + smooth(0.62, 1, q - Math.floor(q)));
      this.dial.rotation.y = lerp(abs, stepped, smooth(0.45, 0.8, k));
    });
    if (gen === this.gen) this.dial.rotation.y = from + total;
  }

  // A full turn: the gem is only on the top face, so a half turn would end on the plain back.
  private async flip() {
    await this.tween(1, (k) => {
      this.coinPivot.rotation.x = TAU * ease.inOut3(k);
      this.coinPivot.position.y = 0.45 * Math.sin(Math.PI * k);
    });
    this.coinPivot.rotation.x = 0;
    this.coinPivot.position.y = 0;
    this.render();
  }
}

let engine: DialEngine | null = null;

/** The session's dial engine. Throws if WebGL 2 isn't available; callers keep the SVG then. */
export function getDialEngine() {
  if (!engine || engine.isLost) engine = new DialEngine();
  return engine;
}

/** The engine if it can draw right now, so a new Dial shows in 3D from its first frame. */
export function readyDialEngine() {
  return engine?.isReady ? engine : null;
}

export type { DialEngine };
