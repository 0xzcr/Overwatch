"use client";
import { useEffect, useState } from "react";

/** Live GMT clock (HH:MM:SS). Renders a placeholder on the server so hydration never mismatches the client's time. */
export function NavClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 19));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="nav__status">
      <time dateTime={now ?? undefined}>{now ?? "--:--:--"}</time> GMT
    </span>
  );
}
