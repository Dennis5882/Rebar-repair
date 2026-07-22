export type LangCode = "en" | "ko" | "zh-CN" | "zh-TW";

export interface LangInfo {
  code: LangCode;
  name: string;
}

export type Dict = Record<string, string>;
export type TVars = Record<string, string | number | undefined>;
export type TFn = (key: string, vars?: TVars) => string;

// To add a language: drop public/locales/<code>.json (same keys as
// public/locales/ko.json) and add one entry here.
export const LANGS: LangInfo[] = [
  { code: "en", name: "English" },
  { code: "ko", name: "한국어" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
];

export const DEFAULT_LANG: LangCode = "en";
export const STORAGE_KEY = "rebar-ui-lang";
