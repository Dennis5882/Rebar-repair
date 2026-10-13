// 楼层受剪承载力比 (weak storey) from Gen NX's own story table
// /post/TABLE CAPACITY_IRREGULARITY — Gen NX sums each storey's shear strength
// per direction (Angle1 / Angle1+90°) and divides by the storey above (live
// 2026-10-13, 10-storey model: "Story Shear Strength Ratio1" 0.899 at 1F). We
// re-judge the ratio against the Chinese limits:
//   JGJ 3-2010 3.5.3 A级: ≥ 0.80 (宜), ≥ 0.65 (不应小于); B级: ≥ 0.75 (不应)
//   GB 50011 表3.4.3-2 / 3.4.4-2: < 0.80 ⇒ 承载力突变 (irregular), ≥ 0.65
// Pure — imported by api/project-summary.ts (with .js) and unit-tested.

export interface StrengthDir {
  angle: number;
  strength: number; // kN
  upper: number; // kN, 0 at the top storey
  ratio: number | null; // null at the top storey
  remark: string; // Gen NX's own verdict ("Regular" / …)
}
export interface StoryStrengthRow {
  story: string;
  level: number; // model unit (requested in m)
  height: number;
  dirs: [StrengthDir, StrengthDir];
}

export function parseStoryStrength(head: string[], rows: string[][]): StoryStrengthRow[] {
  const i = (c: string) => head.indexOf(c);
  const num = (r: string[], c: string) => {
    const v = Number(r[i(c)]);
    return Number.isFinite(v) ? v : 0;
  };
  const dir = (r: string[], n: 1 | 2): StrengthDir => {
    const upper = num(r, `Upper Story Shear Strength${n}`);
    return {
      angle: num(r, `Angle${n}`),
      strength: num(r, `Story Shear Strength${n}`),
      upper,
      ratio: upper > 0 ? num(r, `Story Shear Strength Ratio${n}`) : null,
      remark: String(r[i(`Remark${n}`)] ?? "").trim(),
    };
  };
  if (i("Story") < 0 || i("Story Shear Strength1") < 0) return [];
  return rows.map((r) => ({ story: String(r[i("Story")]), level: num(r, "Level"), height: num(r, "Story Height"), dirs: [dir(r, 1), dir(r, 2)] }));
}

export type StrengthClass = "A" | "B"; // JGJ 3 A级 / B级 高度
export type StrengthVerdict = "ok" | "warn" | "ng";

/** ok ≥ 0.80 (A) / ≥ 0.75 (B); warn = A级 0.65–0.80 (薄弱层, 宜 not met); ng below the hard floor. */
export function judgeStrengthRatio(ratio: number | null, cls: StrengthClass): StrengthVerdict | null {
  if (ratio == null) return null;
  if (cls === "B") return ratio >= 0.75 - 1e-9 ? "ok" : "ng";
  if (ratio >= 0.8 - 1e-9) return "ok";
  return ratio >= 0.65 - 1e-9 ? "warn" : "ng";
}
