/**
 * rcCodePresets.ts
 * 배근수정 UI — 2계층 코드 프리셋
 *
 *   [최상위]  DESIGN_CODES  : Gen NX "RC Design" 드롭다운 라벨 그대로가 키(선택자)
 *                             -> 각 항목이 기본 materialDB 를 참조
 *   [하위]    MATERIAL_DBS  : 철근 재료규격별 규격목록·강종·표기계
 *
 * 기본 동작
 *   designCode 선택  ->  DESIGN_CODES[designCode].materialDB 로 재료 DB 자동 세팅
 *                    ->  MATERIAL_DBS[...].bars 로 규격 드롭다운 채움
 * 오버라이드
 *   사용자가 재료 DB / 강종을 수동 지정하면 그 값 우선. designCode 재선택 시
 *   기본값으로 되돌릴지 확인하거나 "비표준 조합" 표시를 권장.
 *
 * 주의
 *   - materialDB 매핑은 "합리적 기본값"이며 강제 종속이 아님(예: ACI 설계 + KS 철근 가능).
 *   - Mexico/Philippines/Colombia 등은 재료규격 매핑에 지역 편차가 있어 confirm 플래그 표기.
 *   - 강종·상단 규격은 표준 개정판에 따라 다를 수 있으니 현행판 확인 권장.
 *
 * 전송 계약 (Modify Beam/Column/Brace/Wall Rebar Data 화면 확인 완료)
 *   - 규격은 "D19" 같은 문자열 라벨로 전송한다 → bars[].label 을 그대로 사용.
 *   - nominal_mm 는 다이어그램 미리보기 전용(참고). 규격 전송에는 쓰지 않음.
 *   - toModelDiameter()는 미리보기 치수 계산용 보조 함수일 뿐, 규격값 전송 경로 아님.
 */

export interface RebarSize {
  label: string;
  nominal_mm: number;
  nominal_in?: number;
  xref?: string;
}

export interface MaterialDbEntry {
  label: string;
  system: string;
  unit: string;
  // Gen NX Rebar Selection > Code 실제 라벨 (첫 항목 = 기본/최신판)
  dbName: string[];
  // grades 는 Main/Sub 두 슬롯이 공유하는 단일 목록 (UI에서 gradeMain/gradeSub로 분리)
  grades: string[];
  bars: RebarSize[];
}

export interface DesignCodeEntry {
  country: string;
  materialDB: string;
  // confirm:true 는 지역 편차로 재확인 권장.
  confirm?: boolean;
  // rebarCode: MATERIAL_DBS 기본 dbName 대신 보낼 로컬 라벨(확인된 값)
  rebarCode?: string;
}

