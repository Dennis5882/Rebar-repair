import { useState } from "react";
import { listRebar, type ConnInfo, type SectionGroup } from "../lib/api";
import type { KeylistMsg, StatusMsg } from "../lib/statusMsg";
import type { MemberType } from "../types/rebar";

export type { StatusMsg };

// Shared by BeamForm/ColumnLikeForm/WallForm — each rebar-editing tab lists
// its member type's saved records the same way (fetch, build a summary
// line, surface a status message). Per-tab specifics (which key is
// selected, how the form gets filled, save handling) stay in each form.
export function useRebarList<T>(memberType: MemberType, conn: ConnInfo) {
  const [list, setList] = useState<Record<string, T>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<Record<string, SectionGroup<T>>>({});
  const [keylistMsg, setKeylistMsg] = useState<KeylistMsg>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listLoadedOnce, setListLoadedOnce] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);

  async function handleList() {
    setListLoading(true);
    try {
      const res = await listRebar<T>(memberType, conn);
      if (!res.ok) {
        setStatus({ ok: false, kind: "listFail", res });
        return;
      }
      setList(res.data);
      setNames(res.names || {});
      setSections(res.sections || {});
      setListLoadedOnce(true);
      const keys = Object.keys(res.data);
      setKeylistMsg(keys.length ? { kind: "itemsFound", count: keys.length, keys } : { kind: "noItems" });
      setStatus({ ok: true, kind: "listLoaded", count: keys.length });
    } catch (e) {
      setStatus({ ok: false, kind: "listError", error: String(e) });
    } finally {
      setListLoading(false);
    }
  }

  return { list, names, sections, keylistMsg, listLoading, listLoadedOnce, status, setStatus, handleList };
}
