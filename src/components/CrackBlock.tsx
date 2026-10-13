import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { readServiceMoments, type ConnInfo } from "../lib/api";
import { gbCrackWidth, type Station } from "../lib/gbCrack";
import { toModelDiameter } from "../data/rcCodePresets";
import type { SectorFormValues } from "../lib/beamRebarForm";
import type { SectorKey } from "../types/rebar";

// GB 50010 7.1.2 crack width for the selected beam section (GB models). The
// user picks one of the model's SERVICE design combinations (the quasi-
// permanent 准永久 one) and the limit; the service moment My is read from Gen
// NX (BEAMFORCE, worst across the section's elements per station) and the
// width computed here from the board's bars. Advisory, like the detailing list.

const LIMITS = [0.2, 0.3, 0.4] as const;

interface Props {
  conn: ConnInfo;
  elemKeys: string[];
  sectors: Record<SectorKey, SectorFormValues>;
  b: number;
  h: number;
  dt: number;
  db: number;
  fcuk: number;
  materialDB: string;
}

export function CrackBlock({ conn, elemKeys, sectors, b, h, dt, db, fcuk, materialDB }: Props) {
  const { t } = useI18n();
  const [combos, setCombos] = useState<string[] | null>(null);
  const [lc, setLc] = useState("");
  const [limit, setLimit] = useState<number>(0.3);
  const [moments, setMoments] = useState<Partial<Record<Station, number>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A different section ⇒ its own moments.
  const elemSig = elemKeys.join(",");
  useEffect(() => setMoments(null), [elemSig, lc]);

  async function loadCombos() {
    setBusy(true);
    setErr(null);
    try {
      const r = await readServiceMoments(conn);
      if (!r.ok) return setErr(r.error || r.code || "error");
      setCombos(r.combos);
      if (r.combos.length && !r.combos.includes(lc)) setLc(r.combos[r.combos.length - 1]);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!lc) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await readServiceMoments(conn, { lc, elemKeys });
      if (!r.ok) return setErr(r.error || r.code || "error");
      // worst |My| per station across the section's elements (sign kept)
      const worst: Partial<Record<Station, number>> = {};
      for (const per of Object.values(r.byElem || {}))
        for (const st of ["I", "M", "J"] as const) {
          const v = per[st];
          if (v != null && (worst[st] == null || Math.abs(v) > Math.abs(worst[st]!))) worst[st] = v;
        }
      setMoments(worst);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => {
    if (!moments) return [];
    const dia = (label: string) => (label ? toModelDiameter(materialDB, label, "mm") : null);
    return (["I", "M", "J"] as const).flatMap((st) => {
      const my = moments[st];
      if (my == null || Math.abs(my) < 1e-6) return [];
      const top = my < 0; // hogging ⇒ top bars in tension
      const s = sectors[st];
      const d = dia(top ? s.topName : s.botName);
      const n = Number(top ? s.topNum : s.botNum);
      const res = d && n > 0 ? gbCrackWidth({ mq: my, b, h, cover: top ? dt : db, n, d, fcuk }) : null;
      return [{ st, top, my, res }];
    });
  }, [moments, sectors, b, h, dt, db, fcuk, materialDB]);

  return (
    <div className="judge-block detail-block crack-block">
      <div className="judge-title">{t("board.crackTitle")}</div>
      {combos == null ? (
        <button className="btn" type="button" onClick={loadCombos} disabled={busy}>
          {busy ? t("board.crackLoading") : t("board.crackLoadBtn")}
        </button>
      ) : combos.length === 0 ? (
        <div className="hint detail-note">{t("board.crackNoCombo")}</div>
      ) : (
        <>
          <div className="row3 crack-ctrl">
            <div className="field">
              <label>{t("board.crackCombo")}</label>
              <select value={lc} onChange={(e) => setLc(e.target.value)}>
                {combos.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t("board.crackLimit")}</label>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {LIMITS.map((w) => (
                  <option key={w} value={w}>{t(`board.crackEnv${String(w).replace(".", "")}`)}</option>
                ))}
              </select>
            </div>
            <div className="field crack-run">
              <button className="btn primary" type="button" onClick={run} disabled={busy || !lc}>
                {busy ? t("board.crackLoading") : t("board.crackRun")}
              </button>
            </div>
          </div>
          {moments && (
            rows.length === 0 ? (
              <div className="hint detail-note">{t("board.crackNoMoment")}</div>
            ) : (
              <table className="crack-table mono">
                <thead>
                  <tr>
                    <th>{t("board.crackHeadAt")}</th>
                    <th>Mq (kN·m)</th>
                    <th>σs (MPa)</th>
                    <th>wmax (mm)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ st, top, my, res }) => (
                    <tr key={st}>
                      <td>{t(`board.pingfaAt.${st}${top ? "top" : "bot"}`)}</td>
                      <td>{Math.abs(my).toFixed(1)}</td>
                      <td>{res ? res.sigmaS.toFixed(0) : "—"}</td>
                      <td>{res ? res.w.toFixed(3) : "—"}</td>
                      <td>
                        {res && (
                          <span className={"verdict " + (res.w <= limit + 1e-9 ? "ok" : "ng")}>
                            {res.w <= limit + 1e-9 ? "OK" : "NG"} ≤ {limit}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </>
      )}
      {err && <div className="status show err">{err}</div>}
      <div className="hint detail-note">{t("board.crackNote")}</div>
    </div>
  );
}
