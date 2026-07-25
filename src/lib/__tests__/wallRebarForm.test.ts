import { describe, it, expect } from "vitest";
import { EMPTY_WALL_FORM, buildWallItem, fillWallForm, segmentLabel, type WallFormState } from "../wallRebarForm";
import type { WallItem } from "../../types/rebar";

function form(overrides: Partial<WallFormState> = {}): WallFormState {
  return { ...EMPTY_WALL_FORM, ...overrides };
}

describe("buildWallItem", () => {
  it("emits vertical/horizontal rebar + cover with numeric conversion", () => {
    const it = buildWallItem(form({ vName: "D16", vDist: "300", hName: "D13", hDist: "250", dw: "30", de: "40" }));
    expect(it.VERTICAL_REBAR).toEqual({ NAME: "D16", DIST: 300 });
    expect(it.HORIZONTAL_REBAR).toEqual({ NAME: "D13", DIST: 250 });
    expect(it.CONCRETE_FACE_TO_CENTER_OF_REBAR).toEqual({ DW: 30, DE: 40 });
  });

  it("attaches SUB_WALL_ID + STORY only when createSub is on", () => {
    expect(buildWallItem(form({ createSub: false, subId: "2", storyFrom: "1F", storyTo: "3F" })).SUB_WALL_ID).toBeUndefined();
    const withSub = buildWallItem(form({ createSub: true, subId: "2", storyFrom: "1F", storyTo: "3F" }));
    expect(withSub.SUB_WALL_ID).toBe(2);
    expect(withSub.STORY).toEqual({ FROM: "1F", TO: "3F" });
  });

  it("attaches END_REBAR only when useEnd is on", () => {
    expect(buildWallItem(form({ useEnd: false, endName: "D22", endNum: "4" })).END_REBAR).toBeUndefined();
    expect(buildWallItem(form({ useEnd: true, endName: "D22", endNum: "4", endDist: "150" })).END_REBAR).toEqual({
      NAME: "D22",
      NUM: 4,
      DIST: 150,
    });
  });

  it("writes THICKNESS only when useModelThk is off", () => {
    expect(buildWallItem(form({ useModelThk: true, thickness: "300" })).THICKNESS).toBeUndefined();
    expect(buildWallItem(form({ useModelThk: false, thickness: "300" })).THICKNESS).toBe(300);
  });

  it("includes BE rebar/length only when a BE name is given", () => {
    expect(buildWallItem(form({ beName: "" })).BE_HORIZONTAL_REBAR).toBeUndefined();
    const withBe = buildWallItem(form({ beName: "D13", beDist: "200", beLen: "600" }));
    expect(withBe.BE_HORIZONTAL_REBAR).toEqual({ NAME: "D13", DIST: 200 });
    expect(withBe.BOUNDARY_ELEMENT_LENGTH).toBe(600);
  });
});

describe("fillWallForm round-trip", () => {
  it("recovers the same form a wall item was built from (full sub-wall segment)", () => {
    const original = form({
      createSub: true,
      subId: "2",
      storyFrom: "1F",
      storyTo: "3F",
      vName: "D16",
      vDist: "300",
      hName: "D13",
      hDist: "250",
      useEnd: true,
      endName: "D22",
      endNum: "4",
      endDist: "150",
      beName: "D13",
      beDist: "200",
      beLen: "600",
      dw: "30",
      de: "40",
      useModelThk: false,
      thickness: "300",
    });
    expect(fillWallForm(buildWallItem(original))).toEqual(original);
  });

  it("treats a missing USE_MODEL_THICKNESS as 'use model thickness' (default true)", () => {
    expect(fillWallForm({} as WallItem).useModelThk).toBe(true);
    expect(fillWallForm({ USE_MODEL_THICKNESS: false }).useModelThk).toBe(false);
  });
});

describe("segmentLabel", () => {
  it("shows the 1-based index, sub-wall id, and story range when present", () => {
    expect(segmentLabel({ SUB_WALL_ID: 2, STORY: { FROM: "1F", TO: "3F" } }, 0)).toBe("#1 · ID 2 · 1F~3F");
  });
  it("shows just the index for a bare segment", () => {
    expect(segmentLabel({}, 1)).toBe("#2");
  });
});
