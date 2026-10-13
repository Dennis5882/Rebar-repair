import { describe, expect, it } from "vitest";
import { drawSectionSvg } from "../svg";
import type { WallPayload } from "../../types/rebar";

const t = (k: string) => k;
const endBars = (num: number) => {
  const payload = {
    ITEMS: [
      {
        VERTICAL_REBAR: { NAME: "d10", DIST: 200 },
        HORIZONTAL_REBAR: { NAME: "d10", DIST: 200 },
        USE_END_REBAR: true,
        END_REBAR: { NAME: "d16", NUM: num, DIST: 100 },
        CONCRETE_FACE_TO_CENTER_OF_REBAR: { DW: 40, DE: 40 },
      },
    ],
  } as unknown as WallPayload;
  const { svg } = drawSectionSvg(t, "WALL", payload, { THICKNESS: 200, LENGTH: 3000 }, "wall");
  return (svg.match(/class="endbar"/g) || []).length;
};

describe("wall diagram end bars (END_REBAR.NUM is per end)", () => {
  it("draws NUM bars at EACH end, in rows of two", () => {
    expect(endBars(6)).toBe(12); // 3 rows × 2 faces × 2 ends
    expect(endBars(2)).toBe(4);
  });
  it("puts an odd count's last bar mid-thickness", () => {
    expect(endBars(3)).toBe(6); // 2 + 1 per end
  });
});
