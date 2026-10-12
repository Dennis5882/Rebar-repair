import { useEffect } from "react";

// Closes a drawer on Escape while it is open. Shared by the Guide, Feedback
// and Connection drawers so they all dismiss the same way.
export function useEscapeClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
}
