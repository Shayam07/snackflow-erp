import { useCallback, useEffect, useState } from "react";

const PAGES = ["dashboard", "orders", "inventory", "production", "masters", "payables", "reports", "audit"];

function readPage(): string {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return PAGES.includes(raw) ? raw : "dashboard";
}

/** Small hash router: deep links, refresh persistence and browser back/forward. */
export function useHashRoute(defaultPage = "dashboard") {
  const [page, setPage] = useState<string>(() => readPage() || defaultPage);

  useEffect(() => {
    const onChange = () => setPage(readPage());
    window.addEventListener("hashchange", onChange);
    if (!window.location.hash) window.history.replaceState(null, "", `#/${defaultPage}`);
    return () => window.removeEventListener("hashchange", onChange);
  }, [defaultPage]);

  const navigate = useCallback((next: string) => {
    if (window.location.hash === `#/${next}`) setPage(next);
    else window.location.hash = `#/${next}`;
  }, []);

  return { page, navigate };
}
