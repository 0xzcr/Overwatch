"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/protocols", "Control map"],
  ["/events", "Live events"],
  ["/case-study", "Case study"],
  ["/methodology", "Methodology"],
] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav__center" aria-label="Primary">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className="nav__link" aria-current={path === href || path.startsWith(`${href}/`) ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
