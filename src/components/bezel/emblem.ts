// The maze emblem from Hamza's end-card coin: nested pentagons, one gap per ring, and short
// walls between rings, so the open path winds round to the gem in the middle.
// One definition feeds the SVG seal, the SVG mini dial and the 3D coin.

export type Segment = [number, number, number, number];
type Gap = [edge: number, from: number, to: number];
type Wall = [ringA: number, ringB: number, edge: number, at: number];

export interface EmblemSpec {
  rings: number[];
  gaps: Gap[];
  walls: Wall[];
}

const TAU = Math.PI * 2;

export function pentagonVertex(cx: number, cy: number, r: number, k: number): [number, number] {
  const a = -Math.PI / 2 + (k * TAU) / 5;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function emblemSegments({ rings, gaps, walls }: EmblemSpec, cx = 0, cy = 0): Segment[] {
  const segs: Segment[] = [];
  rings.forEach((r, ri) => {
    const [edge, g0, g1] = gaps[ri];
    for (let k = 0; k < 5; k++) {
      const [x1, y1] = pentagonVertex(cx, cy, r, k);
      const [x2, y2] = pentagonVertex(cx, cy, r, k + 1);
      const at = (t: number): [number, number] => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
      if (k === edge) {
        segs.push([...at(0), ...at(g0)]);
        segs.push([...at(g1), ...at(1)]);
      } else {
        segs.push([x1, y1, x2, y2]);
      }
    }
  });
  walls.forEach(([ra, rb, edge, t]) => {
    const [ax1, ay1] = pentagonVertex(cx, cy, rings[ra], edge);
    const [ax2, ay2] = pentagonVertex(cx, cy, rings[ra], edge + 1);
    const [bx1, by1] = pentagonVertex(cx, cy, rings[rb], edge);
    const [bx2, by2] = pentagonVertex(cx, cy, rings[rb], edge + 1);
    segs.push([ax1 + (ax2 - ax1) * t, ay1 + (ay2 - ay1) * t, bx1 + (bx2 - bx1) * t, by1 + (by2 - by1) * t]);
  });
  return segs;
}

export const segmentsToPath = (segs: Segment[]) =>
  segs.map(([x1, y1, x2, y2]) => `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`).join("");

/** Four rings, as on the film's coin. Used by the 3D dial (unit coin, face radius 0.86). */
export const EMBLEM_FULL: EmblemSpec = {
  rings: [0.6, 0.48, 0.36, 0.24],
  gaps: [
    [0, 0.36, 0.62],
    [2, 0.32, 0.56],
    [4, 0.42, 0.66],
    [1, 0.34, 0.6],
  ],
  walls: [
    [0, 1, 1, 0.5],
    [1, 2, 3, 0.5],
    [2, 3, 0, 0.78],
  ],
};

/** Three rings for the seal at 64 px and up. */
export const EMBLEM_SEAL: EmblemSpec = {
  rings: [26, 19.4, 12.8],
  gaps: [
    [0, 0.34, 0.66],
    [2, 0.3, 0.6],
    [4, 0.36, 0.68],
  ],
  walls: [
    [0, 1, 1, 0.5],
    [1, 2, 3, 0.5],
  ],
};

/** Two rings for 16–48 px. */
export const EMBLEM_COMPACT: EmblemSpec = {
  rings: [24, 15.5],
  gaps: [
    [0, 0.32, 0.68],
    [3, 0.3, 0.7],
  ],
  walls: [[0, 1, 2, 0.5]],
};
