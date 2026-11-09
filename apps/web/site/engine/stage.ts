// ASCII background: the three slanted bars of the Solana logo, drawn as text characters on a 2D canvas.
// Scrolling turns the logo: scroll position sets its spin, scroll speed tilts it and pulls the bars apart.

/** Section names still label which part of the page is in view; the ASCII stage draws the same logo for all of them. */
export type ShapeName = string;

/** Per-section settings from the markup. The ASCII stage draws the same grey logo everywhere, so these are accepted and ignored. */
export interface MorphOptions {
  colorA?: string;
  colorB?: string;
  x?: number;
  y?: number;
  yNarrow?: number;
  scale?: number;
  narrowScale?: number;
  autoRotate?: number;
  tiltX?: number;
  rotZ?: number;
  opacity?: number;
  duration?: number;
  arcs?: boolean;
  hud?: boolean;
  jitter?: number;
  front?: boolean;
  sway?: number;
}

// Characters from darkest to brightest, picked by how much light a surface point faces.
const RAMP = ".,-~:;=!*#$@";
// Text cell size in CSS pixels. Characters are about twice as tall as they are wide.
const CELL_W = 6;
const CELL_H = 11;
// Plain grey characters, like the reference video; dim enough to sit behind text.
const COLOR = "rgb(150, 156, 166)";

// Logo geometry in model units: each bar is a slanted box (a parallelogram pushed out into depth).
const BAR_LENGTH = 2.4;
const BAR_HEIGHT = 0.5;
const BAR_DEPTH = 0.3;
const BAR_GAP = 0.32;
// How far the top of a bar leans sideways compared with its bottom; the middle bar leans the other way.
const BAR_SLANT = 0.5;

// How many samples to take across each face (along the bar, across its height, across its depth).
const SAMPLES_LENGTH = 140;
const SAMPLES_HEIGHT = 26;
const SAMPLES_DEPTH = 16;

// Direction the light comes from (up, left, and towards the viewer), normalised once.
const LIGHT = normalise([-0.45, 0.6, -0.65]);

/** One flat side of a bar: a corner, two edge vectors that span it, and the outward normal. */
interface Face {
  corner: number[];
  edgeA: number[];
  edgeB: number[];
  normal: number[];
  stepsA: number;
  stepsB: number;
}

export class Stage {
  private ctx: CanvasRenderingContext2D;
  private reducedMotion: boolean;
  private running = true;

  // Surface samples of the logo at rest: positions (x,y,z), normals (x,y,z), and which bar (0,1,2) each belongs to.
  private positions: Float32Array;
  private normals: Float32Array;
  private barOf: Uint8Array;

  // Text grid, rebuilt on resize.
  private cols = 0;
  private rows = 0;
  private dpr = 1;
  private depth = new Float32Array(0);
  private glyphs = new Uint8Array(0);

