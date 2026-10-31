"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  const [prevQuery, setPrevQuery] = useState(searchParams?.toString());

  const currentQuery = searchParams?.toString();

  // Reset navigation indicator synchronously during render when route props change
  if (isNavigating && (pathname !== prevPath || currentQuery !== prevQuery)) {
    setPrevPath(pathname);
    setPrevQuery(currentQuery);
    setIsNavigating(false);
  } else if (!isNavigating && (pathname !== prevPath || currentQuery !== prevQuery)) {
    setPrevPath(pathname);
    setPrevQuery(currentQuery);
  }

  // Global click interceptor for instant feedback on internal link navigation
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        e.defaultPrevented
      ) {
        return;
      }

      // Check if it's an internal link
      const isInternal =
        href.startsWith("/") ||
        (href.startsWith(window.location.origin) && !href.startsWith(`${window.location.origin}/#`));

      if (isInternal) {
        try {
          const targetUrl = new URL(anchor.href, window.location.href);
          const currentUrl = new URL(window.location.href);

          // Do not trigger if navigating to the identical URL
          if (
            targetUrl.pathname === currentUrl.pathname &&
            targetUrl.search === currentUrl.search
          ) {
            return;
          }

          setIsNavigating(true);
        } catch {
          // Ignore invalid URL parsing
        }
      }
    };

    const handlePopState = () => {
      setIsNavigating(true);
    };

    document.addEventListener("click", handleClick, { capture: true });
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Safety timer: auto-clear after 5 seconds if navigation takes long or aborts
  useEffect(() => {
    if (!isNavigating) return;
    const timer = setTimeout(() => {
      setIsNavigating(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isNavigating]);

  if (!isNavigating) return null;

  return (
    <div
      role="progressbar"
      aria-label="Navigating page"
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-teal-100/60 overflow-hidden pointer-events-none"
    >
      <div className="h-full bg-[#0F766E] shadow-[0_0_8px_#0F766E,0_0_4px_#0F766E] top-progress-bar rounded-full" />
    </div>
  );
}
