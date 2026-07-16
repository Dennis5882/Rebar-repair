"use strict";

(async function () {
  await window.I18N.ready;
  const t = window.I18N.t;

  // ---------------------------------------------------------------------
  // 연결 정보: 세션 스토리지에만 보관 (서버 디스크에 저장하지 않음)
  // ---------------------------------------------------------------------
  const connFields = ["mapiKey", "product", "baseUrl"];
  for (const id of connFields) {
    const el = document.getElementById(id);
    const saved = sessionStorage.getItem("conn_" + id);
    if (saved !== null) el.value = saved;
    el.addEventListener("input", () => sessionStorage.setItem("conn_" + id, el.value));
  }

  function connPayload() {
    return {
      apiKey: document.getElementById("mapiKey").value,
      product: document.getElementById("product").value,
      baseUrl: document.getElementById("baseUrl").value,
    };
  }

  document.getElementById("verifyBtn").addEventListener("click", async () => {
    const out = document.getElementById("verifyResult");
    out.textContent = t("js.checking");
    try {
      const res = await api("/api/verify", connPayload());
      if (res.ok) {
        const user = res.user ? " · " + res.user : "";
        out.textContent = t("js.connOk", { program: res.program || connPayload().product, user });
      } else if (res.code === "disconnected") {
        out.textContent = t("js.connDisconnected");
      } else if (res.code === "mismatch") {
        out.textContent = t("js.connMismatch", { program: res.program });
      } else {
        out.textContent = t("js.connFail", { error: errText(res) || `HTTP ${res.httpStatus || "?"}` });
      }
    } catch (e) {
      out.textContent = t("js.connError", { error: e });
    }
  });

  async function api(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ ok: false, error: t("js.parseError") }));
    return data;
  }

  // 서버 검증 오류는 code로 내려오므로 여기서 언어에 맞게 문구로 변환한다.
  function errText(res) {
    if (res.code === "missing_key") return t("js.err.missingKey");
    if (res.code === "unknown_product") return t("js.err.unknownProduct", { product: res.product });
    if (res.code === "unknown_member_type") return t("js.err.unknownMemberType", { memberType: res.memberType });
    if (res.code === "missing_key_id") return t("js.err.missingKeyId");
    if (res.code === "empty_payload") return t("js.err.emptyPayload");
    return res.error;
  }

  // ---------------------------------------------------------------------
  // 탭 전환
  // ---------------------------------------------------------------------
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    });
  });

  // ---------------------------------------------------------------------
  // 상태: 부재 타입별 "불러온 원본" 스냅샷 + 목록
  // ---------------------------------------------------------------------
  const state = {
    loaded: { BEAM: null, COLUMN: null, WALL: null, BRACE: null },
    list: { BEAM: {}, COLUMN: {}, WALL: {}, BRACE: {} },
  };

  function v(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }
  function num(id) {
    const s = v(id);
    return s === "" ? undefined : Number(s);
  }
  function checked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  }
  function setV(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val === undefined || val === null ? "" : val;
  }
  function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  }
  function showStatus(type, ok, msg) {
    const el = document.getElementById(type + "-status");
    el.textContent = msg;
    el.className = "status show " + (ok ? "ok" : "err");
  }

  // ---------------------------------------------------------------------
  // BEAM: I/M/J 섹터 입력 UI를 동적으로 생성
  // ---------------------------------------------------------------------
  const SECTORS = ["I", "M", "J"];

  function buildBeamSectorsUI() {
    const root = document.getElementById("BEAM-sectors");
    root.innerHTML = SECTORS.map(
      (key) => `
      <div class="subhead"><span data-i18n="js.sectorTitle.${key}">${t(`js.sectorTitle.${key}`)}</span>${
        key === "M"
          ? ` <button type="button" class="btn" style="padding:2px 8px;font-size:11px" data-copy-m="1" data-i18n="js.copyToIJ">${t("js.copyToIJ")}</button>`
          : ""
      }</div>
      <div class="row2">
        <div class="field"><label for="BEAM-${key}-topName" data-i18n="js.topSpec">${t("js.topSpec")}</label><input id="BEAM-${key}-topName" placeholder="D25"></div>
        <div class="field"><label for="BEAM-${key}-topNum" data-i18n="js.topCount">${t("js.topCount")}</label><input id="BEAM-${key}-topNum" type="number"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="BEAM-${key}-botName" data-i18n="js.botSpec">${t("js.botSpec")}</label><input id="BEAM-${key}-botName" placeholder="D22"></div>
        <div class="field"><label for="BEAM-${key}-botNum" data-i18n="js.botCount">${t("js.botCount")}</label><input id="BEAM-${key}-botNum" type="number"></div>
      </div>
      <div class="row3">
        <div class="field"><label for="BEAM-${key}-shearName" data-i18n="js.stirrupSpec">${t("js.stirrupSpec")}</label><input id="BEAM-${key}-shearName" placeholder="D13"></div>
        <div class="field"><label for="BEAM-${key}-shearLeg" data-i18n="js.legCount">${t("js.legCount")}</label><input id="BEAM-${key}-shearLeg" type="number"></div>
        <div class="field"><label for="BEAM-${key}-shearDist" data-i18n="common.dist">${t("common.dist")}</label><input id="BEAM-${key}-shearDist" type="number" step="any"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="BEAM-${key}-skinName" data-i18n="js.skinSpec">${t("js.skinSpec")}</label><input id="BEAM-${key}-skinName" placeholder="D13"></div>
        <div class="field"><label for="BEAM-${key}-skinNum" data-i18n="js.skinCount">${t("js.skinCount")}</label><input id="BEAM-${key}-skinNum" type="number"></div>
      </div>
    `
    ).join("");

    root.querySelector("[data-copy-m]").addEventListener("click", () => {
      const fields = ["topName", "topNum", "botName", "botNum", "shearName", "shearLeg", "shearDist", "skinName", "skinNum"];
      for (const f of fields) {
        const val = v(`BEAM-M-${f}`);
        setV(`BEAM-I-${f}`, val);
        setV(`BEAM-J-${f}`, val);
      }
      refreshPreview("BEAM");
    });

    root.querySelectorAll("input").forEach((el) => el.addEventListener("input", () => refreshPreview("BEAM")));
  }
  buildBeamSectorsUI();

  // ---------------------------------------------------------------------
  // payload 빌더 (폼 -> Gen NX API 페이로드 형태)
  // ---------------------------------------------------------------------
  function buildBeamSector(key) {
    const sector = {};
    const topName = v(`BEAM-${key}-topName`);
    const topNum = num(`BEAM-${key}-topNum`);
    if (topName && topNum) sector.vMAIN_BAR_TOP = [{ LAYER: 1, NAME: topName, NUM: topNum }];
    const botName = v(`BEAM-${key}-botName`);
    const botNum = num(`BEAM-${key}-botNum`);
    if (botName && botNum) sector.vMAIN_BAR_BOT = [{ LAYER: 1, NAME: botName, NUM: botNum }];
    const shearName = v(`BEAM-${key}-shearName`);
    if (shearName) sector.SHEAR_BAR = { NAME: shearName, LEG: num(`BEAM-${key}-shearLeg`), DIST: num(`BEAM-${key}-shearDist`) };
    const skinName = v(`BEAM-${key}-skinName`);
    if (skinName) {
      sector.SKIN_BAR_NAME = skinName;
      sector.SKIN_BAR_NUM = num(`BEAM-${key}-skinNum`);
    }
    return sector;
  }

  function buildBeamPayload() {
    return {
      ITEMS: [
        {
          BAR_SECTOR_I: buildBeamSector("I"),
          BAR_SECTOR_M: buildBeamSector("M"),
          BAR_SECTOR_J: buildBeamSector("J"),
          MAIN_BAR_DC_TOP: num("BEAM-DT"),
          MAIN_BAR_DC_BOT: num("BEAM-DB"),
        },
      ],
    };
  }

  function buildColumnLikePayload(prefix, isColumn) {
    const item = {
      MAIN_BAR: {
        NAME: v(`${prefix}-mainName`),
        NUM: num(`${prefix}-mainNum`),
        ROW: num(`${prefix}-mainRow`),
      },
      SHEAR_BAR_END: {
        NAME: v(`${prefix}-endName`),
        LEG_Y: num(`${prefix}-endLegY`),
        LEG_Z: num(`${prefix}-endLegZ`),
        DIST: num(`${prefix}-endDist`),
      },
      SHEAR_BAR_CEN: {
        NAME: v(`${prefix}-cenName`),
        LEG_Y: num(`${prefix}-cenLegY`),
        LEG_Z: num(`${prefix}-cenLegZ`),
        DIST: num(`${prefix}-cenDist`),
      },
      DO: num(`${prefix}-DO`),
      HOOP_TYPE: v(`${prefix}-hoopType`),
    };
    if (isColumn) {
      item.MAIN_BAR.USE_CORNER = checked(`${prefix}-useCorner`);
      if (item.MAIN_BAR.USE_CORNER) item.MAIN_BAR.NAME_CORNER = v(`${prefix}-cornerName`);
      item.HOOK_TYPE = Number(v(`${prefix}-hookType`));
    }
    return { ITEMS: [item] };
  }

  function buildWallPayload() {
    const item = {
      CREATE_SUB_WALL_ID: checked("WALL-createSub"),
      VERTICAL_REBAR: { NAME: v("WALL-vName"), DIST: num("WALL-vDist") },
      HORIZONTAL_REBAR: { NAME: v("WALL-hName"), DIST: num("WALL-hDist") },
      USE_END_REBAR: checked("WALL-useEnd"),
      CONCRETE_FACE_TO_CENTER_OF_REBAR: { DW: num("WALL-dw"), DE: num("WALL-de") },
      USE_MODEL_THICKNESS: checked("WALL-useModelThk"),
    };
    if (item.CREATE_SUB_WALL_ID) {
      item.SUB_WALL_ID = num("WALL-subId");
      item.STORY = { FROM: v("WALL-storyFrom"), TO: v("WALL-storyTo") };
    }
    if (item.USE_END_REBAR) {
      item.END_REBAR = { NAME: v("WALL-endName"), NUM: num("WALL-endNum"), DIST: num("WALL-endDist") };
    }
    const beName = v("WALL-beName");
    if (beName) item.BE_HORIZONTAL_REBAR = { NAME: beName, DIST: num("WALL-beDist") };
    const beLen = num("WALL-beLen");
    if (beLen !== undefined) item.BOUNDARY_ELEMENT_LENGTH = beLen;
    if (!item.USE_MODEL_THICKNESS) item.THICKNESS = num("WALL-thickness");
    return { ITEMS: [item] };
  }

  const PAYLOAD_BUILDERS = {
    BEAM: buildBeamPayload,
    COLUMN: () => buildColumnLikePayload("COLUMN", true),
    BRACE: () => buildColumnLikePayload("BRACE", false),
    WALL: buildWallPayload,
  };

  // ---------------------------------------------------------------------
  // 폼 채우기 (불러온 값으로)
  // ---------------------------------------------------------------------
  function firstItem(payload) {
    if (!payload || !payload.ITEMS || !payload.ITEMS[0]) return {};
    return payload.ITEMS[0];
  }

  function fillBeamForm(payload) {
    const it = firstItem(payload);
    for (const key of SECTORS) {
      const sector = it[`BAR_SECTOR_${key}`] || {};
      const top = (sector.vMAIN_BAR_TOP || [])[0] || {};
      const bot = (sector.vMAIN_BAR_BOT || [])[0] || {};
      const shear = sector.SHEAR_BAR || {};
      setV(`BEAM-${key}-topName`, top.NAME);
      setV(`BEAM-${key}-topNum`, top.NUM);
      setV(`BEAM-${key}-botName`, bot.NAME);
      setV(`BEAM-${key}-botNum`, bot.NUM);
      setV(`BEAM-${key}-shearName`, shear.NAME);
      setV(`BEAM-${key}-shearLeg`, shear.LEG);
      setV(`BEAM-${key}-shearDist`, shear.DIST);
      setV(`BEAM-${key}-skinName`, sector.SKIN_BAR_NAME);
      setV(`BEAM-${key}-skinNum`, sector.SKIN_BAR_NUM);
    }
    setV("BEAM-DT", it.MAIN_BAR_DC_TOP);
    setV("BEAM-DB", it.MAIN_BAR_DC_BOT);
  }

  function fillColumnLikeForm(prefix, payload, isColumn) {
    const it = firstItem(payload);
    const mb = it.MAIN_BAR || {};
    const se = it.SHEAR_BAR_END || {};
    const sc = it.SHEAR_BAR_CEN || {};
    setV(`${prefix}-mainName`, mb.NAME);
    setV(`${prefix}-mainNum`, mb.NUM);
    setV(`${prefix}-mainRow`, mb.ROW);
    setV(`${prefix}-endName`, se.NAME);
    setV(`${prefix}-endLegY`, se.LEG_Y);
    setV(`${prefix}-endLegZ`, se.LEG_Z);
    setV(`${prefix}-endDist`, se.DIST);
    setV(`${prefix}-cenName`, sc.NAME);
    setV(`${prefix}-cenLegY`, sc.LEG_Y);
    setV(`${prefix}-cenLegZ`, sc.LEG_Z);
    setV(`${prefix}-cenDist`, sc.DIST);
    setV(`${prefix}-DO`, it.DO);
    if (it.HOOP_TYPE) setV(`${prefix}-hoopType`, it.HOOP_TYPE);
    if (isColumn) {
      setChecked(`${prefix}-useCorner`, mb.USE_CORNER);
      setV(`${prefix}-cornerName`, mb.NAME_CORNER);
      setV(`${prefix}-hookType`, it.HOOK_TYPE ?? 0);
    }
  }

  function fillWallForm(payload) {
    const it = firstItem(payload);
    const vr = it.VERTICAL_REBAR || {};
    const hr = it.HORIZONTAL_REBAR || {};
    const er = it.END_REBAR || {};
    const be = it.BE_HORIZONTAL_REBAR || {};
    const cc = it.CONCRETE_FACE_TO_CENTER_OF_REBAR || {};
    setChecked("WALL-createSub", it.CREATE_SUB_WALL_ID);
    setV("WALL-subId", it.SUB_WALL_ID);
    setV("WALL-storyFrom", (it.STORY || {}).FROM);
    setV("WALL-storyTo", (it.STORY || {}).TO);
    setV("WALL-vName", vr.NAME);
    setV("WALL-vDist", vr.DIST);
    setV("WALL-hName", hr.NAME);
    setV("WALL-hDist", hr.DIST);
    setChecked("WALL-useEnd", it.USE_END_REBAR);
    setV("WALL-endName", er.NAME);
    setV("WALL-endNum", er.NUM);
    setV("WALL-endDist", er.DIST);
    setV("WALL-beName", be.NAME);
    setV("WALL-beDist", be.DIST);
    setV("WALL-beLen", it.BOUNDARY_ELEMENT_LENGTH);
    setV("WALL-dw", cc.DW);
    setV("WALL-de", cc.DE);
    setChecked("WALL-useModelThk", it.USE_MODEL_THICKNESS !== false);
    setV("WALL-thickness", it.THICKNESS);
    toggleWallSections();
  }

  const FORM_FILLERS = {
    BEAM: fillBeamForm,
    COLUMN: (p) => fillColumnLikeForm("COLUMN", p, true),
    BRACE: (p) => fillColumnLikeForm("BRACE", p, false),
    WALL: fillWallForm,
  };

  // ---------------------------------------------------------------------
  // 목록 불러오기 / 선택 / 저장
  // ---------------------------------------------------------------------
  document.querySelectorAll('[data-action="list"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.type;
      btn.disabled = true;
      try {
        const res = await api("/api/rebar-list", { memberType: type, ...connPayload() });
        if (!res.ok) {
          showStatus(type, false, t("js.listFail", { error: errText(res) }));
          return;
        }
        state.list[type] = res.data || {};
        const keys = Object.keys(state.list[type]);
        const sel = document.getElementById(`${type}-existing`);
        sel.innerHTML =
          `<option value="">${t("js.selectDefault")}</option>` + keys.map((k) => `<option value="${k}">${k}</option>`).join("");
        document.getElementById(`${type}-keylist`).textContent = keys.length
          ? t("js.itemsFound", { count: keys.length, keys: keys.join(", ") })
          : t("js.noItems");
        showStatus(type, true, t("js.listLoaded", { count: keys.length }));
      } catch (e) {
        showStatus(type, false, t("js.listError", { error: e }));
      } finally {
        btn.disabled = false;
      }
    });
  });

  ["BEAM", "COLUMN", "WALL", "BRACE"].forEach((type) => {
    document.getElementById(`${type}-existing`).addEventListener("change", (e) => {
      const key = e.target.value;
      if (!key) return;
      setV(`${type}-key`, key);
      const payload = state.list[type][key];
      state.loaded[type] = payload;
      FORM_FILLERS[type](payload);
      renderDiagram(type, "before", payload);
      refreshPreview(type);
    });
  });

  document.querySelectorAll('[data-action="save"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.type;
      const key = v(`${type}-key`);
      if (!key) {
        showStatus(type, false, t("js.keyRequired"));
        return;
      }
      const payload = PAYLOAD_BUILDERS[type]();
      btn.disabled = true;
      showStatus(type, true, t("js.saving"));
      try {
        const res = await api("/api/rebar-update", { memberType: type, key, payload, ...connPayload() });
        if (!res.ok) {
          showStatus(type, false, t("js.saveFail", { error: errText(res) }));
          return;
        }
        showStatus(type, true, t("js.saveDone"));
        state.loaded[type] = payload;
        renderDiagram(type, "before", payload);
      } catch (e) {
        showStatus(type, false, t("js.saveError", { error: e }));
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ---------------------------------------------------------------------
  // WALL 조건부 섹션 토글
  // ---------------------------------------------------------------------
  function toggleWallSections() {
    document.getElementById("WALL-subWrap").style.display = checked("WALL-createSub") ? "grid" : "none";
    document.getElementById("WALL-endWrap").style.display = checked("WALL-useEnd") ? "grid" : "none";
    document.getElementById("WALL-thkWrap").style.display = checked("WALL-useModelThk") ? "none" : "block";
  }
  ["WALL-createSub", "WALL-useEnd", "WALL-useModelThk"].forEach((id) =>
    document.getElementById(id).addEventListener("change", () => {
      toggleWallSections();
      refreshPreview("WALL");
    })
  );
  toggleWallSections();

  document.getElementById("COLUMN-useCorner").addEventListener("change", () => {
    document.getElementById("COLUMN-cornerWrap").style.display = checked("COLUMN-useCorner") ? "block" : "none";
    refreshPreview("COLUMN");
  });
  document.getElementById("COLUMN-cornerWrap").style.display = "none";

  // ---------------------------------------------------------------------
  // 입력 변경 시 실시간 미리보기 갱신
  // ---------------------------------------------------------------------
  ["COLUMN", "WALL", "BRACE"].forEach((type) => {
    document.getElementById(`panel-${type}`).querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", () => refreshPreview(type));
    });
  });
  document.getElementById("panel-BEAM").querySelectorAll("#BEAM-DT, #BEAM-DB, #BEAM-B, #BEAM-H").forEach((el) =>
    el.addEventListener("input", () => refreshPreview("BEAM"))
  );

  function refreshPreview(type) {
    try {
      const payload = PAYLOAD_BUILDERS[type]();
      renderDiagram(type, "after", payload);
    } catch (e) {
      /* 입력이 불완전한 동안에는 조용히 무시 */
    }
  }

  // ---------------------------------------------------------------------
  // SVG 단면 다이어그램 (개략도)
  // ---------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function nf(v) {
    if (v === undefined || v === null || v === "") return "-";
    return String(v);
  }

  function perimeterPoints(count, w, h) {
    if (count <= 0) return [];
    const perim = 2 * (w + h);
    const pts = [];
    for (let i = 0; i < count; i++) {
      const d = (perim * i) / count;
      let x, y;
      if (d < w) { x = -w / 2 + d; y = -h / 2; }
      else if (d < w + h) { x = w / 2; y = -h / 2 + (d - w); }
      else if (d < 2 * w + h) { x = w / 2 - (d - w - h); y = h / 2; }
      else { x = -w / 2; y = h / 2 - (d - 2 * w - h); }
      pts.push([x, y]);
    }
    return pts;
  }

  function drawBeamSvg(payload, dims, aria) {
    const B = Number(dims.B) || 300;
    const H = Number(dims.H) || 600;
    const it = firstItem(payload);
    const sector = it.BAR_SECTOR_M || {};
    const dt = it.MAIN_BAR_DC_TOP || 40;
    const db = it.MAIN_BAR_DC_BOT || 40;
    const topLayers = sector.vMAIN_BAR_TOP || [];
    const botLayers = sector.vMAIN_BAR_BOT || [];
    const shear = sector.SHEAR_BAR || {};

    const canvas = 240, pad = 26;
    const scale = (canvas - 2 * pad) / Math.max(B, H, 1);
    const w = B * scale, h = H * scale;
    const x0 = (canvas - w) / 2, y0 = (canvas - h) / 2;

    let s = `<svg viewBox="0 0 ${canvas} ${canvas}" class="sec-svg" role="img" aria-label="${esc(aria)}">`;
    s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" class="concrete"/>`;

    const inset = Math.min(dt, db, 60) * scale;
    const hw = w - 2 * inset, hh = h - 2 * inset;
    if (hw > 4 && hh > 4) {
      s += `<rect x="${(x0 + inset).toFixed(1)}" y="${(y0 + inset).toFixed(1)}" width="${hw.toFixed(1)}" height="${hh.toFixed(1)}" class="hoop"/>`;
    }

    const radius = 4.2;
    const emitDots = (layers, fromTop) => {
      layers.forEach((layer, li) => {
        const cnt = layer.NUM || 0;
        if (cnt <= 0) return;
        const margin = (fromTop ? dt : db) * scale + radius;
        const yy = fromTop ? y0 + margin + li * 10 : y0 + h - margin - li * 10;
        let xs;
        if (cnt === 1) {
          xs = [x0 + w / 2];
        } else {
          const edge = dt * scale + radius;
          xs = Array.from({ length: cnt }, (_, i) => x0 + edge + ((w - 2 * edge) * i) / (cnt - 1));
        }
        for (const xx of xs) s += `<circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="${radius}" class="mainbar"/>`;
      });
    };
    emitDots(topLayers, true);
    emitDots(botLayers, false);

    const caption = t("js.svgBeamCaption", { B: nf(B), H: nf(H), name: nf(shear.NAME), dist: nf(shear.DIST) });
    s += `<text x="${canvas / 2}" y="${canvas - 6}" class="sec-caption" text-anchor="middle">${esc(caption)}</text>`;
    s += "</svg>";
    return s;
  }

  function drawColumnOrBraceSvg(payload, dims, aria, isBrace) {
    const B = Number(dims.B) || 500;
    const H = Number(dims.H) || 500;
    const it = firstItem(payload);
    const mb = it.MAIN_BAR || {};
    const se = it.SHEAR_BAR_END || {};
    const doVal = it.DO || 40;

    const canvas = 240, pad = 26;
    const scale = (canvas - 2 * pad) / Math.max(B, H, 1);
    const w = B * scale, h = H * scale;
    const x0 = (canvas - w) / 2, y0 = (canvas - h) / 2;
    const cx = canvas / 2, cy = canvas / 2;

    let s = `<svg viewBox="0 0 ${canvas} ${canvas}" class="sec-svg" role="img" aria-label="${esc(aria)}">`;
    s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" class="concrete"/>`;

    const inset = Math.min(doVal, 60) * scale;
    const hw = w - 2 * inset, hh = h - 2 * inset;
    if (hw > 4 && hh > 4) {
      s += `<rect x="${(x0 + inset).toFixed(1)}" y="${(y0 + inset).toFixed(1)}" width="${hw.toFixed(1)}" height="${hh.toFixed(1)}" class="hoop"/>`;
    }

    const radius = 4.2;
    const bw = Math.max(hw - 2 * radius, 0), bh = Math.max(hh - 2 * radius, 0);
    const total = mb.NUM || 0;
    const useCorner = !!mb.USE_CORNER && !isBrace;

    let pts;
    if (useCorner) {
      const corners = [[-bw / 2, -bh / 2], [bw / 2, -bh / 2], [bw / 2, bh / 2], [-bw / 2, bh / 2]];
      for (const [px, py] of corners) {
        s += `<circle cx="${(cx + px).toFixed(1)}" cy="${(cy + py).toFixed(1)}" r="${radius + 1.2}" class="cornerbar"/>`;
      }
      pts = perimeterPoints(Math.max(total - 4, 0), bw, bh);
    } else {
      pts = perimeterPoints(total, bw, bh);
    }
    for (const [px, py] of pts) {
      s += `<circle cx="${(cx + px).toFixed(1)}" cy="${(cy + py).toFixed(1)}" r="${radius}" class="mainbar"/>`;
    }

    const kind = isBrace ? t("js.kindBrace") : t("js.kindColumn");
    const caption = t("js.svgColumnCaption", { kind, B: nf(B), H: nf(H), name: nf(se.NAME), legY: nf(se.LEG_Y), legZ: nf(se.LEG_Z), dist: nf(se.DIST) });
    s += `<text x="${cx}" y="${canvas - 6}" class="sec-caption" text-anchor="middle">${esc(caption)}</text>`;
    s += "</svg>";
    return s;
  }

  function drawWallSvg(payload, dims, aria) {
    const thickness = Number(dims.THICKNESS) || 300;
    const length = Number(dims.LENGTH) || 3000;
    const it = firstItem(payload);
    const vr = it.VERTICAL_REBAR || {};
    const hr = it.HORIZONTAL_REBAR || {};
    const er = it.END_REBAR || {};
    const beLen = it.BOUNDARY_ELEMENT_LENGTH || 0;
    const cc = it.CONCRETE_FACE_TO_CENTER_OF_REBAR || {};
    const dw = cc.DW || 40;

    const canvasW = 420, canvasH = 150, pad = 22;
    const dispLen = Math.min(length, 4000);
    const scale = (canvasW - 2 * pad) / (dispLen || 1);
    const w = dispLen * scale, h = thickness * scale;
    const x0 = (canvasW - w) / 2, y0 = (canvasH - h) / 2;

    let s = `<svg viewBox="0 0 ${canvasW} ${canvasH}" class="sec-svg wall-svg" role="img" aria-label="${esc(aria)}">`;
    s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" class="concrete"/>`;

    if (beLen > 0) {
      const beW = Math.min(beLen, dispLen / 2) * scale;
      s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${beW.toFixed(1)}" height="${h.toFixed(1)}" class="be-zone"/>`;
      s += `<rect x="${(x0 + w - beW).toFixed(1)}" y="${y0.toFixed(1)}" width="${beW.toFixed(1)}" height="${h.toFixed(1)}" class="be-zone"/>`;
    }

    const dwpx = h > 4 ? Math.min(dw * scale, h / 2 - 2) : 0;
    s += `<line x1="${x0.toFixed(1)}" y1="${(y0 + dwpx).toFixed(1)}" x2="${(x0 + w).toFixed(1)}" y2="${(y0 + dwpx).toFixed(1)}" class="hoop-line"/>`;
    s += `<line x1="${x0.toFixed(1)}" y1="${(y0 + h - dwpx).toFixed(1)}" x2="${(x0 + w).toFixed(1)}" y2="${(y0 + h - dwpx).toFixed(1)}" class="hoop-line"/>`;

    const dist = vr.DIST || 200;
    const count = Math.min(dist ? Math.floor(w / (dist * scale)) : 0, 18);
    const radius = 3.2;
    if (count > 0) {
      for (let i = 0; i <= count; i++) {
        const xx = x0 + (w * i) / count;
        for (const yy of [y0 + dwpx, y0 + h - dwpx]) {
          s += `<circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="${radius}" class="mainbar"/>`;
        }
      }
    }

    if (it.USE_END_REBAR) {
      const endCount = Math.min(er.NUM || 0, 4);
      for (const side of [0, 1]) {
        const ex = side === 0 ? x0 + 7 : x0 + w - 7;
        for (let k = 0; k < endCount; k++) {
          const offset = (k - (endCount - 1) / 2) * 7;
          s += `<circle cx="${ex.toFixed(1)}" cy="${(y0 + h / 2 + offset).toFixed(1)}" r="3.6" class="endbar"/>`;
        }
      }
    }

    let caption = t("js.svgWallCaption", { thickness: nf(thickness), vname: nf(vr.NAME), vdist: nf(vr.DIST), hname: nf(hr.NAME), hdist: nf(hr.DIST) });
    if (length > dispLen) caption += t("js.svgWallPartial");
    s += `<text x="${canvasW / 2}" y="${canvasH - 4}" class="sec-caption" text-anchor="middle">${esc(caption)}</text>`;
    s += "</svg>";
    return s;
  }

  function drawSectionSvg(type, payload, dims, aria) {
    if (!payload) return `<div class="sec-empty">${esc(t("js.noData"))}</div>`;
    if (type === "BEAM") return drawBeamSvg(payload, dims, aria);
    if (type === "COLUMN") return drawColumnOrBraceSvg(payload, dims, aria, false);
    if (type === "BRACE") return drawColumnOrBraceSvg(payload, dims, aria, true);
    if (type === "WALL") return drawWallSvg(payload, dims, aria);
    return '<div class="sec-empty">-</div>';
  }

  function currentDims(type) {
    if (type === "WALL") return { THICKNESS: v("WALL-dispThk"), LENGTH: v("WALL-dispLen") };
    return { B: v(`${type}-B`), H: v(`${type}-H`) };
  }

  function renderDiagram(type, which, payload) {
    const el = document.getElementById(`${type}-svg-${which}`);
    const label = which === "before" ? t("common.loadedCap") : t("common.currentCap");
    el.innerHTML = drawSectionSvg(type, payload, currentDims(type), `${type} ${label} ${t("js.sectionWord")}`);
  }

  ["BEAM", "COLUMN", "WALL", "BRACE"].forEach((type) => {
    const dimIds = type === "WALL" ? ["WALL-dispThk", "WALL-dispLen"] : [`${type}-B`, `${type}-H`];
    dimIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", () => {
          renderDiagram(type, "before", state.loaded[type]);
          refreshPreview(type);
        });
      }
    });
  });

  // ---------------------------------------------------------------------
  // 언어 변경 시: 정적 라벨은 i18n.js가 처리, 여기서는 동적으로 그려지는
  // 다이어그램 캡션과 상태 표시용 select 기본 옵션만 다시 그려준다.
  // ---------------------------------------------------------------------
  document.addEventListener("i18n:changed", () => {
    ["BEAM", "COLUMN", "WALL", "BRACE"].forEach((type) => {
      renderDiagram(type, "before", state.loaded[type]);
      refreshPreview(type);
    });
  });
})();