  // Smoothed animation state: each value eases towards its target every frame.
  private spin = 0;
  private tilt = 0.5;
  private spread = 0;
  private scrollV = 0;
  private pulse = 0;

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion?: boolean } = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.reducedMotion = !!opts.reducedMotion;

    const samples = buildLogoSamples();
    this.positions = samples.positions;
    this.normals = samples.normals;
    this.barOf = samples.barOf;

    this.resize();
    window.addEventListener("resize", () => this.resize());
    // Stop drawing while the tab is hidden.
    document.addEventListener("visibilitychange", () => {
      this.running = !document.hidden;
    });
  }

  resize() {
    const canvas = this.ctx.canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * this.dpr);
    canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.cols = Math.ceil(window.innerWidth / CELL_W);
    this.rows = Math.ceil(window.innerHeight / CELL_H);
    this.depth = new Float32Array(this.cols * this.rows);
    this.glyphs = new Uint8Array(this.cols * this.rows);
    // Reduced motion draws one still frame, so redraw it at the new size.
    if (this.reducedMotion) this.frame(0);
  }

  /** Called when a new section comes into view. The logo looks the same in every section, so nothing changes. */
  morph(_name: ShapeName, _opts: MorphOptions = {}) {}

  setScrollVelocity(v: number) {
    this.scrollV = v;
  }

  /** A short burst that pushes the bars apart, used when the Drift replay reaches an alert. */
  pulseScan() {
    if (this.reducedMotion) return;
    this.pulse = 1;
  }

  start() {
    if (this.reducedMotion) {
      this.frame(0);
      return;
    }
    let last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      // About 30 frames a second is smooth enough for a text animation and halves the work.
      if (now - last < 1000 / 30 - 2) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (this.running) this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  private frame(dt: number) {
    // Fraction of the remaining distance to cover this frame, so easing is the same at any frame rate.
    const ease = 1 - Math.pow(0.02, dt);

    // Scroll position sets the spin (one full turn per ~1600px), plus a slow drift so the page never looks frozen.
    const idle = (performance.now() / 1000) * 0.08;
    const targetSpin = window.scrollY * 0.004 + idle;
    // Faster scrolling tilts the logo further and pulls the bars apart; both settle back when scrolling stops.
    const speed = Math.min(Math.abs(this.scrollV), 60);
    const targetTilt = 0.5 + Math.sign(this.scrollV) * speed * 0.006;
    const targetSpread = speed * 0.012 + this.pulse * 0.6;

    if (dt === 0) {
      this.spin = targetSpin;
      this.tilt = targetTilt;
      this.spread = targetSpread;
    } else {
      this.spin += (targetSpin - this.spin) * ease;
      this.tilt += (targetTilt - this.tilt) * ease;
      this.spread += (targetSpread - this.spread) * ease;
      this.pulse = Math.max(0, this.pulse - dt * 1.5);
    }

    this.rasterise();
    this.paint();
  }

  /** Rotate every surface sample, project it into the text grid, and keep the nearest one per cell. */
  private rasterise() {
    const { cols, rows, depth, glyphs, positions, normals, barOf } = this;
    depth.fill(0);
    glyphs.fill(0);

    const cosY = Math.cos(this.spin);
    const sinY = Math.sin(this.spin);
    const cosX = Math.cos(this.tilt);
    const sinX = Math.sin(this.tilt);

    // Fit the logo to about 45% of the shorter side of the screen.
    const cameraDistance = 6;
    const screenW = cols * CELL_W;
    const screenH = rows * CELL_H;
    const focal = Math.min(screenW, screenH) * 0.45 * (cameraDistance / BAR_LENGTH);
    // On the landing page the logo starts on the left and slides to the centre over the first screen of scrolling.
    const onLanding = document.documentElement.dataset.page === "home";
    const slide = onLanding ? Math.max(0, 1 - window.scrollY / window.innerHeight) : 0;
    const centreX = screenW / 2 - slide * screenW * 0.22;
    const centreY = screenH / 2;

    const count = barOf.length;
    for (let i = 0; i < count; i++) {
      // Move the outer bars away from the middle one by the current spread.
      const barOffset = (barOf[i]! - 1) * this.spread;
      const x = positions[i * 3]!;
      const y = positions[i * 3 + 1]! - barOffset;
      const z = positions[i * 3 + 2]!;

      // Spin around the vertical axis, then tilt around the horizontal axis.
      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;
      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      // Perspective: points further away shrink towards the centre. 1/distance doubles as the depth test value.
      const inverseDistance = 1 / (z2 + cameraDistance);
      const col = Math.floor((centreX + x1 * focal * inverseDistance) / CELL_W);
      const row = Math.floor((centreY - y2 * focal * inverseDistance) / CELL_H);
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      const cell = row * cols + col;
      if (inverseDistance <= depth[cell]!) continue;
      depth[cell] = inverseDistance;

      // Rotate the normal the same way and see how much it faces the light.
      const nx = normals[i * 3]!;
      const ny = normals[i * 3 + 1]!;
      const nz = normals[i * 3 + 2]!;
      const nx1 = nx * cosY + nz * sinY;
      const nz1 = -nx * sinY + nz * cosY;
      const ny2 = ny * cosX - nz1 * sinX;
      const nz2 = ny * sinX + nz1 * cosX;
      const light = nx1 * LIGHT[0]! + ny2 * LIGHT[1]! + nz2 * LIGHT[2]!;

      // Faces turned away from the light still get the dimmest character, so the outline stays visible.
      const level = Math.max(0, Math.min(RAMP.length - 1, Math.floor(light * RAMP.length)));
      // Stored as level + 1, so 0 means an empty cell.
      glyphs[cell] = level + 1;
    }
  }

  /** Turn the grid into one string per row and draw each row with a single fillText call. */
  private paint() {
    const { ctx, cols, rows, glyphs, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cols * CELL_W, rows * CELL_H);
    ctx.font = `${CELL_H - 1}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = "top";
    ctx.fillStyle = COLOR;
    // Stretch the font sideways so one character is exactly one cell wide, keeping columns aligned in any monospace font.
    const advance = ctx.measureText("M").width;
    ctx.scale(CELL_W / advance, 1);
    const scaledRowWidth = cols * advance;

    let line = "";
    for (let cell = 0; cell < glyphs.length; cell++) {
      const glyph = glyphs[cell]!;
      line += glyph === 0 ? " " : RAMP[glyph - 1];
      const endOfRow = (cell + 1) % cols === 0;
      if (!endOfRow) continue;
      const row = (cell + 1) / cols - 1;
      // Skip rows with no characters; most of the screen is empty.
      if (line.trim()) ctx.fillText(line, 0, row * CELL_H, scaledRowWidth);
      line = "";
    }
  }
}

/** Sample points over every face of the three bars, with each face's outward normal. */
function buildLogoSamples() {
  const faces: { face: Face; bar: number }[] = [];
  for (let bar = 0; bar < 3; bar++) {
    // Bars sit top, middle, bottom. The middle bar leans the opposite way, as in the logo.
    const centreY = (1 - bar) * (BAR_HEIGHT + BAR_GAP);
    const slant = bar === 1 ? -BAR_SLANT : BAR_SLANT;
    barFaces(centreY, slant).forEach((face) => faces.push({ face, bar }));
  }

  const total = faces.reduce((sum, f) => sum + f.face.stepsA * f.face.stepsB, 0);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const barOf = new Uint8Array(total);

  let index = 0;
  for (const { face, bar } of faces) {
    const steps = face.stepsA * face.stepsB;
    // One loop over the face's grid: a is the step along the first edge, b along the second.
    for (let k = 0; k < steps; k++) {
      const a = (k % face.stepsA) / (face.stepsA - 1);
      const b = Math.floor(k / face.stepsA) / (face.stepsB - 1);
      positions.set(
        face.corner.map((c, axis) => c + face.edgeA[axis]! * a + face.edgeB[axis]! * b),
        index * 3,
      );
      normals.set(face.normal, index * 3);
      barOf[index] = bar;
      index++;
    }
  }
  return { positions, normals, barOf };
}

/** The six faces of one slanted bar centred at height centreY. */
function barFaces(centreY: number, slant: number): Face[] {
  const halfL = BAR_LENGTH / 2;
  const halfH = BAR_HEIGHT / 2;
  const halfD = BAR_DEPTH / 2;
  // Corner at the bottom-left-front; the top edge is shifted sideways by the slant.
  const corner = [-halfL - (slant * BAR_HEIGHT) / 2, centreY - halfH, -halfD];
  const along = [BAR_LENGTH, 0, 0];
  const up = [slant * BAR_HEIGHT, BAR_HEIGHT, 0];
  const deep = [0, 0, BAR_DEPTH];
  // The slanted ends face sideways and a little down (or up), perpendicular to the "up" edge.
  const endNormal = normalise([BAR_HEIGHT, -slant * BAR_HEIGHT, 0]);

  return [
    // front and back
    { corner, edgeA: along, edgeB: up, normal: [0, 0, -1], stepsA: SAMPLES_LENGTH, stepsB: SAMPLES_HEIGHT },
    {
      corner: add(corner, deep),
      edgeA: along,
      edgeB: up,
      normal: [0, 0, 1],
      stepsA: SAMPLES_LENGTH,
      stepsB: SAMPLES_HEIGHT,
    },
    // bottom and top
    { corner, edgeA: along, edgeB: deep, normal: [0, -1, 0], stepsA: SAMPLES_LENGTH, stepsB: SAMPLES_DEPTH },
    {
      corner: add(corner, up),
      edgeA: along,
      edgeB: deep,
      normal: [0, 1, 0],
      stepsA: SAMPLES_LENGTH,
      stepsB: SAMPLES_DEPTH,
    },
    // left and right ends
    {
      corner,
      edgeA: up,
      edgeB: deep,
      normal: endNormal.map((n) => -n),
      stepsA: SAMPLES_HEIGHT,
      stepsB: SAMPLES_DEPTH,
    },
    { corner: add(corner, along), edgeA: up, edgeB: deep, normal: endNormal, stepsA: SAMPLES_HEIGHT, stepsB: SAMPLES_DEPTH },
  ];
}

function add(a: number[], b: number[]) {
  return a.map((v, i) => v + b[i]!);
}

function normalise(v: number[]) {
  const length = Math.hypot(...v);
  return v.map((x) => x / length);
}
