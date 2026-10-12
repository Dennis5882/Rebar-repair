import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the Vercel Hobby function budget without needing `vercel build`.
// Every non-underscore file under api/ (subdirs included) compiles into its
// own Serverless Function; Hobby caps a deploy at 12 and going over fails
// silently at "Deploying outputs". Shared helpers belong in server/ (traced
// into each importer, costs no slot). `npm run check:funcs` verifies the
// real build output; this catches the layout mistakes on every `npm test`.
const API_DIR = join(__dirname, "../../../api");
const CEILING = 11; // keep one slot of headroom under the cap of 12

const entries = readdirSync(API_DIR, { withFileTypes: true }).filter((e) => !e.name.startsWith("_"));
const routeFiles = entries.filter((e) => e.isFile() && /\.(ts|js|mjs)$/.test(e.name));

describe("api/ layout (Vercel function budget)", () => {
  it("has no subdirectories (each file in one would cost a function slot)", () => {
    expect(entries.filter((e) => e.isDirectory()).map((e) => e.name)).toEqual([]);
  });

  it("contains only route handlers (default export), no shared helpers", () => {
    const helpers = routeFiles
      .filter((e) => !/export\s+default\s/.test(readFileSync(join(API_DIR, e.name), "utf8")))
      .map((e) => e.name);
    expect(helpers).toEqual([]);
  });

  it(`stays within ${CEILING} route functions`, () => {
    expect(routeFiles.length).toBeLessThanOrEqual(CEILING);
  });
});
