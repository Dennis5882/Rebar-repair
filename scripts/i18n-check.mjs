/* ════════════════════════════════════════════════════════════
   i18n check — `npm run i18n:check` (runs automatically before build)
   Modelled on the sibling `story` project's scripts/i18n-check.mjs, adapted
   to this repo's four flat JSON dictionaries in public/locales/.

   Errors (exit 1):
   - key parity: every locale must have exactly the same keys
   - empty value
   - placeholder mismatch: {name} tokens must match en
   - a static t("key") in src/ that en.json doesn't have (would render the raw key)
   - Hangul inside an en / zh-CN / zh-TW value (copy-paste left untranslated)
   - zh-CN using a Taiwan-only term, or zh-TW using a mainland term
     (CN and TW are opposite for several core terms — see CLAUDE.md i18n rules)
   Warnings:
   - a ko/zh value identical to en (may be untranslated; Gen NX UI names are fine)
   - the Taiwan glossary (sibling MIDAS-GEN-NX-UI-Local) isn't on this machine,
     so its 34 mainland→Taiwan pairs were skipped (always the case on Vercel)
════════════════════════════════════════════════════════════ */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = ["en", "ko", "zh-CN", "zh-TW"];
const FALLBACK = "en";
const errors = [];
const warns = [];

const dict = {};
for (const l of LANGS) dict[l] = JSON.parse(readFileSync(join(root, "public/locales", `${l}.json`), "utf8"));
const base = dict[FALLBACK];

// ── parity / empty / placeholders ───────────────────────────────────────────
const allKeys = new Set(LANGS.flatMap((l) => Object.keys(dict[l])));
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const k of allKeys) {
  for (const l of LANGS) {
    if (!(k in dict[l])) { errors.push(`${l}: missing key "${k}"`); continue; }
    if (String(dict[l][k]).trim() === "") errors.push(`${l}.${k}: empty value`);
    if (l !== FALLBACK && k in base && placeholders(dict[l][k]) !== placeholders(base[k]))
      errors.push(`${l}.${k}: placeholders {${placeholders(dict[l][k])}} ≠ en {${placeholders(base[k])}}`);
  }
}

// ── static t("key") usages must exist ───────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__") walk(p, out); }
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
for (const file of walk(join(root, "src"))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bt\(\s*"([^"]+)"/g))
    if (!(m[1] in base)) errors.push(`${file.slice(root.length + 1)}: t("${m[1]}") not in en.json (would render the raw key)`);
}

// ── untranslated copy-paste ─────────────────────────────────────────────────
const HANGUL = /[가-힣]/;
for (const l of ["en", "zh-CN", "zh-TW"])
  for (const [k, v] of Object.entries(dict[l]))
    if (HANGUL.test(v) && !/byline|footer/i.test(k)) errors.push(`${l}.${k}: contains Hangul — untranslated?`);
for (const l of ["ko", "zh-CN", "zh-TW"])
  for (const [k, v] of Object.entries(dict[l]))
    if (v === base[k] && /[a-z]{4,}\s+[a-z]{3,}/i.test(v)) warns.push(`${l}.${k}: same as en ("${v}")`);

// ── CN ↔ TW terminology ─────────────────────────────────────────────────────
// Taiwan-only terms (simplified spelling) a zh-CN string must not use. Built
// from the mainland→Taiwan glossary pairs, minus the ones mainland Chinese
// also uses (规范, 开启, 目前, 配置, 单元, 折减系数…).
const TW_ONLY_IN_CN = {
  "载重": "荷载", "断面": "截面", "资讯": "信息", "使用者": "用户", "座标": "坐标", "预设": "默认",
  "软体": "软件", "硬体": "硬件", "伺服器": "服务器", "介面": "接口/界面", "影片": "视频", "耐震": "抗震",
  "不支援": "不支持", "细长比": "长细比", "跨距": "跨度", "劲度": "刚度", "挫屈": "屈曲", "降伏": "屈服",
  "叠代": "迭代", "潜变": "徐变", "检核": "验算", "档案": "文件", "对话方块": "对话框",
};
for (const [k, v] of Object.entries(dict["zh-CN"]))
  for (const [tw, cn] of Object.entries(TW_ONLY_IN_CN))
    if (v.includes(tw)) errors.push(`zh-CN.${k}: Taiwan term "${tw}" — mainland uses "${cn}"`);

const GLOSSARY = resolve(root, "../MIDAS-GEN-NX-UI-Local/glossary/glossary.json");
if (existsSync(GLOSSARY)) {
  const pairs = JSON.parse(readFileSync(GLOSSARY, "utf8")).mainland_to_taiwan ?? [];
  for (const p of pairs) {
    // Entries like "標準 (for Code)" / "打開/開放" carry a usage note or alternatives.
    const terms = String(p.mainland_term).replace(/\s*\(.*\)$/, "").split("/");
    for (const [k, v] of Object.entries(dict["zh-TW"]))
      for (const term of terms)
        if (term && v.includes(term) && !v.includes(p.taiwan_term) && !/\(for /.test(p.mainland_term))
          errors.push(`zh-TW.${k}: mainland term "${term}" — Taiwan uses "${p.taiwan_term}" (glossary)`);
  }
} else {
  warns.push("Taiwan glossary not found (../MIDAS-GEN-NX-UI-Local) — zh-TW mainland-term check skipped");
}

warns.forEach((w) => console.warn("⚠ " + w));
errors.forEach((e) => console.error("✗ " + e));
console.log(`i18n: ${LANGS.join(", ")} · ${allKeys.size} keys · errors ${errors.length} · warnings ${warns.length}`);
process.exit(errors.length ? 1 : 0);
