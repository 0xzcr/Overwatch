import { explorer } from "@/lib/format";
export function Addr({ v, network = "mainnet", kind = "address", full = false }: { v: string | null | undefined; network?: "mainnet" | "devnet"; kind?: "address" | "tx"; full?: boolean }) {
  if (!v) return <span className="mono text-dim">none</span>;
  const isPlaceholder = !/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(v);
  const text = full ? v : `${v.slice(0, 4)}…${v.slice(-4)}`;
  if (isPlaceholder) return <span className="mono text-chrome" title="placeholder (reconstructed)">{v}</span>;
  return (
    <a href={explorer(kind, v, network)} target="_blank" rel="noreferrer" className="mono text-chrome hover:text-accent break-all" title={v}>
      {text}<span aria-hidden className="text-dim"> ↗</span>
    </a>
  );
}
