// Fails the build unless the version and its release notes move together:
//  - package.json "version" == the newest entry in src/data/releases.json
//  - versions are unique, strictly descending semver; dates YYYY-MM-DD, non-increasing
//  - every entry's notes guide.release.<id>.item1..item<items> exist and are
//    non-empty in all four locales, with no stray guide.release.* keys left over
// New versions are opened only with `npm run release -- patch|minor|major`.
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const pkg = read("package.json");
const releases = read("src/data/releases.json");
const LOCALES = ["en", "ko", "zh-CN", "zh-TW"];
const errors = [];

const sv = (v) => v.split(".").map(Number);
const cmp = (a, b) => { const x = sv(a), y = sv(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

if (!releases.length) errors.push("releases.json is empty");
else if (releases[0].version !== pkg.version)
  errors.push(`package.json version ${pkg.version} != newest release ${releases[0].version} — run \`npm run release\` instead of editing either by hand`);

const ids = new Set();
releases.forEach((r, i) => {
  if (!/^\d+\.\d+\.\d+$/.test(r.version)) errors.push(`bad version "${r.version}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) errors.push(`${r.version}: bad date "${r.date}"`);
  if (r.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) errors.push(`${r.version}: bad time "${r.time}"`);
  if (!(Number.isInteger(r.items) && r.items > 0)) errors.push(`${r.version}: items must be ≥ 1`);
  if (ids.has(r.id)) errors.push(`duplicate id ${r.id}`);
  ids.add(r.id);
  const next = releases[i + 1];
  if (next) {
    if (cmp(r.version, next.version) <= 0) errors.push(`${r.version} must be newer than ${next.version}`);
    if (r.date < next.date) errors.push(`${r.version} date ${r.date} is before ${next.version}'s ${next.date}`);
  }
});

for (const lang of LOCALES) {
  const loc = read(`public/locales/${lang}.json`);
  const expected = new Set();
  for (const r of releases)
    for (let i = 1; i <= r.items; i++) {
      const k = `guide.release.${r.id}.item${i}`;
      expected.add(k);
      if (typeof loc[k] !== "string" || !loc[k].trim()) errors.push(`${lang}: release note ${k} (v${r.version}) is missing or empty`);
    }
  for (const k of Object.keys(loc))
    if (/^guide\.release\.[^.]+\.item\d+$/.test(k) && !expected.has(k)) errors.push(`${lang}: stray release note ${k}`);
}

if (errors.length) {
  for (const e of errors) console.error("✗ " + e);
  console.error(`release: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`release: v${pkg.version} · ${releases.length} releases · notes complete in ${LOCALES.length} locales`);
