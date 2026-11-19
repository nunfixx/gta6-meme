// make-meme.ts — renders the GTA 6 meme for gta6-meme-x-01, deterministically, no network.
// Pure Node 22 stdlib (node:fs, node:zlib). Output: meme.png, 1024x1024.
// The joke: the make.fun ghost is the getaway driver — "MY AGENT DID THE HEIST /
// I JUST PLAY THE GAME". The ghost (our agent) won the money on make.fun and bought
// the game; the player just plays. Vice City sunset, palm trees, lowrider, money bag.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ---------- PNG encoder (RGB, 8-bit, no interlace) ----------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Canvas (2x supersampled, then downsampled for smooth edges) ----------
const W = 1024;
const H = 1024;
const SS = 2; // supersample factor
const SW = W * SS;
const SH = H * SS;
const buf = new Uint8Array(SW * SH * 3);

type RGB = [number, number, number];
function px(x: number, y: number, c: RGB): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= SW || yi >= SH) return;
  const i = (yi * SW + xi) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}
function rect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.floor(y0 * SS); y < Math.floor(y1 * SS); y++)
    for (let x = Math.floor(x0 * SS); x < Math.floor(x1 * SS); x++) px(x, y, c);
}
function circle(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * SS;
  for (let y = Math.floor((cy - r) * SS); y < Math.floor((cy + r) * SS); y++)
    for (let x = Math.floor((cx - r) * SS); x < Math.floor((cx + r) * SS); x++) {
      const dx = (x + 0.5) / SS - cx;
      const dy = (y + 0.5) / SS - cy;
      if (dx * dx + dy * dy <= r * r) px(x, y, c);
    }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = Math.floor((cy - ry) * SS); y < Math.floor((cy + ry) * SS); y++)
    for (let x = Math.floor((cx - rx) * SS); x < Math.floor((cx + rx) * SS); x++) {
      const dx = ((x + 0.5) / SS - cx) / rx;
      const dy = ((y + 0.5) / SS - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(x, y, c);
    }
}
// Scanline polygon fill. pts: [x, y][] in final-pixel coordinates.
function poly(pts: [number, number][], c: RGB): void {
  const spts = pts.map(([x, y]) => [x * SS, y * SS] as [number, number]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of spts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.max(0, Math.floor(minY)); y < Math.min(SH, Math.ceil(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < spts.length; i++) {
      const [x0, y0] = spts[i];
      const [x1, y1] = spts[(i + 1) % spts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y + 0.5 - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.floor(xs[k])); x < Math.min(SW, Math.ceil(xs[k + 1])); x++) {
        px(x, y, c);
      }
    }
  }
}
// Quadratic bezier points.
function qbez(p0: [number, number], p1: [number, number], p2: [number, number], n = 24): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    out.push([a * p0[0] + b * p1[0] + d * p2[0], a * p0[1] + b * p1[1] + d * p2[1]]);
  }
  return out;
}
// A tapered ribbon along a bezier spine: width w0 at the start, w1 at the end.
function ribbon(p0: [number, number], p1: [number, number], p2: [number, number], w0: number, w1: number, c: RGB): void {
  const spine = qbez(p0, p1, p2, 20);
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < spine.length; i++) {
    const t = i / (spine.length - 1);
    const w = (w0 + (w1 - w0) * t) / 2;
    const a = spine[Math.min(i + 1, spine.length - 1)];
    const b = spine[Math.max(i - 1, 0)];
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * w;
    const ny = (dx / len) * w;
    left.push([spine[i][0] + nx, spine[i][1] + ny]);
    right.push([spine[i][0] - nx, spine[i][1] - ny]);
  }
  poly([...left, ...right.reverse()], c);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mix(c0: RGB, c1: RGB, t: number): RGB {
  return [Math.round(lerp(c0[0], c1[0], t)), Math.round(lerp(c0[1], c1[1], t)), Math.round(lerp(c0[2], c1[2], t))];
}
// Vertical gradient with stops: [position 0..1, colour][].
function vgrad(stops: [number, RGB][]): void {
  for (let y = 0; y < H; y++) {
    const t = y / H;
    let c: RGB = stops[stops.length - 1][1];
    for (let i = 0; i + 1 < stops.length; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        c = mix(stops[i][1], stops[i + 1][1], (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]));
        break;
      }
    }
    rect(0, y, W, y + 1, c);
  }
}

