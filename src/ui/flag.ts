import type { FlagSpec } from '../sim/procgen/nation';

type Ctx = CanvasRenderingContext2D;

function starPath(g: Ctx, cx: number, cy: number, r: number, rot = -Math.PI / 2): void {
  const inner = r * 0.382;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : inner;
    const a = rot + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

function poly(g: Ctx, pts: readonly (readonly [number, number])[], cx: number, cy: number, s: number): void {
  g.beginPath();
  pts.forEach(([px, py], i) => {
    const X = cx + px * s;
    const Y = cy + py * s;
    if (i === 0) g.moveTo(X, Y);
    else g.lineTo(X, Y);
  });
  g.closePath();
  g.fill();
}

const EAGLE: readonly (readonly [number, number])[] = [
  [0, -0.55], [0.12, -0.42], [0.12, -0.25], [0.5, -0.6], [1, -0.45], [0.8, -0.2],
  [0.95, 0.05], [0.55, 0.0], [0.6, 0.25], [0.25, 0.1], [0.2, 0.5], [0.08, 0.35],
  [0, 0.6], [-0.08, 0.35], [-0.2, 0.5], [-0.25, 0.1], [-0.6, 0.25], [-0.55, 0.0],
  [-0.95, 0.05], [-0.8, -0.2], [-1, -0.45], [-0.5, -0.6], [-0.12, -0.25], [-0.12, -0.42],
];

function drawCharge(g: Ctx, kind: FlagSpec['charge'], color: string, cx: number, cy: number, r: number): void {
  g.fillStyle = color;
  g.strokeStyle = color;
  switch (kind) {
    case 'none':
      return;
    case 'star':
      starPath(g, cx, cy, r);
      g.fill();
      return;
    case 'disc':
      g.beginPath();
      g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      g.fill();
      return;
    case 'sun': {
      g.beginPath();
      g.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = Math.max(0.6, r * 0.12);
      g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        g.moveTo(cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68);
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.stroke();
      return;
    }
    case 'crescent': {
      const ro = r * 0.9;
      const ri = r * 0.72;
      const off = r * 0.32;
      g.beginPath();
      g.arc(cx, cy, ro, 0, Math.PI * 2, false);
      g.arc(cx + off, cy, ri, 0, Math.PI * 2, true);
      g.fill('evenodd');
      return;
    }
    case 'crown': {
      const w = r * 1.7;
      const top = cy - r * 0.6;
      const base = cy + r * 0.25;
      const x0 = cx - w / 2;
      g.beginPath();
      g.moveTo(x0, base);
      g.lineTo(x0, top);
      g.lineTo(x0 + w * 0.25, top + r * 0.55);
      g.lineTo(cx, top - r * 0.1);
      g.lineTo(x0 + w * 0.75, top + r * 0.55);
      g.lineTo(x0 + w, top);
      g.lineTo(x0 + w, base);
      g.closePath();
      g.fill();
      g.fillRect(x0, base + r * 0.1, w, r * 0.35);
      return;
    }
    case 'gear': {
      const teeth = 8;
      const ro = r;
      const rb = r * 0.78;
      g.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a = (i * Math.PI * 2) / teeth;
        const hw = Math.PI / teeth / 2;
        const pts: readonly [number, number][] = [
          [rb, a - hw * 1.3], [ro, a - hw * 0.8], [ro, a + hw * 0.8], [rb, a + hw * 1.3],
        ];
        pts.forEach(([rad, ang], j) => {
          const px = cx + Math.cos(ang) * rad;
          const py = cy + Math.sin(ang) * rad;
          if (i === 0 && j === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        });
      }
      g.closePath();
      g.moveTo(cx + r * 0.32, cy);
      g.arc(cx, cy, r * 0.32, 0, Math.PI * 2, true);
      g.fill('evenodd');
      return;
    }
    case 'eagle':
      poly(g, EAGLE, cx, cy, r);
      return;
    case 'tree': {
      const tw = r * 0.2;
      g.fillRect(cx - tw / 2, cy + r * 0.55, tw, r * 0.45);
      for (let i = 0; i < 3; i++) {
        const ty = cy - r * 0.9 + i * r * 0.5;
        const half = r * (0.4 + i * 0.22);
        g.beginPath();
        g.moveTo(cx, ty);
        g.lineTo(cx + half, ty + r * 0.7);
        g.lineTo(cx - half, ty + r * 0.7);
        g.closePath();
        g.fill();
      }
      return;
    }
    case 'cross': {
      const t = r * 0.5;
      g.fillRect(cx - t / 2, cy - r, t, r * 2);
      g.fillRect(cx - r, cy - t / 2, r * 2, t);
      return;
    }
    case 'stars_ring': {
      const sr = r * 0.22;
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 4;
        starPath(g, cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75, sr);
        g.fill();
      }
      return;
    }
  }
}

