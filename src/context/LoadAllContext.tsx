import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// A one-shot "load everything" signal. The Project Review tab's "모든 정보 한번에
// 불러오기" button bumps `nonce`; every loadable surface (the beam/column/wall/
// brace boards, the project summary, the 3D geometry) watches it in a useEffect
// and runs its own load. All tab panels stay mounted (only hidden via CSS), so
// even the boards on inactive tabs respond. Kept as a nonce rather than a
// boolean so repeated presses always re-fire.
interface LoadAllValue {
  nonce: number;
  requestLoadAll: () => void;
}

const LoadAllContext = createContext<LoadAllValue | null>(null);

export function LoadAllProvider({ children }: { children: ReactNode }) {
  const [nonce, setNonce] = useState(0);
  const requestLoadAll = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo(() => ({ nonce, requestLoadAll }), [nonce, requestLoadAll]);
  return <LoadAllContext.Provider value={value}>{children}</LoadAllContext.Provider>;
}

export function useLoadAll() {
  const ctx = useContext(LoadAllContext);
  if (!ctx) throw new Error("useLoadAll must be used within LoadAllProvider");
  return ctx;
}
