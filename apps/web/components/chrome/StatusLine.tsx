"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Status { slot: number | null; protocols: number; red: number; lastEvent: string | null }

const COMMANDS: Record<string, string> = {
  protocols: "/protocols", p: "/protocols", events: "/events", e: "/events", drift: "/case/drift", alerts: "/alerts", vault: "/vault",
  demo: "/demo", methodology: "/methodology", method: "/methodology", api: "/docs/api", docs: "/docs/api", q: "/", home: "/",
};

export function StatusLine() {
  const path = usePathname();
  const router = useRouter();
  const [st, setSt] = useState<Status | null>(null);
  const [live, setLive] = useState(false);
  const [mode, setMode] = useState<"NORMAL" | "COMMAND">("NORMAL");
  const [cmd, setCmd] = useState("");
  const [msg, setMsg] = useState("type :help");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => fetch("/api/v1/status").then((r) => r.json()).then((j) => alive && setSt(j.data)).catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    const es = new EventSource("/api/v1/stream");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener("event", (e) => { const d = JSON.parse((e as MessageEvent).data); setMsg(`${d.severity} · ${d.title}`); });
    return () => { alive = false; clearInterval(t); es.close(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === ":" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        setMode("COMMAND");
        setCmd("");
        setTimeout(() => input.current?.focus(), 0);
      }
      if (e.key === "Escape") setMode("NORMAL");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (raw: string) => {
    const [c = "", ...args] = raw.trim().replace(/^:/, "").split(/\s+/);
    setMode("NORMAL");
    if (c === "theme") {
      const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      const next = args[0] === "light" || args[0] === "dark" ? args[0] : cur === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("ow-theme", next); } catch {}
      setMsg(`theme → ${next}`);
      return;
    }
    if (c === "help") { setMsg(":protocols :p <slug> :events :drift :alerts :vault :demo :method :api :theme [light|dark] :q"); return; }
    if ((c === "p" || c === "protocol") && args[0]) { router.push(`/protocols/${args[0]}`); return; }
    const href = COMMANDS[c];
    if (href) { router.push(href); setMsg(`:${c}`); } else setMsg(`E492: Not an editor command: ${c}`);
  };

  const crumbs = `~/overwatch${path === "/" ? "" : path}`;
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 mono text-[11px] select-none" role="status" aria-live="polite">
      <div className="flex items-stretch h-6 bg-[var(--bg-2)] border-t hairline">
        <span className="px-2.5 flex items-center font-medium tracking-wider" style={{ background: mode === "COMMAND" ? "var(--info)" : "var(--accent)", color: "var(--accent-ink)" }}>{mode}</span>
        <span className="px-3 flex items-center text-chrome truncate min-w-0">{crumbs}</span>
        <span className="flex-1" />
        <span className="hidden sm:flex px-3 items-center gap-1.5 text-chrome">
          <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-ok" : "bg-bad"}`} aria-hidden /> {live ? "live" : "offline"}
        </span>
        <span className="hidden md:flex px-3 items-center text-chrome border-l hairline">{st ? `${st.protocols} watched · ${st.red} red` : "…"}</span>
        <span className="px-3 flex items-center text-ink border-l hairline">{st?.slot ? `slot ${st.slot.toLocaleString()}` : "slot …"}</span>
      </div>
      <div className="h-6 flex items-center px-2.5 bg-bg text-chrome">
        {mode === "COMMAND" ? (
          <form className="flex-1 flex" onSubmit={(e) => { e.preventDefault(); run(cmd); }}>
            <span className="text-ink">:</span>
            <input ref={input} aria-label="command" value={cmd} onChange={(e) => setCmd(e.target.value)} onBlur={() => setMode("NORMAL")} className="flex-1 bg-transparent outline-none text-ink ml-0.5" />
          </form>
        ) : (
          <button type="button" className="truncate text-left w-full hover:text-ink" onClick={() => { setMode("COMMAND"); setTimeout(() => input.current?.focus(), 0); }}>{msg}</button>
        )}
      </div>
    </div>
  );
}
