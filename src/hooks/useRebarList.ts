import { useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { listRebar, type ConnInfo } from "../lib/api";
import { errText } from "../lib/errText";
import type { MemberType } from "../types/rebar";

export interface StatusMsg {
  ok: boolean;
  msg: string;
}

// Shared by BeamForm/ColumnLikeForm/WallForm — each rebar-editing tab lists
// its member type's saved records the same way (fetch, build a summary
// line, surface a status message). Per-tab specifics (which key is
// selected, how the form gets filled, save handling) stay in each form.
export function useRebarList<T>(memberType: MemberType, conn: ConnInfo) {
  const { t } = useI18n();
  const [list, setList] = useState<Record<string, T>>({});
  const [keylistText, setKeylistText] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listLoadedOnce, setListLoadedOnce] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  async function handleList() {
    setListLoading(true);
    try {
      const res = await listRebar<T>(memberType, conn);
      if (!res.ok) {
        setStatus({ ok: false, msg: t("js.listFail", { error: errText(t, res) }) });
        return;
      }
      setList(res.data);
      setListLoadedOnce(true);
      const keys = Object.keys(res.data);
      setKeylistText(keys.length ? t("js.itemsFound", { count: keys.length, keys: keys.join(", ") }) : t("js.noItems"));
      setStatus({ ok: true, msg: t("js.listLoaded", { count: keys.length }) });
    } catch (e) {
      setStatus({ ok: false, msg: t("js.listError", { error: String(e) }) });
    } finally {
      setListLoading(false);
    }
  }

  return { list, keylistText, listLoading, listLoadedOnce, status, setStatus, handleList };
}
