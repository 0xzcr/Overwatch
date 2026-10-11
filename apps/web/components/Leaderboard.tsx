"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { Grade } from "./ui/Grade";
import { Badge } from "./ui/Section";
import { Term } from "./ui/Term";
import { usd, ago } from "@/lib/format";

export interface Row {
  slug: string; name: string; category: string; tvl: number | null; grade: string | null; score: number | null; authority: string;
  threshold: string; timelockSec: number | null; nonceSigners: number; lastChange: string | null; verified: boolean; red: boolean; source: string; controlled: boolean;
}
const h = createColumnHelper<Row>();
const tl = (s: number | null) => (s == null ? "—" : s === 0 ? "none" : s >= 86400 ? `${(s / 86400).toFixed(s % 86400 ? 1 : 0)}d` : `${(s / 3600).toFixed(s % 3600 ? 1 : 0)}h`);

export function Leaderboard({ rows }: { rows: Row[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "score", desc: false }]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const data = useMemo(() => rows.filter((r) => cat === "all" || r.category === cat), [rows, cat]);
  const cols = useMemo(() => [
    h.accessor("name", { header: "Protocol", cell: (c) => (
      <Link href={`/protocols/${c.row.original.slug}`} className="hover:text-accent flex items-center gap-2">
        {c.row.original.red && <span className="w-2 h-2 rounded-full bg-bad pulse-bad" aria-label="red" />}
        <span className="text-ink">{c.getValue()}</span>
        {c.row.original.source === "demo" && <Badge tone="accent">demo</Badge>}
      </Link>) }),
    h.accessor("category", { header: "Category", cell: (c) => <span className="mono text-xs text-chrome">{c.getValue()}</span> }),
    h.accessor("tvl", { header: "TVL", sortUndefined: "last", cell: (c) => <span className="mono text-xs">{usd(c.getValue())}</span> }),
    h.accessor("score", { header: "Grade", sortUndefined: "last", cell: (c) => <Grade grade={c.row.original.grade} score={c.getValue()} size="sm" /> }),
    h.accessor("authority", { header: () => <Term t="upgrade authority">Upgrade auth</Term>, cell: (c) => <span className={`mono text-[11px] ${c.getValue().includes("SINGLE_KEY") ? "text-bad" : "text-chrome"}`}>{c.getValue().replaceAll("_", " ").toLowerCase()}</span> }),
    h.accessor("threshold", { header: () => <Term t="threshold">m-of-n</Term>, cell: (c) => <span className="mono text-xs">{c.getValue()}{c.row.original.controlled && <span className="text-warn" title="controlled multisig"> ⚑</span>}</span> }),
    h.accessor("timelockSec", { header: () => <Term t="timelock">Timelock</Term>, sortUndefined: "last", cell: (c) => <span className={`mono text-xs ${c.getValue() === 0 ? "text-bad" : ""}`}>{tl(c.getValue())}</span> }),
    h.accessor("nonceSigners", { header: () => <Term t="durable nonce">Nonce exp.</Term>, cell: (c) => <span className={`mono text-xs ${c.getValue() ? "text-bad" : "text-dim"}`}>{c.getValue() ? `${c.getValue()} signer(s)` : "none"}</span> }),
    h.accessor("lastChange", { header: "Last change", sortUndefined: "last", cell: (c) => <span className="mono text-xs text-chrome">{ago(c.getValue())}</span> }),
    h.accessor("verified", { header: "Verified", cell: (c) => (c.getValue() ? <Badge tone="ok">verified</Badge> : <Badge tone="warn">unverified</Badge>) }),
  ], []);
  const table = useReactTable({ data, columns: cols, state: { sorting, globalFilter: q }, onSortingChange: setSorting, onGlobalFilterChange: setQ, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel() });
  const cats = ["all", ...new Set(rows.map((r) => r.category))];
  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <label className="flex items-center gap-2 border hairline px-3 h-10 flex-1 min-w-48 max-w-sm">
          <span className="mono text-dim text-xs">/</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter protocols" aria-label="Filter protocols" className="bg-transparent outline-none mono text-sm flex-1" />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Category">
          {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`mono text-[11px] px-2.5 h-8 border ${cat === c ? "border-[var(--accent)] text-accent" : "hairline text-dim hover:text-ink"}`}>{c}</button>)}
        </div>
      </div>
      <div className="overflow-x-auto border hairline">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="bg-[var(--bg-2)]">
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>{g.headers.map((hd) => (
                <th key={hd.id} className="text-left font-normal label !text-[10px] !tracking-[0.18em] px-3 py-3 whitespace-nowrap">
                  <button onClick={hd.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-ink">
                    {flexRender(hd.column.columnDef.header, hd.getContext())}
                    <span className="text-dim">{{ asc: "↑", desc: "↓" }[hd.column.getIsSorted() as string] ?? ""}</span>
                  </button>
                </th>))}</tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-t hairline hover:bg-[var(--bg-2)]">{r.getVisibleCells().map((c) => <td key={c.id} className="px-3 py-3 whitespace-nowrap">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