// ---------- Bold 5x7 bitmap font (caps, digits, few marks) ----------
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
};
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
// Draw one line of text centred at cx, top y, in fill colour with a black outline.
// scale: pixel size of one font cell unit (final pixels).
function drawText(cx: number, y: number, s: string, scale: number, fill: RGB, outline: RGB): void {
  const w = textWidth(s, scale);
  let x = cx - w / 2;
  const draw = (dx: number, dy: number, c: RGB) => {
    let gx = x + dx;
    for (const ch of s) {
      const g = FONT[ch] ?? FONT[' '];
      for (let r = 0; r < 7; r++)
        for (let col = 0; col < 5; col++)
          if (g[r][col] === '1') rect(gx + col * scale, y + dy + r * scale, gx + (col + 1) * scale, y + dy + (r + 1) * scale, c);
      gx += 6 * scale;
    }
  };
  const o = Math.max(2, Math.round(scale * 0.28));
  draw(-o, 0, outline);
  draw(o, 0, outline);
  draw(0, -o, outline);
  draw(0, o, outline);
  draw(-o, -o, outline);
  draw(o, -o, outline);
  draw(-o, o, outline);
  draw(o, o, outline);
  draw(0, 0, fill);
}
// N-pointed star polygon points (outer radius R, inner radius r).
function starPts(cx: number, cy: number, n: number, R: number, r: number, rot = -Math.PI / 2): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = rot + (i * Math.PI) / n;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return pts;
}

// ---------- Scene: Vice City sunset ----------
const SKY_STOPS: [number, RGB][] = [
  [0.0, [42, 10, 74]],
  [0.28, [94, 22, 96]],
  [0.5, [198, 44, 96]],
  [0.66, [255, 107, 48]],
  [0.8, [255, 178, 92]],
  [1.0, [255, 205, 120]],
];
function skyColorAt(y: number): RGB {
  const t = Math.min(1, Math.max(0, y / 660));
  for (let i = 0; i + 1 < SKY_STOPS.length; i++) {
    if (t >= SKY_STOPS[i][0] && t <= SKY_STOPS[i + 1][0]) {
      return mix(SKY_STOPS[i][1], SKY_STOPS[i + 1][1], (t - SKY_STOPS[i][0]) / (SKY_STOPS[i + 1][0] - SKY_STOPS[i][0]));
    }
  }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}
