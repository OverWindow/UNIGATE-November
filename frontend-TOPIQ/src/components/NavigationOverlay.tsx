"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { isPageDestination, navigationStartEvent } from "@/lib/navigation";

export default function NavigationOverlay() {
  const { language } = useApp();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = `${pathname}?${searchParams.toString()}`;
  const [pending, setPending] = useState(false);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = { ko: "페이지를 불러오는 중", en: "Loading page", id: "Memuat halaman" }[language];

  const start = useCallback(() => {
    setPending(true);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    safetyTimer.current = setTimeout(() => setPending(false), 10000);
  }, []);

  useEffect(() => {
    setPending(false);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
  }, [route]);

  useEffect(() => {
    let currentUrl = window.location.href;
    function click(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.dataset.navigationOverlay === "off" || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      if (isPageDestination(window.location.href, anchor.href)) start();
    }
    function popstate() {
      if (isPageDestination(currentUrl, window.location.href)) start();
      currentUrl = window.location.href;
    }
    document.addEventListener("click", click);
    window.addEventListener(navigationStartEvent, start);
    window.addEventListener("popstate", popstate);
    return () => {
      document.removeEventListener("click", click);
      window.removeEventListener(navigationStartEvent, start);
      window.removeEventListener("popstate", popstate);
    };
  }, [start]);

  useEffect(() => () => { if (safetyTimer.current) clearTimeout(safetyTimer.current); }, []);

  return pending ? <div className="site-loading site-navigation-loading" role="status" aria-label={label}><span aria-hidden="true" /></div> : null;
}
