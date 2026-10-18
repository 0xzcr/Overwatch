"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const engine = () => Promise.all([import("./engine/runtime"), import("./engine/page")]);

/** Boots the persistent WebGL runtime once, then (re)initialises page animations on every route change. */
export function Experience() {
  const pathname = usePathname();
  useEffect(() => {
    // CSS dims the particle stage on every page except the landing page.
    document.documentElement.dataset.page = pathname === "/" ? "home" : "inner";
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void engine().then(([{ getRuntime }, { initPage }]) => {
      if (cancelled) return;
      const rt = getRuntime();
      rt.closeMenu();
      rt.lenis.scrollTo(0, { immediate: true, force: true });
      requestAnimationFrame(() => {
        if (!cancelled) dispose = initPage(rt);
      });
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [pathname]);
  return null;
}