// ── 하위: 재료 DB ────────────────────────────────────────────────────────────
export const MATERIAL_DBS: Record<string, MaterialDbEntry> = {
  "KS D 3504": {
    label: "KS D 3504 (한국)", system: "D", unit: "mm",
    // "KS19(RC)" (dbName[0]) live-confirmed against real Gen NX Rebar
    // Selection > Code data 2026-07-23 — see [[genxn-api-schema-findings]].
    dbName: ["KS19(RC)", "KS01(RC)", "KS(RC)"],
    grades: ["SD300", "SD400", "SD500", "SD600", "SD700", "SD400S", "SD500S", "SD600S"],
    bars: [
      { label: "D10", nominal_mm: 9.53 }, { label: "D13", nominal_mm: 12.7 },
      { label: "D16", nominal_mm: 15.9 }, { label: "D19", nominal_mm: 19.1 },
      { label: "D22", nominal_mm: 22.2 }, { label: "D25", nominal_mm: 25.4 },
      { label: "D29", nominal_mm: 28.6 }, { label: "D32", nominal_mm: 31.8 },
      { label: "D35", nominal_mm: 34.9 }, { label: "D38", nominal_mm: 38.1 },
      { label: "D41", nominal_mm: 41.3 }, { label: "D51", nominal_mm: 50.8 },
    ],
  },

  "ASTM A615/A706": {
    label: "ASTM A615/A706 (미국, imperial)", system: "#", unit: "inch",
    // "ASTM19(RC)" (dbName[0]) live-confirmed against real Gen NX data —
    // see the KS D 3504 entry's note above.
    dbName: ["ASTM19(RC)", "ASTM(RC)", "U.S.C(US)(RC)"],
    grades: ["Grade 40", "Grade 60", "Grade 80", "Grade 100"],
    bars: [
      { label: "#3", nominal_mm: 9.5, nominal_in: 0.375 }, { label: "#4", nominal_mm: 12.7, nominal_in: 0.5 },
      { label: "#5", nominal_mm: 15.9, nominal_in: 0.625 }, { label: "#6", nominal_mm: 19.1, nominal_in: 0.75 },
      { label: "#7", nominal_mm: 22.2, nominal_in: 0.875 }, { label: "#8", nominal_mm: 25.4, nominal_in: 1.0 },
      { label: "#9", nominal_mm: 28.7, nominal_in: 1.128 }, { label: "#10", nominal_mm: 32.3, nominal_in: 1.27 },
      { label: "#11", nominal_mm: 35.8, nominal_in: 1.41 }, { label: "#14", nominal_mm: 43.0, nominal_in: 1.693 },
      { label: "#18", nominal_mm: 57.3, nominal_in: 2.257 },
    ],
  },

  "ASTM A615M/A706M": {
    label: "ASTM A615M/A706M (미국, soft-metric)", system: "#M", unit: "mm",
    dbName: ["U.S.C(SI)(RC)"],
    grades: ["Gr280", "Gr420", "Gr520", "Gr550"],
    bars: [
      { label: "#10M", nominal_mm: 9.5 }, { label: "#13M", nominal_mm: 12.7 },
      { label: "#16M", nominal_mm: 15.9 }, { label: "#19M", nominal_mm: 19.1 },
      { label: "#22M", nominal_mm: 22.2 }, { label: "#25M", nominal_mm: 25.4 },
      { label: "#29M", nominal_mm: 28.7 }, { label: "#32M", nominal_mm: 32.3 },
      { label: "#36M", nominal_mm: 35.8 }, { label: "#43M", nominal_mm: 43.0 },
      { label: "#57M", nominal_mm: 57.3 },
    ],
  },

  "CNS 560": {
    label: "CNS 560 (대만)", system: "D", unit: "mm",
    // "CNS560-18(RC)" (dbName[0]) live-confirmed against real Gen NX data —
    // see the KS D 3504 entry's note above.
    dbName: ["CNS560-18(RC)", "CNS560(RC)", "CNS(RC)"],
    grades: ["SD280", "SD280W", "SD420", "SD420W", "SD490W", "SD550W", "SD690"],
    bars: [
      { label: "D10", nominal_mm: 9.53, xref: "#3" }, { label: "D13", nominal_mm: 12.7, xref: "#4" },
      { label: "D16", nominal_mm: 15.9, xref: "#5" }, { label: "D19", nominal_mm: 19.1, xref: "#6" },
      { label: "D22", nominal_mm: 22.2, xref: "#7" }, { label: "D25", nominal_mm: 25.4, xref: "#8" },
      { label: "D29", nominal_mm: 28.7, xref: "#9" }, { label: "D32", nominal_mm: 32.3, xref: "#10" },
      { label: "D36", nominal_mm: 35.8, xref: "#11" }, { label: "D43", nominal_mm: 43.0, xref: "#14" },
      { label: "D57", nominal_mm: 57.3, xref: "#18" },
    ],
  },

  "EN 10080": {
    label: "EN 10080 / Eurocode 2 (유럽)", system: "Ø", unit: "mm",
    dbName: ["EN04(RC)", "EN(RC)"],
    grades: ["B500A", "B500B", "B500C"],
    bars: [6, 8, 10, 12, 14, 16, 20, 25, 28, 32, 40].map((d) => ({ label: `Ø${d}`, nominal_mm: d })),
  },

  "BS 4449": {
    label: "BS 4449 (영국)", system: "Ø", unit: "mm",
    dbName: ["BS(RC)"],
    grades: ["B500A", "B500B", "B500C", "Gr460 (구)"],
    bars: [6, 8, 10, 12, 16, 20, 25, 32, 40].map((d) => ({ label: `Ø${d}`, nominal_mm: d })),
  },

  "GB/T 1499.2": {
    label: "GB/T 1499.2 (중국)", system: "Ø", unit: "mm",
    dbName: ["GB 50917-13(RC)", "GB/T10(RC)", "GB(RC)"],
    grades: ["HPB300", "HRB335", "HRB400", "HRB500", "HRB600"],
    bars: [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 50].map((d) => ({ label: `Ø${d}`, nominal_mm: d })),
  },

  "CSA G30.18": {
    label: "CSA G30.18 (캐나다, metric)", system: "M", unit: "mm",
    dbName: ["CSA(RC)"],
    grades: ["400W", "500W", "400R", "500R"],
    bars: [
      { label: "10M", nominal_mm: 11.3 }, { label: "15M", nominal_mm: 16.0 },
      { label: "20M", nominal_mm: 19.5 }, { label: "25M", nominal_mm: 25.2 },
      { label: "30M", nominal_mm: 29.9 }, { label: "35M", nominal_mm: 35.7 },
      { label: "45M", nominal_mm: 43.7 }, { label: "55M", nominal_mm: 56.4 },
    ],
  },

  "JIS G3112": {
    label: "JIS G3112 (일본)", system: "D", unit: "mm",
    dbName: ["JIS(RC)", "JIS-Civil(RC)"],
    grades: ["SD295A", "SD295B", "SD345", "SD390", "SD490"],
    bars: [
      { label: "D6", nominal_mm: 6.35 }, { label: "D10", nominal_mm: 9.53 },
      { label: "D13", nominal_mm: 12.7 }, { label: "D16", nominal_mm: 15.9 },
      { label: "D19", nominal_mm: 19.1 }, { label: "D22", nominal_mm: 22.2 },
      { label: "D25", nominal_mm: 25.4 }, { label: "D29", nominal_mm: 28.6 },
      { label: "D32", nominal_mm: 31.8 }, { label: "D35", nominal_mm: 34.9 },
      { label: "D38", nominal_mm: 38.1 }, { label: "D41", nominal_mm: 41.3 },
      { label: "D51", nominal_mm: 50.8 },
    ],
  },

  "IS 1786": {
    label: "IS 1786 (인도)", system: "Ø", unit: "mm",
    dbName: ["IS(RC)", "IRC(RC)", "IRS(RC)"],
    grades: ["Fe415", "Fe500", "Fe500D", "Fe550", "Fe600"],
    bars: [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40].map((d) => ({ label: `Ø${d}`, nominal_mm: d })),
  },
};

