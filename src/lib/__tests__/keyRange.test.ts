import { describe, it, expect } from "vitest";
import { compressKeyRanges } from "../keyRange";

describe("compressKeyRanges", () => {
  it("collapses a run of 3+ consecutive ids into Gen NX 'AtoB' notation", () => {
    expect(compressKeyRanges(["181", "182", "183", "184", "185"])).toBe("181to185");
  });

  it("lists runs of 1 or 2 individually (below the 3-in-a-row threshold)", () => {
    expect(compressKeyRanges(["174", "175"])).toBe("174 175");
    expect(compressKeyRanges(["10"])).toBe("10");
  });

  it("mixes singles, pairs and ranges the way Gen NX shows a selection", () => {
    expect(
      compressKeyRanges(["174", "175", "181", "182", "183", "184", "185", "204", "205", "206", "1133"])
    ).toBe("174 175 181to185 204to206 1133");
  });

  it("sorts and de-duplicates unordered input before grouping", () => {
    expect(compressKeyRanges(["3", "1", "2", "2", "5", "4"])).toBe("1to5");
  });

  it("keeps two-length runs split even when adjacent to a longer run", () => {
    // 1,2 is a pair (listed), 4,5,6 is a run (collapsed)
    expect(compressKeyRanges(["1", "2", "4", "5", "6"])).toBe("1 2 4to6");
  });

  it("passes non-integer keys through, appended after the numeric ranges", () => {
    expect(compressKeyRanges(["1", "2", "3", "elem:x"])).toBe("1to3 elem:x");
  });

  it("returns an empty string for no keys", () => {
    expect(compressKeyRanges([])).toBe("");
  });
});
