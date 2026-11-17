import Link from "next/link";
import { PageHero } from "@/site/ui";

export const metadata = { title: "Page not found" };

/** The 404 page. Without it Next.js shows its own white page, which breaks the site's black layout. */
export default function NotFound() {
  return (
    <PageHero
      dock="Not found"
      lines={["Page not found"]}
      lede="There is nothing at this address. The protocol may have been renamed, or the link is out of date."
      aside={
        // justifySelf keeps the button at its own width; the hero's grid would otherwise stretch it across the column
        <Link className="btn btn--glow btn--sm" href="/protocols" data-cursor="Go" style={{ justifySelf: "start" }}>
          <span>Open the control map</span>
        </Link>
      }
    />
  );
}
