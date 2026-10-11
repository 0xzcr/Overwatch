"use client";
import { useEffect, useState } from "react";

/** WebGL availability + reduced-motion preference, decided on the client. */
export function useCanRender3D() {
  const [s, set] = useState<{ ready: boolean; webgl: boolean; reduced: boolean }>({ ready: false, webgl: false, reduced: false });
  useEffect(() => {
    let webgl = false;
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {}
    set({ ready: true, webgl, reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  }, []);
  return s;
}