const HORIZON = 660;
function drawSky(): void {
  for (let y = 0; y < HORIZON; y++) rect(0, y, W, y + 1, skyColorAt(y));
  // Synthwave sun with slits.
  const sunX = 700;
  const sunY = 520;
  const sunR = 130;
  circle(sunX, sunY, sunR, [255, 233, 168]);
  let slitY = sunY + 18;
  let slitH = 4;
  while (slitY < sunY + sunR - 6) {
    rect(sunX - sunR, slitY, sunX + sunR, slitY + slitH, skyColorAt(slitY));
    slitY += slitH + 16;
    slitH += 3;
  }
  // Distant Vice City skyline silhouette.
  const SIL: RGB = [38, 12, 52];
  const towers: [number, number, number, number][] = [
    [60, 560, 46, 100], [120, 585, 34, 75], [170, 545, 52, 115], [240, 590, 30, 70],
    [700, 575, 40, 85], [752, 550, 48, 110], [812, 590, 32, 70], [858, 565, 44, 95], [920, 595, 36, 65],
  ];
  for (const [x, y, w, h] of towers) rect(x, y, x + w, y + h, SIL);
  // A few lit windows in the skyline.
  const WIN: RGB = [255, 214, 120];
  const wins: [number, number][] = [
    [76, 580], [92, 605], [182, 565], [200, 600], [716, 595], [768, 570], [872, 585], [930, 612],
  ];
  for (const [x, y] of wins) rect(x, y, x + 7, y + 9, WIN);
  // Birds.
  const BIRD: RGB = [30, 8, 44];
  const birds: [number, number, number][] = [[300, 210, 16], [340, 185, 12], [690, 230, 14], [730, 205, 11]];
  for (const [x, y, s] of birds) {
    poly([[x - s, y], [x - s * 0.4, y - s * 0.45], [x, y], [x + s * 0.4, y - s * 0.45], [x + s, y]], BIRD);
  }
}
function drawPalm(x: number, baseY: number, h: number, lean: number): void {
  const TRUNK: RGB = [22, 8, 46];
  const topX = x + lean;
  const topY = baseY - h;
  ribbon([x, baseY], [x + lean * 0.4, baseY - h * 0.55], [topX, topY], 26, 12, TRUNK);
  // Fronds: 7 curved tapered ribbons fanning from the crown.
  const angles: [number, number][] = [
    [-175, -15], [-150, -55], [-105, -90], [-45, -108], [15, -102], [70, -88], [120, -55], [168, -12],
  ];
  for (const [dx, dy] of angles) {
    const tipX = topX + dx * 1.15;
    const tipY = topY + dy * 1.15;
    const midX = topX + dx * 0.55;
    const midY = topY + dy * 0.4 - 36;
    ribbon([topX, topY], [midX, midY], [tipX, tipY], 20, 2, TRUNK);
  }
  // Coconuts.
  circle(topX - 10, topY + 12, 8, TRUNK);
  circle(topX + 10, topY + 14, 8, TRUNK);
}
function drawRoad(): void {
  rect(0, HORIZON, W, H, [24, 18, 36]);
  rect(0, HORIZON, W, HORIZON + 6, [16, 10, 30]);
  // Lane dashes removed: they crossed the bottom caption.
  // No light pool: a hard-edged band read as a floating slab.
}

// ---------- The getaway car ----------
function drawCar(): void {
  // Ground shadow.
  ellipse(520, 892, 290, 16, [14, 10, 24]);
  // Speed lines behind the car.
  const STREAK: RGB = [185, 167, 217];
  rect(120, 782, 238, 788, STREAK);
  rect(150, 812, 244, 818, STREAK);
  rect(105, 842, 232, 848, STREAK);
  // Body: vivid Vice City magenta so the car reads against the dark road.
  const BODY: RGB = [176, 44, 128];
  const body: [number, number][] = [
    [265, 845], [275, 792], [300, 776], [360, 768], [420, 760], [448, 736],
    [600, 730], [655, 758], [730, 770], [772, 788], [780, 812], [772, 845],
  ];
  poly(body, BODY);
  // Wheel arches (cut into the body).
  circle(355, 845, 52, [14, 10, 24]);
  circle(690, 845, 52, [14, 10, 24]);
  // Windows.
  const GLASS: RGB = [159, 216, 255];
  poly([[452, 748], [592, 742], [636, 764], [462, 770]], GLASS);
  rect(540, 744, 548, 769, BODY); // B-pillar
  // Wheels.
  for (const wx of [355, 690]) {
    circle(wx, 845, 44, [10, 10, 14]);
    circle(wx, 845, 24, [178, 178, 192]);
    circle(wx, 845, 10, [40, 40, 52]);
    circle(wx, 845, 5, [233, 30, 140]);
  }
  // Door line + handle.
  rect(545, 776, 549, 840, [90, 20, 70]);
  rect(470, 792, 512, 798, [120, 30, 90]);
  // Headlight + taillight.
  ellipse(766, 800, 12, 7, [255, 226, 130]);
  rect(268, 796, 280, 808, [255, 60, 70]);
  // Chrome trim along the bottom.
  rect(280, 838, 770, 842, [90, 84, 110]);
}

