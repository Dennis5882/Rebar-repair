import { useEffect, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import type { ConnInfo } from "../lib/api";
import { saveRebar } from "../lib/api";
import { buildBeamPayload, emptySectors, fillFromPayload, toWritePayload, type SectorFormValues } from "../lib/beamRebarForm";
import { statusClass, statusText, type StatusMsg } from "../lib/statusMsg";
import { SECTORS, type BeamPayload, type SectorKey } from "../types/rebar";

// A spreadsheet-style alternative to BeamForm's one-element-at-a-time
// editor — mirrors Gen NX's own "Rebar Data Tables > Modify Beam Rebar
// Data" grid (row per element, editable cells), for editing many already-
// loaded elements without reopening the single-record form for each one.
// Each row saves independently via the same saveRebar() call BeamForm
// uses — there is no batch-write endpoint, so "save all" would just be
// this same per-row call looped, and a per-row button keeps a partial
// failure (one element rejected by Gen NX) from being ambiguous about
// which rows actually saved.

interface RowState {
  sectors: Record<SectorKey, SectorFormValues>;
  dt: string;
  db: string;
}

function rowFromPayload(payload: BeamPayload): RowState {
  const filled = fillFromPayload(payload);
  return { sectors: filled.sectors, dt: filled.dt, db: filled.db };
}

function emptyRow(): RowState {
  return { sectors: emptySectors(), dt: "", db: "" };
}

const SECTOR_FIELDS: { field: keyof SectorFormValues; labelKey: string; numeric?: boolean }[] = [
  { field: "topName", labelKey: "js.topSpec" },
  { field: "topNum", labelKey: "js.topCount", numeric: true },
  { field: "botName", labelKey: "js.botSpec" },
  { field: "botNum", labelKey: "js.botCount", numeric: true },
  { field: "shearName", labelKey: "js.stirrupSpec" },
  { field: "shearLeg", labelKey: "js.legCount", numeric: true },
  { field: "shearDist", labelKey: "common.dist", numeric: true },
  { field: "skinName", labelKey: "js.skinSpec" },
  { field: "skinNum", labelKey: "js.skinCount", numeric: true },
];

interface Props {
  list: Record<string, BeamPayload>;
  names: Record<string, string>;
  conn: ConnInfo;
}

export function BeamRebarTable({ list, names, conn }: Props) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [rowStatus, setRowStatus] = useState<Record<string, StatusMsg>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newRow, setNewRow] = useState<RowState>(emptyRow());

  useEffect(() => {
    const keys = Object.keys(list);
    const nextRows: Record<string, RowState> = {};
    for (const key of keys) nextRows[key] = rowFromPayload(list[key]);
    setRows(nextRows);
    setOrder(keys);
    setRowStatus({});
  }, [list]);

  function updateCell(key: string, sector: SectorKey, field: keyof SectorFormValues, value: string) {
    setRows((prev) => ({
      ...prev,
      [key]: { ...prev[key], sectors: { ...prev[key].sectors, [sector]: { ...prev[key].sectors[sector], [field]: value } } },
    }));
  }
  function updateCover(key: string, field: "dt" | "db", value: string) {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }
  function updateNewCell(sector: SectorKey, field: keyof SectorFormValues, value: string) {
    setNewRow((prev) => ({ ...prev, sectors: { ...prev.sectors, [sector]: { ...prev.sectors[sector], [field]: value } } }));
  }

  async function saveKey(key: string, row: RowState, onSuccess: () => void) {
    setSavingKey(key);
    setRowStatus((prev) => ({ ...prev, [key]: { ok: true, kind: "saving" } }));
    try {
      const payload = buildBeamPayload(row.sectors, row.dt, row.db);
      const res = await saveRebar("BEAM", key, toWritePayload(payload), conn);
      if (!res.ok) {
        setRowStatus((prev) => ({ ...prev, [key]: { ok: false, kind: "saveFail", res } }));
        return;
      }
      setRowStatus((prev) => ({ ...prev, [key]: { ok: true, kind: "saveDone" } }));
      onSuccess();
    } catch (e) {
      setRowStatus((prev) => ({ ...prev, [key]: { ok: false, kind: "saveError", error: String(e) } }));
    } finally {
      setSavingKey(null);
    }
  }

  function handleSaveRow(key: string) {
    const row = rows[key];
    if (row) saveKey(key, row, () => {});
  }

  function handleAddRow() {
    const key = newKey.trim();
    if (!key) {
      setRowStatus((prev) => ({ ...prev, __new: { ok: false, kind: "keyRequired" } }));
      return;
    }
    // A typo landing an already-loaded element's key in this "new element"
    // field would otherwise silently PUT the (near-empty) new-row draft
    // over that element's real saved rebar — Gen NX's REBB write is a full
    // replace, not a merge, so this isn't a harmless no-op.
    if (key in rows) {
      setRowStatus((prev) => ({ ...prev, __new: { ok: false, kind: "keyExists" } }));
      return;
    }
    saveKey(key, newRow, () => {
      setRows((prev) => ({ ...prev, [key]: newRow }));
      setOrder((prev) => (prev.includes(key) ? prev : [...prev, key]));
      setNewKey("");
      setNewRow(emptyRow());
    });
  }

  return (
    <div className="panel">
      <h2>{t("common.tableViewBtn")}</h2>
      <div className="table-scroll">
        <table className="rebar-table">
          <thead>
            <tr>
              <th rowSpan={2}>{t("common.colElement")}</th>
              <th rowSpan={2}>{t("common.colSection")}</th>
              {SECTORS.map((sector) => (
                <th key={sector} colSpan={SECTOR_FIELDS.length}>
                  {t(`js.sectorTitle.${sector}`)}
                </th>
              ))}
              <th rowSpan={2}>{t("common.colDT")}</th>
              <th rowSpan={2}>{t("common.colDB")}</th>
              <th rowSpan={2}>{t("common.colSave")}</th>
              <th rowSpan={2}>{t("common.colStatus")}</th>
            </tr>
            <tr>
              {SECTORS.map((sector) =>
                SECTOR_FIELDS.map((f) => <th key={`${sector}-${f.field}`}>{t(f.labelKey)}</th>)
              )}
            </tr>
          </thead>
          <tbody>
            {order.map((key) => {
              const row = rows[key];
              if (!row) return null;
              const rs = rowStatus[key];
              return (
                <tr key={key}>
                  <td className="rebar-table-key">{key}</td>
                  <td className="rebar-table-name">{names[key] || "-"}</td>
                  {SECTORS.map((sector) =>
                    SECTOR_FIELDS.map((f) => (
                      <td key={`${sector}-${f.field}`}>
                        <input
                          className="cell-input"
                          type={f.numeric ? "number" : "text"}
                          value={row.sectors[sector][f.field]}
                          onChange={(e) => updateCell(key, sector, f.field, e.target.value)}
                        />
                      </td>
                    ))
                  )}
                  <td>
                    <input className="cell-input" type="number" value={row.dt} onChange={(e) => updateCover(key, "dt", e.target.value)} />
                  </td>
                  <td>
                    <input className="cell-input" type="number" value={row.db} onChange={(e) => updateCover(key, "db", e.target.value)} />
                  </td>
                  <td>
                    <button className="btn" type="button" onClick={() => handleSaveRow(key)} disabled={savingKey === key}>
                      {t("common.saveShortBtn")}
                    </button>
                  </td>
                  <td className="rebar-table-status">
                    {rs && <span className={"status-inline " + statusClass(rs)}>{statusText(t, rs)}</span>}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td>
                <input
                  className="cell-input"
                  placeholder={t("common.newElementKeyPlaceholder")}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
              </td>
              <td className="rebar-table-name">-</td>
              {SECTORS.map((sector) =>
                SECTOR_FIELDS.map((f) => (
                  <td key={`new-${sector}-${f.field}`}>
                    <input
                      className="cell-input"
                      type={f.numeric ? "number" : "text"}
                      value={newRow.sectors[sector][f.field]}
                      onChange={(e) => updateNewCell(sector, f.field, e.target.value)}
                    />
                  </td>
                ))
              )}
              <td>
                <input
                  className="cell-input"
                  type="number"
                  value={newRow.dt}
                  onChange={(e) => setNewRow((prev) => ({ ...prev, dt: e.target.value }))}
                />
              </td>
              <td>
                <input
                  className="cell-input"
                  type="number"
                  value={newRow.db}
                  onChange={(e) => setNewRow((prev) => ({ ...prev, db: e.target.value }))}
                />
              </td>
              <td>
                <button className="btn" type="button" onClick={handleAddRow} disabled={savingKey === newKey.trim()}>
                  {t("common.addRowBtn")}
                </button>
              </td>
              <td className="rebar-table-status">
                {rowStatus.__new && (
                  <span className={"status-inline " + statusClass(rowStatus.__new)}>{statusText(t, rowStatus.__new)}</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
