// Nominal flexural strength Mn of a rectangular RC column at a given axial force
// — strain compatibility with the ACI/Taiwan stress block (εcu = 0.003, β1 from
// 22.2.2.4.3, bars elastic-perfectly-plastic, displaced concrete subtracted).
// Used only for the strong-column / weak-beam ratio (18.4.3.2), which compares
// NOMINAL strengths. Bars are assumed evenly distributed around the perimeter
// at the Gen NX "DO" offset — the REBC bar layout (ROW) is not read, so this is
// an approximation (±10–15 % vs a real layout) and reported as such.
//
// Units: mm, MPa, kN, kN·m. Compression is positive.

const Es = 200000;

export interface ColumnMnInput {
  b: number;
  h: number;
  cover: number; // face → bar centre
  nBars: number;
  barArea: number; // mm² per bar
  fck: number;
  fy: number;
}

function beta1(fck: number): number {
  if (fck <= 28) return 0.85;
  if (fck >= 56) return 0.65;
  return 0.85 - (0.05 * (fck - 28)) / 7;
}

/** Bar y-coordinates (distance from the compression face), bending about the axis whose depth is `depth`. */
function barDepths(width: number, depth: number, cover: number, n: number): number[] {
  if (n <= 0) return [];
  if (n <= 4) {
    // 2 on each face as far as n allows
    const ys = [cover, depth - cover, cover, depth - cover];
    return ys.slice(0, n);
  }
  const perim = 2 * (width + depth);
  // extra (non-corner) bars per side proportional to side length
  const extra = n - 4;
  let nW = Math.round((extra * width) / perim) ; // per each of the 2 faces parallel to width
  let nD = Math.round((extra * depth) / perim); // per each of the 2 faces parallel to depth
  while (2 * nW + 2 * nD > extra) {
    if (nW >= nD && nW > 0) nW--;
    else if (nD > 0) nD--;
    else break;
  }
  const ys: number[] = [];
  // top & bottom faces: corners + nW each
  for (let i = 0; i < 2 + nW; i++) ys.push(cover);
  for (let i = 0; i < 2 + nW; i++) ys.push(depth - cover);
  // side faces: nD bars each, evenly between the corners
  for (let side = 0; side < 2; side++) {
    for (let i = 1; i <= nD; i++) ys.push(cover + ((depth - 2 * cover) * i) / (nD + 1));
  }
  // any remainder (rounding) goes on the compression-side face row
  while (ys.length < n) ys.push(cover);
  return ys.slice(0, n);
}

function mnAbout(width: number, depth: number, inp: ColumnMnInput, P: number): number {
  const ys = barDepths(width, depth, inp.cover, inp.nBars);
  const b1 = beta1(inp.fck);
  const res = (c: number) => {
    const a = Math.min(b1 * c, depth);
    let F = 0.85 * inp.fck * a * width; // N, concrete
    let M = F * (depth / 2 - a / 2);
    for (const y of ys) {
      const eps = (0.003 * (c - y)) / c;
      let fs = Math.max(-inp.fy, Math.min(inp.fy, eps * Es));
      if (y < a) fs -= 0.85 * inp.fck; // displaced concrete
      const f = fs * inp.barArea;
      F += f;
      M += f * (depth / 2 - y);
    }
    return { F: F / 1000, M: M / 1e6 };
  };
  let lo = 1e-3 * depth;
  let hi = 60 * depth;
  if (res(lo).F > P) return 0; // below the pure-tension capacity
  if (res(hi).F < P) return 0; // above the pure-compression capacity
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (res(mid).F < P) lo = mid;
    else hi = mid;
  }
  return Math.max(res((lo + hi) / 2).M, 0);
}

/** Nominal Mn (kN·m): the smaller of the two principal-axis values. */
export function columnMn(inp: ColumnMnInput, P: number): number {
  if (!(inp.b > 0 && inp.h > 0 && inp.fck > 0 && inp.fy > 0 && inp.nBars > 0 && inp.barArea > 0)) return 0;
  return Math.min(mnAbout(inp.b, inp.h, inp, P), mnAbout(inp.h, inp.b, inp, P));
}
