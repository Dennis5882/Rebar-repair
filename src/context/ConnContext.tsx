import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ConnInfo } from "../lib/api";
import { DEFAULT_BASE_URL } from "../lib/constants";

interface ConnContextValue {
  mapiKey: string;
  product: string;
  baseUrl: string;
  setMapiKey: (v: string) => void;
  setProduct: (v: string) => void;
  setBaseUrl: (v: string) => void;
  payload: ConnInfo;
  lengthUnit: string;
  setLengthUnit: (v: string) => void;
}

const ConnContext = createContext<ConnContextValue | null>(null);

// Kept as sessionStorage (not localStorage) and the same key names as the
// pre-React app: connection info never touches the server disk and clears
// when the tab closes.
function readSession(field: string, fallback: string): string {
  try {
    const v = sessionStorage.getItem("conn_" + field);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writeSession(field: string, value: string) {
  try {
    sessionStorage.setItem("conn_" + field, value);
  } catch {
    /* ignore (private mode etc.) */
  }
}

export function ConnProvider({ children }: { children: ReactNode }) {
  const [mapiKey, setMapiKeyState] = useState(() => readSession("mapiKey", ""));
  const [product, setProductState] = useState(() => readSession("product", "gen"));
  const [baseUrl, setBaseUrlState] = useState(() =>
    readSession("baseUrl", DEFAULT_BASE_URL[readSession("product", "gen")])
  );
  // Not persisted to sessionStorage — cheap to refetch on connect, and
  // stale unit label after switching models would be worse than blank.
  const [lengthUnit, setLengthUnit] = useState("");

  // Stable (empty-dep) callbacks + a memoized context value, so components
  // that only read `t`/other context and not ConnContext don't re-render on
  // every keystroke here — mirrors I18nProvider's memoized value. setProduct
  // reads the latest product/baseUrl via functional state updates instead
  // of closing over them, so it can stay referentially stable too.
  const setMapiKey = useCallback((v: string) => {
    setMapiKeyState(v);
    writeSession("mapiKey", v);
  }, []);
  const setProduct = useCallback((v: string) => {
    setProductState((prevProduct) => {
      // If the user hasn't customized baseUrl (still on the previous
      // product's default, e.g. for on-premise use), follow the product
      // switch so the field keeps showing a valid default instead of the
      // wrong product's URL.
      setBaseUrlState((prevBaseUrl) => {
        if (prevBaseUrl !== DEFAULT_BASE_URL[prevProduct]) return prevBaseUrl;
        const nextDefault = DEFAULT_BASE_URL[v];
        if (!nextDefault) return prevBaseUrl;
        writeSession("baseUrl", nextDefault);
        return nextDefault;
      });
      writeSession("product", v);
      return v;
    });
  }, []);
  const setBaseUrl = useCallback((v: string) => {
    setBaseUrlState(v);
    writeSession("baseUrl", v);
  }, []);

  const value = useMemo<ConnContextValue>(
    () => ({
      mapiKey,
      product,
      baseUrl,
      setMapiKey,
      setProduct,
      setBaseUrl,
      payload: { apiKey: mapiKey, product, baseUrl },
      lengthUnit,
      setLengthUnit,
    }),
    [mapiKey, product, baseUrl, setMapiKey, setProduct, setBaseUrl, lengthUnit]
  );

  return <ConnContext.Provider value={value}>{children}</ConnContext.Provider>;
}

export function useConn() {
  const ctx = useContext(ConnContext);
  if (!ctx) throw new Error("useConn must be used within ConnProvider");
  return ctx;
}
