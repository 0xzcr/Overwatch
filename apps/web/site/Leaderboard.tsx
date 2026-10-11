"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import type { ProtoCard } from "./data";

const h = createColumnHelper<ProtoCard>();
const WORD: Record<string, string> = { A: "Strong", B: "Good", C: "Caution", D: "Weak", F: "Dangerous" };

const ago = (iso: string | null) => {
  if (!iso) return "—";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

function Th({ label, tip }: { label: string; tip?: string }) {
  if (!tip) return <>{label}</>;
  return (
    <span className="term" tabIndex={0}>
      {label}
      <span className="term__tip" role="tooltip">
        <b className="mono">What does this mean?</b>
        {tip}
      </span>
    </span>
  );
}

const TIPS = {
  authority: "The key that can replace a program's code. Whoever holds it can change the rules, including how your deposit can be withdrawn.",
  threshold: "How many signers of the multisig must approve a change, out of how many members.",
  timelock: "A mandatory waiting period between approving a change and it taking effect. It gives depositors time to withdraw.",
  nonce: "Signers holding durable nonce accounts can pre-sign transactions that never expire. That is how the Drift attack was staged.",
};

export function Leaderboard({ rows }: { rows: ProtoCard[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "score", desc: false }]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const data = useMemo(() => rows.filter((r) => cat === "all" || r.category === cat), [rows, cat]);
  const cats = useMemo(() => ["all", ...new Set(rows.map((r) => r.category))], [rows]);

  const cols = useMemo(
    () => [
      h.accessor("name", {
        header: "Protocol",
        cell: (c) => (
          <Link href={`/protocols/${c.row.original.slug}`} className="lb__name" data-cursor="Inspect">
            {c.row.original.red && <span className="dot dot--alert" aria-label="red" />}
            <b>{c.getValue()}</b>
            {c.row.original.source === "demo" && <span className="badge badge--accent mono">demo</span>}
          </Link>
        ),
      }),
      h.accessor("category", { header: "Category", cell: (c) => <span className="mono lb__dim">{c.getValue()}</span> }),
      h.accessor("tvlUsd", { header: "TVL", sortUndefined: "last", cell: (c) => <span className="mono">{c.row.original.tvl}</span> }),
      h.accessor("score", {
        header: "Grade",
        sortUndefined: "last",
        cell: (c) => (
          <span className={`grade grade--sm g-${c.row.original.grade}`}>
            <b>{c.row.original.grade}</b>
            <span className="mono">
              {c.getValue() ?? "—"} · {WORD[c.row.original.grade] ?? "Unscored"}
            </span>
          </span>
        ),
      }),
      h.accessor("authority", {
        header: () => <Th label="Upgrade authority" tip={TIPS.authority} />,
        cell: (c) => <span className={`mono${c.row.original.flags.includes("SINGLE_KEY") ? " bad" : ""}`}>{c.getValue()}</span>,
      }),
      h.accessor("threshold", {
        header: () => <Th label="m-of-n" tip={TIPS.threshold} />,
        cell: (c) => (
          <span className="mono">
            {c.getValue()}
            {c.row.original.controlled && (
              <span className="warn" title="Controlled multisig: one key can change it without a vote">
                {" "}
                ⚑
              </span>
            )}
          </span>
        ),
      }),
      h.accessor("timelockSec", {
        header: () => <Th label="Timelock" tip={TIPS.timelock} />,
        sortUndefined: "last",
        cell: (c) => <span className={`mono${c.getValue() === 0 ? " bad" : ""}`}>{c.row.original.timelock}</span>,
      }),
      h.accessor("nonceSigners", {
        header: () => <Th label="Nonce exposure" tip={TIPS.nonce} />,
        cell: (c) => <span className={`mono${c.getValue() ? " bad" : " lb__dim"}`}>{c.getValue() ? `${c.getValue()} signer(s)` : "none"}</span>,
      }),
      h.accessor("lastChange", { header: "Last change", sortUndefined: "last", cell: (c) => <span className="mono lb__dim">{ago(c.getValue())}</span> }),
      h.accessor("verified", {
        header: "Verified",
        cell: (c) => (c.getValue() ? <span className="badge badge--ok mono">verified</span> : <span className="badge badge--warn mono">unverified</span>),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns: cols,
    state: { sorting, globalFilter: q },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQ,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="lb">
      <div className="filters lb__filters">
        <label className="search" data-cursor="Search">
          <span className="search__icon" aria-hidden="true">
            ⌕
          </span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter protocols" aria-label="Filter protocols" />
        </label>
        <div className="chips" role="group" aria-label="Category">
          {cats.map((c) => (
            <button key={c} className={`chip${cat === c ? " is-on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="lb__wrap">
        <table className="lb__table">
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((hd) => (
                  <th key={hd.id} aria-sort={hd.column.getIsSorted() === "asc" ? "ascending" : hd.column.getIsSorted() === "desc" ? "descending" : "none"}>
                    <button onClick={hd.column.getToggleSortingHandler()} className="mono">
                      {flexRender(hd.column.columnDef.header, hd.getContext())}
                      <span className="lb__sort">{{ asc: "↑", desc: "↓" }[hd.column.getIsSorted() as string] ?? ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className={`g-${r.original.grade}`}>
                {r.getVisibleCells().map((c) => (
                  <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!table.getRowModel().rows.length && <p className="lb__empty mono">No protocols match.</p>}
      </div>
    </div>
  );
}