// ---------- The make.fun ghost (the agent) ----------
function ghostBodyPts(cx: number, topY: number, w: number, botY: number): [number, number][] {
  const r = w / 2;
  const pts: [number, number][] = [];
  // Dome: semicircle from left to right over the top.
  for (let a = Math.PI; a <= 2 * Math.PI + 0.001; a += Math.PI / 24) {
    pts.push([cx + Math.cos(a) * r, topY + r + Math.sin(a) * r]);
  }
  // Right side down to the scallops.
  pts.push([cx + r, botY - 22]);
  // Three scallops along the bottom (downward semicircles).
  const sw = w / 3;
  for (let s = 0; s < 3; s++) {
    const scx = cx + r - sw * (s + 0.5);
    for (let a = 0; a <= Math.PI + 0.001; a += Math.PI / 12) {
      pts.push([scx + Math.cos(a) * (sw / 2), botY - 22 + Math.sin(a) * 22]);
    }
  }
  // Left side back up.
  pts.push([cx - r, botY - 22]);
  return pts;
}
function drawGhost(cx: number, topY: number, w: number, botY: number): void {
  const BLACK: RGB = [12, 8, 20];
  const WHITE: RGB = [255, 255, 255];
  const pts = ghostBodyPts(cx, topY, w, botY);
  // Thick black outline: draw the shape shifted in 8 directions, then white on top.
  const o = 5;
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]) {
    poly(pts.map(([x, y]) => [x + dx, y + dy] as [number, number]), BLACK);
  }
  poly(pts, WHITE);
  // Sparkle eyes (4-pointed stars).
  const eyeY = topY + w * 0.42;
  for (const ex of [cx - w * 0.21, cx + w * 0.21]) {
    poly(starPts(ex, eyeY, 4, 15, 4.5), BLACK);
  }
  // Raised arm holding the magenta coin.
  const armBase: [number, number] = [cx + w * 0.32, topY + w * 0.78];
  const armTip: [number, number] = [cx + w * 0.72, topY - 8];
  ribbon(armBase, [(armBase[0] + armTip[0]) / 2 + 12, (armBase[1] + armTip[1]) / 2], armTip, 26, 18, BLACK);
  ribbon(armBase, [(armBase[0] + armTip[0]) / 2 + 12, (armBase[1] + armTip[1]) / 2], armTip, 18, 12, WHITE);
  // Little hand.
  circle(armTip[0], armTip[1], 15, BLACK);
  circle(armTip[0], armTip[1], 11, WHITE);
  // Magenta coin with a white star, held high.
  const coinX = armTip[0] + 8;
  const coinY = armTip[1] - 34;
  circle(coinX, coinY, 38, BLACK);
  circle(coinX, coinY, 33, [233, 30, 140]);
  poly(starPts(coinX, coinY, 5, 21, 8.5), WHITE);
}
// ---------- Compose + render ----------
function downsample(): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++)
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * SW + (x * SS + dx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      const o = (y * W + x) * 3;
      out[o] = Math.round(r / (SS * SS));
      out[o + 1] = Math.round(g / (SS * SS));
      out[o + 2] = Math.round(b / (SS * SS));
    }
  }
  return out;
}

drawSky();
drawPalm(88, 664, 380, 46);
drawPalm(946, 664, 350, -40);
drawPalm(258, 662, 150, 18);
drawPalm(792, 662, 130, -14);
drawRoad();
drawCar();
drawGhost(440, 620, 150, 830);

// Captions, Impact style: white with a thick black outline.
drawText(512, 30, 'MY AGENT DID', 10, [255, 255, 255], [10, 6, 18]);
drawText(512, 118, 'THE HEIST', 10, [255, 255, 255], [10, 6, 18]);
drawText(512, 898, 'I JUST PLAY', 8, [255, 255, 255], [10, 6, 18]);
drawText(512, 962, 'THE GAME', 8, [255, 255, 255], [10, 6, 18]);

const png = encodePNG(W, H, downsample());
writeFileSync('meme.png', png);
console.log('meme.png written:', png.length, 'bytes');
