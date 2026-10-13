import { describe, it, expect } from "vitest";
import { judgeStrengthRatio, parseStoryStrength } from "../storyStrength";

// Live CAPACITY_IRREGULARITY rows (10-storey model, 2026-10-13).
const HEAD = ["Index", "Story", "Level", "Story Height", "Angle1", "Story Shear Strength1", "Upper Story Shear Strength1", "Story Shear Strength Ratio1", "Remark1", "Angle2", "Story Shear Strength2", "Upper Story Shear Strength2", "Story Shear Strength Ratio2", "Remark2"];
const ROWS = [
  ["1", "10F", "26.800", "2.900", "0.000", "12712.671", "0.000", "0.000", "-", "90.000", "12712.671", "0.000", "0.000", "-"],
  ["10", "1F", "0.000", "3.600", "0.000", "12384.392", "13773.678", "0.899", "Regular", "90.000", "12384.392", "13773.678", "0.899", "Regular"],
];

describe("parseStoryStrength", () => {
  it("reads both directions; the top storey has no ratio", () => {
    const r = parseStoryStrength(HEAD, ROWS);
    expect(r[0]).toMatchObject({ story: "10F", height: 2.9 });
    expect(r[0].dirs[0].ratio).toBeNull();
    expect(r[1].dirs[1]).toEqual({ angle: 90, strength: 12384.392, upper: 13773.678, ratio: 0.899, remark: "Regular" });
  });
  it("returns nothing for an unexpected table", () => {
    expect(parseStoryStrength(["X"], [["1"]])).toEqual([]);
  });
});

describe("judgeStrengthRatio (JGJ 3 3.5.3)", () => {
  it("A级: ≥0.80 ok, 0.65–0.80 weak storey, <0.65 ng", () => {
    expect([0.899, 0.8, 0.7, 0.65, 0.6].map((r) => judgeStrengthRatio(r, "A"))).toEqual(["ok", "ok", "warn", "warn", "ng"]);
  });
  it("B级: <0.75 ng; top storey ⇒ null", () => {
    expect(judgeStrengthRatio(0.74, "B")).toBe("ng");
    expect(judgeStrengthRatio(0.75, "B")).toBe("ok");
    expect(judgeStrengthRatio(null, "A")).toBeNull();
  });
});
