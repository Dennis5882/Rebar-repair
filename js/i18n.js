"use strict";

// ---------------------------------------------------------------------
// Lightweight i18n: locale files live in /locales/<code>.json.
// To add a new language, drop a new JSON file there (same keys as
// locales/ko.json) and add one entry to I18N_LANGS below.
// ---------------------------------------------------------------------
const I18N_LANGS = [
  { code: "en", name: "English" },
  { code: "ko", name: "한국어" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
];
const I18N_DEFAULT = "en";
const I18N_STORAGE_KEY = "rebar-ui-lang";

let currentLang = I18N_DEFAULT;
let dict = {};
const localeCache = {};

function detectFromBrowser() {
  const nav = (navigator.language || "").toLowerCase();
  const exact = I18N_LANGS.find((l) => l.code.toLowerCase() === nav);
  if (exact) return exact.code;
  if (nav.startsWith("zh")) {
    return /tw|hk|hant|mo/.test(nav) ? "zh-TW" : "zh-CN";
  }
  const prefix = I18N_LANGS.find((l) => nav.startsWith(l.code.toLowerCase() + "-"));
  return prefix ? prefix.code : I18N_DEFAULT;
}

// Vercel attaches geo-IP headers to deployed requests; /api/geo-lang reads
// those to suggest a language. Unavailable in local/static serving, so this
// fails fast and falls back to browser-language detection.
async function detectFromIp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch("/api/geo-lang", { signal: controller.signal });
    const data = await res.json();
    if (data && data.lang && I18N_LANGS.some((l) => l.code === data.lang)) return data.lang;
  } catch (e) {
    /* geo lookup unavailable — caller falls back to browser language */
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function detectInitialLang() {
  try {
    const saved = localStorage.getItem(I18N_STORAGE_KEY);
    if (saved && I18N_LANGS.some((l) => l.code === saved)) return saved;
  } catch (e) {
    /* localStorage unavailable (private mode etc.) */
  }
  const byIp = await detectFromIp();
  if (byIp) return byIp;
  return detectFromBrowser();
}

async function loadLocale(code) {
  if (localeCache[code]) return localeCache[code];
  const res = await fetch(`/locales/${code}.json`);
  const data = await res.json();
  localeCache[code] = data;
  return data;
}

function t(key, vars) {
  let s = dict[key];
  if (s === undefined) s = key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.split(`{${k}}`).join(vars[k] == null ? "" : vars[k]);
    }
  }
  return s;
}

function applyTranslations(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  document.title = t("app.title");
  const htmlLangMap = { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" };
  document.documentElement.lang = htmlLangMap[currentLang] || currentLang;
}

async function setLang(code) {
  currentLang = I18N_LANGS.some((l) => l.code === code) ? code : I18N_DEFAULT;
  dict = await loadLocale(currentLang);
  try {
    localStorage.setItem(I18N_STORAGE_KEY, currentLang);
  } catch (e) {
    /* ignore */
  }
  applyTranslations();
  const sel = document.getElementById("langSelect");
  if (sel && sel.value !== currentLang) sel.value = currentLang;
  document.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang: currentLang } }));
}

function buildLangSwitcher() {
  const sel = document.getElementById("langSelect");
  if (!sel) return;
  sel.innerHTML = I18N_LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join("");
  sel.value = currentLang;
  sel.addEventListener("change", () => setLang(sel.value));
}

const i18nReady = (async () => {
  currentLang = await detectInitialLang();
  buildLangSwitcher();
  await setLang(currentLang);
})();

window.I18N = {
  t,
  setLang,
  applyTranslations,
  ready: i18nReady,
  langs: I18N_LANGS,
  get lang() {
    return currentLang;
  },
};
