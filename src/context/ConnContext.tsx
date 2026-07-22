import { createContext, useContext, useState, type ReactNode } from "react";
import type { ConnInfo } from "../lib/api";

interface ConnContextValue {
  mapiKey: string;
  product: string;
  baseUrl: string;
  setMapiKey: (v: string) => void;
  setProduct: (v: string) => void;
  setBaseUrl: (v: string) => void;
  payload: ConnInfo;
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
  const [baseUrl, setBaseUrlState] = useState(() => readSession("baseUrl", ""));

  const setMapiKey = (v: string) => {
    setMapiKeyState(v);
    writeSession("mapiKey", v);
  };
  const setProduct = (v: string) => {
    setProductState(v);
    writeSession("product", v);
  };
  const setBaseUrl = (v: string) => {
    setBaseUrlState(v);
    writeSession("baseUrl", v);
  };

  const value: ConnContextValue = {
    mapiKey,
    product,
    baseUrl,
    setMapiKey,
    setProduct,
    setBaseUrl,
    payload: { apiKey: mapiKey, product, baseUrl },
  };

  return <ConnContext.Provider value={value}>{children}</ConnContext.Provider>;
}

export function useConn() {
  const ctx = useContext(ConnContext);
  if (!ctx) throw new Error("useConn must be used within ConnProvider");
  return ctx;
}
