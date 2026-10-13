// Opens a new version: `npm run release -- patch|minor|major [--items N]`.
// Bumps package.json (+ package-lock.json), prepends the entry to
// src/data/releases.json (date = today KST), and inserts EMPTY note keys
// guide.release.<id>.item1..N into all four locales. The build stays red
// (i18n:check + release-check) until every note is written — the bump and its
// release notes always land in the same commit.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const level = process.argv[2];
const itemsArg = process.argv.indexOf("--items");
const items = itemsArg > 0 ? Number(process.argv[itemsArg + 1]) : 3;
if (!["patch", "minor", "major"].includes(level) || !(items >= 1)) {
  console.error("usage: npm run release -- patch|minor|major [--items N]");
  process.exit(1);
}

const pkgPath = new URL("package.json", root);
const pkgTxt = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgTxt);
let [ma, mi, pa] = pkg.version.split(".").map(Number);
if (level === "major") [ma, mi, pa] = [ma + 1, 0, 0];
else if (level === "minor") [mi, pa] = [mi + 1, 0];
else pa += 1;
const version = `${ma}.${mi}.${pa}`;
const id = "v" + version.replace(/\./g, "_");
const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const setVersion = (txt) => txt.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
writeFileSync(pkgPath, setVersion(pkgTxt));
const lockPath = new URL("package-lock.json", root);
try {
  // top-level "version" and packages[""].version — the first two occurrences
  let lock = readFileSync(lockPath, "utf8");
  lock = setVersion(lock);
  lock = lock.replace(/("packages":\s*\{\s*"":\s*\{[^}]*?"version":\s*")[^"]+(")/, `$1${version}$2`);
  writeFileSync(lockPath, lock);
} catch {}

const relPath = new URL("src/data/releases.json", root);
const rel = JSON.parse(readFileSync(relPath, "utf8"));
rel.unshift({ version, date: kst, id, items });
writeFileSync(relPath, "[\n" + rel.map((r) => "  " + JSON.stringify(r).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, "{ ").replace(/\}$/, " }")).join(",\n") + "\n]\n");

// Locale files use blank-line group separators — splice lines, never re-serialize.
for (const lang of ["en", "ko", "zh-CN", "zh-TW"]) {
  const p = new URL(`public/locales/${lang}.json`, root);
  const txt = readFileSync(p, "utf8");
  const eol = txt.includes("\r\n") ? "\r\n" : "\n";
  const lines = txt.split(eol);
  const at = lines.findIndex((l) => /^\s*"guide\.release\.[^"]+\.item\d+"/.test(l));
  if (at < 0) throw new Error(`${lang}: no guide.release.* anchor`);
  const add = Array.from({ length: items }, (_, i) => `  "guide.release.${id}.item${i + 1}": "",`);
  lines.splice(at, 0, ...add);
  writeFileSync(p, lines.join(eol));
}

console.log(`v${version} (${kst}) opened with ${items} empty note(s): guide.release.${id}.item1..${items}`);
console.log("Write them in en / ko / zh-CN / zh-TW — the build fails until every note is filled.");
