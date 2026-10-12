import { describe, expect, it } from "vitest";
import { defaultMaterialDB, defaultRebarCode, getBars, isVerified } from "../../data/rcCodePresets";

// GB bar labels were live-verified against a GB/T50010-10 Gen NX model
// (2026-10-12): REBB accepts exactly these lowercase-"d" names and rejects
// "D20"/"Φ20"/"Ø20" with 200 {"error":"Wrong Field"}. Pin them so the list
// can't drift back to an unverified notation.
const GB_LIVE_ACCEPTED = ["d4", "d5", "d6", "d8", "d10", "d12", "d14", "d16", "d18", "d20", "d22", "d25", "d28", "d32", "d36", "d40"];

describe("GB/T 1499.2 rebar presets", () => {
  it("both GB design codes map to the GB/T 1499.2 material DB", () => {
    expect(defaultMaterialDB("GB/T50010-10")).toBe("GB/T 1499.2");
    expect(defaultMaterialDB("GB50010-02")).toBe("GB/T 1499.2");
  });

  it("uses the exact lowercase-d labels Gen NX accepted", () => {
    expect(getBars("GB/T 1499.2").map((b) => b.label)).toEqual(GB_LIVE_ACCEPTED);
  });

  it("nominal diameter matches the number in the label", () => {
    for (const b of getBars("GB/T 1499.2")) expect(b.nominal_mm).toBe(Number(b.label.slice(1)));
  });

  it("defaults to the rebar code Gen NX itself defaults to, and is marked verified", () => {
    expect(defaultRebarCode("GB/T50010-10")).toBe("GB/T10(RC)");
    expect(isVerified("GB/T 1499.2")).toBe(true);
  });
});