// ── 최상위: 설계기준 -> 기본 재료 DB ─────────────────────────────────────────
// materialDB 는 MATERIAL_DBS 의 키. confirm:true 는 지역 편차로 재확인 권장.
export const DESIGN_CODES: Record<string, DesignCodeEntry> = {
  // 대만
  "TWN-USD112": { country: "TW", materialDB: "CNS 560" },
  "TWN-USD100": { country: "TW", materialDB: "CNS 560" },
  "TWN-USD92":  { country: "TW", materialDB: "CNS 560" },
  // 중국
  "GB/T50010-10": { country: "CN", materialDB: "GB/T 1499.2" },
  "GB50010-02":   { country: "CN", materialDB: "GB/T 1499.2" },
  // 미국 (imperial)
  "ACI318-25": { country: "US", materialDB: "ASTM A615/A706" },
  "ACI318-19": { country: "US", materialDB: "ASTM A615/A706" },
  "ACI318-14": { country: "US", materialDB: "ASTM A615/A706" },
  "ACI318-11": { country: "US", materialDB: "ASTM A615/A706" },
  "ACI318-08": { country: "US", materialDB: "ASTM A615/A706" },
  "ACI318-05": { country: "US", materialDB: "ASTM A615/A706" },
  "ACI318-02": { country: "US", materialDB: "ASTM A615/A706" },
  "ACI318-99": { country: "US", materialDB: "ASTM A615/A706" },
  "ACI318-95": { country: "US", materialDB: "ASTM A615/A706" },
  "ACI318-89": { country: "US", materialDB: "ASTM A615/A706" },
  // 미국 (soft-metric)
  "ACI318M-25": { country: "US", materialDB: "ASTM A615M/A706M" },
  "ACI318M-19": { country: "US", materialDB: "ASTM A615M/A706M" },
  "ACI318M-14": { country: "US", materialDB: "ASTM A615M/A706M" },
  // 유럽 / 영국
  "Eurocode2:04": { country: "EU", materialDB: "EN 10080" },
  "Eurocode2":    { country: "EU", materialDB: "EN 10080" },
  "BS8110-97":    { country: "UK", materialDB: "BS 4449" },
  // 캐나다
  "CSA-A23.3-94": { country: "CA", materialDB: "CSA G30.18" },
  // 일본
  "AIJ-WSD99": { country: "JP", materialDB: "JIS G3112" },
  // 한국 (모두 KS D 3504)
  "KDS 41 20 : 2022": { country: "KR", materialDB: "KS D 3504" }, // 건축물 콘크리트구조 (기본)
  "KDS 41 30 : 2018": { country: "KR", materialDB: "KS D 3504" },
  "KCI-USD12":  { country: "KR", materialDB: "KS D 3504" },
  "KCI-USD07":  { country: "KR", materialDB: "KS D 3504" },
  "KCI-USD03":  { country: "KR", materialDB: "KS D 3504" },
  "KCI-USD99":  { country: "KR", materialDB: "KS D 3504" },
  "KSCE-USD96": { country: "KR", materialDB: "KS D 3504" },
  "AIK-USD94":  { country: "KR", materialDB: "KS D 3504" },
  "AIK-WSD2K":  { country: "KR", materialDB: "KS D 3504" },
  // 인도
  "IS456:2000": { country: "IN", materialDB: "IS 1786" },
  // 필리핀 / 콜롬비아 / 멕시코 — 재료규격 지역 편차, ASTM 계열로 임시 매핑
  "NSR-10":         { country: "CO", materialDB: "ASTM A615M/A706M", confirm: true }, // 콜롬비아 전용 라벨 없음 → ASTM(SI)
  "NSCP 2015":      { country: "PH", materialDB: "ASTM A615/A706",  rebarCode: "PNS49(RC)" },
  "NTC-DCEC(2023)": { country: "MX", materialDB: "ASTM A615/A706",  rebarCode: "NMX2023(RC)" },
  "NTC-DCEC(2017)": { country: "MX", materialDB: "ASTM A615/A706",  rebarCode: "NMX NTC-2017(RC)" },
};