function drawField(g: Ctx, flag: FlagSpec, x: number, y: number, w: number, h: number): void {
  const c0 = flag.colors[0] ?? '#888888';
  const c1 = flag.colors[1] ?? c0;
  const c2 = flag.colors[2] ?? c0;
  const rect = (c: string, rx: number, ry: number, rw: number, rh: number): void => {
    g.fillStyle = c;
    g.fillRect(rx, ry, rw, rh);
  };
  const tri = (c: string, pts: readonly (readonly [number, number])[]): void => {
    g.fillStyle = c;
    g.beginPath();
    pts.forEach(([px, py], i) => {
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.fill();
  };
  rect(c0, x, y, w, h);
  switch (flag.division) {
    case 'plain':
      break;
    case 'bicolor_h':
      rect(c1, x, y + h / 2, w, h / 2);
      break;
    case 'bicolor_v':
      rect(c1, x + w / 2, y, w / 2, h);
      break;
    case 'tricolor_h':
      rect(c1, x, y + h / 3, w, h / 3);
      rect(c2, x, y + (2 * h) / 3, w, h / 3);
      break;
    case 'tricolor_v':
      rect(c1, x + w / 3, y, w / 3, h);
      rect(c2, x + (2 * w) / 3, y, w / 3, h);
      break;
    case 'nordic_cross': {
      const t = Math.max(1, h * 0.18);
      const vx = x + w * 0.36;
      rect(c1, vx - t / 2, y, t, h);
      rect(c1, x, y + h / 2 - t / 2, w, t);
      const t2 = t * 0.5;
      rect(c2, vx - t2 / 2, y, t2, h);
      rect(c2, x, y + h / 2 - t2 / 2, w, t2);
      break;
    }
    case 'canton':
      rect(c1, x, y, w * 0.45, h * 0.5);
      break;
    case 'quartered':
      rect(c1, x + w / 2, y, w / 2, h / 2);
      rect(c1, x, y + h / 2, w / 2, h / 2);
      break;
    case 'saltire': {
      const t = Math.max(1, h * 0.2);
      g.strokeStyle = c1;
      g.lineWidth = t;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w, y + h);
      g.moveTo(x + w, y);
      g.lineTo(x, y + h);
      g.stroke();
      break;
    }
    case 'diagonal':
      tri(c1, [[x + w, y], [x + w, y + h], [x, y + h]]);
      break;
    case 'chevron':
      tri(c1, [[x, y], [x + w * 0.5, y + h / 2], [x, y + h]]);
      if (flag.colors.length > 2) {
        tri(c2, [[x, y + h * 0.25], [x + w * 0.25, y + h / 2], [x, y + h * 0.75]]);
      }
      break;
  }
}

export function drawFlag(g: CanvasRenderingContext2D, flag: FlagSpec, x: number, y: number, w: number, h: number): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  drawField(g, flag, x, y, w, h);

  let cx = x + w / 2;
  let cy = y + h / 2;
  let r = Math.min(w, h) * 0.3;
  if (flag.division === 'canton') {
    cx = x + w * 0.225;
    cy = y + h * 0.25;
    r = Math.min(w * 0.45, h * 0.5) * 0.36;
  } else if (flag.division === 'nordic_cross') {
    cx = x + w * 0.36;
    r = Math.min(w, h) * 0.2;
  }
  if (flag.division === 'nordic_cross' && (flag.charge === 'star' || flag.charge === 'disc')) {
    r *= 0.9;
  }
  drawCharge(g, flag.charge, flag.chargeColor, cx, cy, r);
  g.restore();

  g.save();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.restore();
}

const cache = new Map<string, string>();

export function flagDataUrl(flag: FlagSpec, w: number, h: number): string {
  const key = `${JSON.stringify(flag)}|${w}x${h}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return '';
  drawFlag(g, flag, 0, 0, w, h);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}
