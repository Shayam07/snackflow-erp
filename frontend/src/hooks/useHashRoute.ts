import { useCallback, useEffect, useState } from "react";
import { NAV } from "../lib/nav";

const VALID_PAGES = new Set([...NAV.map((n) => n.key), "payables"]);

function readPage(): string {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return VALID_PAGES.has(raw) ? raw : "dashboard";
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
