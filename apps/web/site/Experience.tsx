"use client";
import { useEffect } from "react";

/** Boots the WebGL stage and all page interactions once the server-rendered markup is in place. */
export function Experience() {
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void import("./engine/boot").then(({ boot }) => {
      if (!cancelled) dispose = boot();
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);
  return null;
}
