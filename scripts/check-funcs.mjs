// Counts the Serverless Functions in the last `vercel build` output.
// Hobby caps a deployment at 12, and going over fails SILENTLY at
// "Deploying outputs" after a green build (prod freezes at the last good
// deploy). Fails at 12 too, keeping one slot of headroom. Run via
// `npm run check:funcs` after any api/ or server/ change.
import { readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".vercel/output/functions";
const CEILING = 11;

function findFuncs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.name.endsWith(".func")) return [p];
    return e.isDirectory() ? findFuncs(p) : [];
  });
}

const funcs = findFuncs(ROOT);
for (const f of funcs) console.log("  " + f);
console.log(`${funcs.length} functions (ceiling ${CEILING}, Hobby cap 12)`);
if (funcs.length > CEILING) process.exit(1);