// 기본값 정의 — 아무 선택 없을 때
export const DEFAULT_DESIGN_CODE = "KDS 41 20 : 2022";

// Gen NX "RC Design" 드롭다운의 실제 표시 순서 (총 37개, 위→아래).
// 드롭다운 렌더링은 이 배열 순서를 따를 것. (DESIGN_CODES 는 조회용 맵)
export const DESIGN_CODE_ORDER: string[] = [
  "TWN-USD112", "TWN-USD100", "TWN-USD92",
  "GB/T50010-10", "GB50010-02",
  "ACI318-25", "ACI318M-25", "ACI318-19", "ACI318M-19", "ACI318-14", "ACI318M-14",
  "ACI318-11", "ACI318-08", "ACI318-05", "ACI318-02", "ACI318-99", "ACI318-95", "ACI318-89",
  "BS8110-97", "Eurocode2:04", "Eurocode2", "NSR-10", "CSA-A23.3-94", "AIJ-WSD99",
  "KDS 41 20 : 2022", "KDS 41 30 : 2018",
  "KCI-USD12", "KCI-USD07", "KCI-USD03", "KCI-USD99", "KSCE-USD96", "AIK-USD94", "AIK-WSD2K",
  "IS456:2000", "NSCP 2015", "NTC-DCEC(2023)", "NTC-DCEC(2017)",
];

// ── helpers ─────────────────────────────────────────────────────────────────
export function listDesignCodes(): string[] {
  return [...DESIGN_CODE_ORDER];
}

/** 설계기준 -> 기본 재료 DB 키 */
export function defaultMaterialDB(designCode: string): string | null {
  return DESIGN_CODES[designCode]?.materialDB ?? null;
}

/**
 * 설계기준 -> Gen NX "Rebar Selection > Code"에 보낼 문자열 라벨.
 * DESIGN_CODES.rebarCode 오버라이드가 있으면 그것을, 없으면 재료 DB의 기본 dbName[0].
 */
export function defaultRebarCode(designCode: string): string | null {
  const dc = DESIGN_CODES[designCode];
  if (!dc) return null;
  if (dc.rebarCode) return dc.rebarCode;
  return MATERIAL_DBS[dc.materialDB]?.dbName?.[0] ?? null;
}

/** 재료 DB의 선택 가능한 rebar Code 라벨 후보들 */
export function rebarCodeOptions(materialDB: string): string[] {
  return MATERIAL_DBS[materialDB]?.dbName ?? [];
}

/** 재료 DB 규격 목록 (드롭다운 채우기용) */
export function getBars(materialDB: string): RebarSize[] {
  return MATERIAL_DBS[materialDB]?.bars ?? [];
}

/** 재료 DB 강종 목록 (Main/Sub 두 슬롯 모두 이 목록을 사용) */
export function getGrades(materialDB: string): string[] {
  return MATERIAL_DBS[materialDB]?.grades ?? [];
}

/** 사용자가 고른 재료 DB가 설계기준 기본과 다른지(비표준 조합 표시용) */
export function isOverride(designCode: string, materialDB: string): boolean {
  return defaultMaterialDB(designCode) !== materialDB;
}

/** 규격 라벨 -> 모델 활성단위 기준 지름값으로 변환 */
export function toModelDiameter(materialDB: string, label: string, modelUnit = "mm"): number | null {
  const bar = getBars(materialDB).find((b) => b.label === label);
  if (!bar) return null;
  const mm = bar.nominal_mm;
  switch (modelUnit) {
    case "mm": return mm;
    case "cm": return mm / 10;
    case "m":  return mm / 1000;
    case "in": return mm / 25.4;
    case "ft": return mm / 304.8;
    default:   return mm;
  }
}
