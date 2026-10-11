import Link from "next/link";
import { BrandMark } from "./Brand";

const NAV = [
  ["protocols", "/protocols"], ["events", "/events"], ["drift", "/case/drift"], ["alerts", "/alerts"], ["vault", "/vault"], ["demo", "/demo"], ["method", "/methodology"], ["api", "/docs/api"],
] as const;

export function Frame() {
  return (
    <header className="fixed top-0 inset-x-0 z-40 pointer-events-none">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-10 pt-4 sm:pt-6">
        <Link href="/" className="pointer-events-auto inline-flex items-center gap-3 min-h-11 text-chrome hover:text-ink">
          <BrandMark />
          <span className="text-[11px] font-medium tracking-[0.3em]">OVERWATCH</span>
        </Link>
        <nav aria-label="Primary" className="pointer-events-auto flex overflow-x-auto max-w-[62vw] sm:max-w-none no-scrollbar">
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className="mono text-[11px] tracking-[0.14em] text-dim hover:text-ink px-2 sm:px-2.5 min-h-11 inline-flex items-center whitespace-nowrap">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
