import { describe, it, expect } from "vitest";
import {
  buildBeamPayload,
  buildBeamSector,
  detectInputMode,
  emptySectors,
  fillFromPayload,
  sectorsEqual,
  type SectorFormValues,
} from "../beamRebarForm";
import type { BeamPayload, SectorKey } from "../../types/rebar";

function sector(overrides: Partial<SectorFormValues> = {}): SectorFormValues {
  return {
    topName: "",
    topNum: "",
    botName: "",
    botNum: "",
    shearName: "",
    shearLeg: "",
    shearDist: "",
    skinName: "",
    skinNum: "",
    ...overrides,
  };
}

function sectors(map: Partial<Record<SectorKey, SectorFormValues>>): Record<SectorKey, SectorFormValues> {
  const base = emptySectors();
  return { I: map.I ?? base.I, M: map.M ?? base.M, J: map.J ?? base.J };
}

describe("sectorsEqual", () => {
  it("is true for two independently-built empty sectors", () => {
    expect(sectorsEqual(sector(), sector())).toBe(true);
  });
  it("is false when any single field differs", () => {
    expect(sectorsEqual(sector({ topName: "D22" }), sector({ topName: "D25" }))).toBe(false);
  });
});

describe("detectInputMode", () => {
  it("returns 'all' when I, M and J are identical", () => {
    const s = sector({ topName: "D22", topNum: "3" });
    expect(detectInputMode(sectors({ I: s, M: s, J: s }))).toBe("all");
  });
  it("returns 'endCenter' when I equals J but M differs", () => {
    const end = sector({ topName: "D22", topNum: "3" });
    const mid = sector({ topName: "D22", topNum: "2" });
    expect(detectInputMode(sectors({ I: end, M: mid, J: end }))).toBe("endCenter");
  });
  it("returns 'each' when I and J differ", () => {
    expect(
      detectInputMode(sectors({ I: sector({ topNum: "3" }), M: sector(), J: sector({ topNum: "4" }) }))
    ).toBe("each");
  });
});

describe("buildBeamSector", () => {
  it("keeps a top layer whose count is exactly 0 (0 is a real value, not 'unset')", () => {
    const out = buildBeamSector(sector({ topName: "D22", topNum: "0" }));
    expect(out.MAIN_BAR_TOP).toEqual({ LAYER1: { NAME: "D22", NUM: 0 } });
  });
  it("drops a bar whose spec name is blank even if a count is present", () => {
    const out = buildBeamSector(sector({ topName: "", topNum: "3" }));
    expect(out.MAIN_BAR_TOP).toBeUndefined();
  });
  it("emits SHEAR_BAR only when a stirrup name is set, carrying leg/dist", () => {
    expect(buildBeamSector(sector({ shearName: "" })).SHEAR_BAR).toBeUndefined();
    expect(buildBeamSector(sector({ shearName: "D13", shearLeg: "2", shearDist: "150" })).SHEAR_BAR).toEqual({
      NAME: "D13",
      LEG: 2,
      DIST: 150,
    });
  });
});

describe("fillFromPayload <-> buildBeamPayload round-trip", () => {
  it("recovers the same form values a payload was built from", () => {
    const src = sectors({
      I: sector({ topName: "D22", topNum: "3", botName: "D22", botNum: "2", shearName: "D13", shearLeg: "2", shearDist: "150" }),
      M: sector({ topName: "D22", topNum: "2", botName: "D25", botNum: "3", shearName: "D13", shearLeg: "2", shearDist: "200" }),
      J: sector({ topName: "D22", topNum: "3", botName: "D22", botNum: "2", shearName: "D13", shearLeg: "2", shearDist: "150" }),
    });
    const payload = buildBeamPayload(src, "40", "40");
    const back = fillFromPayload(payload);
    expect(back.dt).toBe("40");
    expect(back.db).toBe("40");
    expect(back.sectors).toEqual(src);
  });

  it("reads only the first layer of a multi-layer MAIN_BAR_TOP object", () => {
    const payload: BeamPayload = {
      ITEMS: [
        {
          BAR_SECTOR_M: {
            MAIN_BAR_TOP: { LAYER1: { NAME: "D25", NUM: 4 }, LAYER2: { NAME: "D22", NUM: 2 } },
          },
        },
      ],
    };
    const { sectors: out } = fillFromPayload(payload);
    expect(out.M.topName).toBe("D25");
    expect(out.M.topNum).toBe("4");
  });

  it("yields all-empty sectors and blank covers for an empty payload", () => {
    const { sectors: out, dt, db } = fillFromPayload({ ITEMS: [] });
    expect(dt).toBe("");
    expect(db).toBe("");
    expect(out).toEqual(emptySectors());
  });
});
