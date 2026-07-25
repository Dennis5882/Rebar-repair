import { describe, it, expect } from "vitest";
import { lenToMm, lenToModel, mmPerUnit, numToMm, numToModel } from "../units";

describe("mmPerUnit", () => {
  it("knows the standard MIDAS length units", () => {
    expect(mmPerUnit("mm")).toBe(1);
    expect(mmPerUnit("cm")).toBe(10);
    expect(mmPerUnit("m")).toBe(1000);
    expect(mmPerUnit("in")).toBeCloseTo(25.4, 5);
    expect(mmPerUnit("ft")).toBeCloseTo(304.8, 5);
  });
  it("falls back to 1 (treat as mm) for an unknown unit", () => {
    expect(mmPerUnit("")).toBe(1);
    expect(mmPerUnit("furlong")).toBe(1);
  });
});

describe("lenToMm (model-unit string -> mm string)", () => {
  it("scales by the unit and trims float noise to 2 decimals", () => {
    expect(lenToMm("0.1", "m")).toBe("100");
    expect(lenToMm("0.0635", "m")).toBe("63.5"); // 63.5 mm cover in a metre model
    expect(lenToMm("100", "mm")).toBe("100");
  });
  it("keeps blank blank and rejects non-numeric", () => {
    expect(lenToMm("", "m")).toBe("");
    expect(lenToMm("   ", "m")).toBe("");
    expect(lenToMm("abc", "m")).toBe("");
  });
});

describe("lenToModel (mm string -> model-unit string)", () => {
  it("is the inverse scale of lenToMm", () => {
    expect(lenToModel("100", "m")).toBe("0.1");
    expect(lenToModel("150", "mm")).toBe("150");
  });
  it("keeps blank blank", () => {
    expect(lenToModel("", "ft")).toBe("");
  });
});

describe("round-trip", () => {
  it("lenToModel(lenToMm(x)) recovers the original model value", () => {
    for (const unit of ["mm", "cm", "m", "in", "ft"]) {
      const back = Number(lenToModel(lenToMm("0.25", unit), unit));
      expect(back).toBeCloseTo(0.25, 6);
    }
  });
});

describe("numToMm / numToModel (payload numbers)", () => {
  it("converts a numeric length both ways", () => {
    expect(numToMm(0.04, "m")).toBeCloseTo(40, 6);
    expect(numToModel(40, "m")).toBeCloseTo(0.04, 6);
  });
  it("passes undefined and non-finite through unchanged", () => {
    expect(numToMm(undefined, "m")).toBeUndefined();
    expect(numToModel(undefined, "m")).toBeUndefined();
    expect(numToMm(NaN, "m")).toBeNaN();
  });
});
