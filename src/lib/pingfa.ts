import type { SectorKey } from "../types/rebar";
import type { SectorFormValues } from "./beamRebarForm";

// 平法 (22G101-1) notation for GB models — how Chinese engineers read and draw
// rebar. Pure string builders over the boards' own form values (lengths in mm).
// Shown only when the design code is GB; KDS/TWN boards are unaffected.
//
// Bar grade is written with the plain-text letter convention used in Chinese
// software output (the drawing glyphs Φ-with-strokes have no Unicode code
// point): HPB300 → A, HRB335 → B, HRB400 → C, HRB500 → D. Taken from the
// board's fy (main bars) / fyt (stirrups), i.e. the GB characteristic fyk.

export type DiaOf = (label: string) => number | null;

export function gbGradeLetter(fyk: number): string | null {
  if (fyk === 300) return "A";
  if (fyk === 335) return "B";
  if (fyk === 400) return "C";
  if (fyk === 500) return "D";
  return null;
}

const int = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== "" && Number.isInteger(n) && n > 0 ? n : null;
};
const round = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

// "3C20" — null when count or bar is missing/unknown.
function bars(count: string, label: string, grade: string, dia: DiaOf): string | null {
  const n = int(count);
  const d = label ? dia(label) : null;
  return n && d ? `${n}${grade}${round(d)}` : null;
}

// One stirrup zone, or null when its bar/spacing is missing.
interface Zone {
  d: number;
  s: number;
  legs: number | null;
}
function zone(sec: SectorFormValues, dia: DiaOf): Zone | null {
  const d = sec.shearName ? dia(sec.shearName) : null;
  const sp = Number(sec.shearDist);
  return d && sp > 0 ? { d, s: sp, legs: int(sec.shearLeg) } : null;
}
const legsTxt = (n: number | null) => (n ? `(${n})` : "");

// 加密区/非加密区 stirrups per 22G101-1: "C8@100/200(2)" when only the spacing
// differs, "C8@100(4)/200(2)" when the leg count differs too, and
// "C10@100(4)/C8@200(2)" when the bar differs. One zone gives "C8@150(2)".
function stirrupText(dense: Zone, mid: Zone | null, g: string): string {
  const dz = `${g}${round(dense.d)}`;
  if (!mid || (mid.d === dense.d && mid.s === dense.s && mid.legs === dense.legs)) return `${dz}@${round(dense.s)}${legsTxt(dense.legs)}`;
  if (mid.d === dense.d && mid.legs === dense.legs) return `${dz}@${round(dense.s)}/${round(mid.s)}${legsTxt(dense.legs)}`;
  if (mid.d === dense.d) return `${dz}@${round(dense.s)}${legsTxt(dense.legs)}/${round(mid.s)}${legsTxt(mid.legs)}`;
  return `${dz}@${round(dense.s)}${legsTxt(dense.legs)}/${g}${round(mid.d)}@${round(mid.s)}${legsTxt(mid.legs)}`;
}

export interface BeamPingfa {
  // 集中标注: section, stirrup, longitudinal ("上部通长筋;下部通长筋").
  section: string; // "300×600"
  stirrup: string | null;
  longitudinal: string | null;
  // 原位标注 — only where a station differs from the 集中 values.
  inSitu: { at: "I" | "J" | "M"; face: "top" | "bot"; text: string }[];
}

// Beam: the mid-span (M) top bars are the 上部通长筋; bottom bars go into the
// 集中 line only when identical at I/M/J. Otherwise the bottom bars become 原位
// labels: mid-span always, and an end only where it differs from mid-span.
// End-top bars that differ from the through bars are 原位 support labels.
// Stirrups: the tighter valid end (I/J, 加密区) / mid-span (非加密区).
export function beamPingfa(
  sectors: Record<SectorKey, SectorFormValues>,
  b_mm: number,
  h_mm: number,
  fy: number,
  fyt: number,
  dia: DiaOf
): BeamPingfa | null {
  const g = gbGradeLetter(fy);
  const gv = gbGradeLetter(fyt);
  if (!g || !gv) return null;
  const { I, M, J } = sectors;
  const top = (s: SectorFormValues) => bars(s.topNum, s.topName, g, dia);
  const bot = (s: SectorFormValues) => bars(s.botNum, s.botName, g, dia);

  const through = top(M);
  const mBot = bot(M);
  const botAll = mBot && bot(I) === mBot && bot(J) === mBot ? mBot : null;
  const longitudinal = through ? (botAll ? `${through};${botAll}` : through) : botAll ? `;${botAll}` : null;

  const inSitu: BeamPingfa["inSitu"] = [];
  for (const [at, s] of [["I", I], ["J", J]] as const) {
    const t = top(s);
    if (t && t !== through) inSitu.push({ at, face: "top", text: t });
  }
  if (!botAll) {
    if (mBot) inSitu.push({ at: "M", face: "bot", text: mBot });
    for (const [at, s] of [["I", I], ["J", J]] as const) {
      const b = bot(s);
      if (b && b !== mBot) inSitu.push({ at, face: "bot", text: b });
    }
  }

  const ends = [zone(I, dia), zone(J, dia)].filter((z): z is Zone => !!z).sort((a, b) => a.s - b.s);
  const mid = zone(M, dia);
  const dense = ends[0] ?? mid;
  return {
    section: `${round(b_mm)}×${round(h_mm)}`,
    stirrup: dense ? stirrupText(dense, ends.length ? mid : null, gv) : null,
    longitudinal,
    inSitu,
  };
}

// One-line summary for a board cell: "C8@100/200(2)  2C20;3C20".
export function beamPingfaLine(p: BeamPingfa): string {
  return [p.stirrup, p.longitudinal].filter(Boolean).join("  ");
}
