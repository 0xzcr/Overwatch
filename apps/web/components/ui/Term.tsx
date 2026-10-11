"use client";
import { useState } from "react";

export const GLOSSARY: Record<string, string> = {
  multisig: "A wallet that needs several people to approve a transaction (for example 3 of 5). Safer than one key, if enough different people must sign.",
  timelock: "A mandatory waiting period between approving a change and it taking effect. It gives depositors time to withdraw if something bad is approved.",
  "durable nonce": "A Solana feature that lets a transaction be signed now and submitted any time later. Normal transactions expire in about a minute. The Drift attacker collected pre-signed durable-nonce transactions from signers days in advance.",
  "upgrade authority": "The key that can replace a program's code. Whoever holds it can change the rules, including how your deposit can be withdrawn.",
  threshold: "How many signers of a multisig must approve a change.",
  "config authority": "A Squads setting that lets one key change the multisig's signers, threshold and timelock instantly, without a vote.",
  "permanent delegate": "A Token-2022 power that lets the issuer move or burn tokens from any holder's account.",
  oracle: "The price feed a protocol uses to value collateral. A stale or manipulated oracle can let attackers borrow against fake value.",
  pda: "Program Derived Address: an address controlled by a program rather than a private key.",
};

export function Term({ t, children }: { t: keyof typeof GLOSSARY | string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const text = GLOSSARY[t.toLowerCase()];
  return (
    <span className="relative inline-block">
      <button type="button" className="underline decoration-dotted decoration-[var(--dim)] underline-offset-4 cursor-help" onClick={() => setOpen((o) => !o)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} aria-expanded={open}>
        {children ?? t}
        <span className="sr-only"> — what does this mean?</span>
      </button>
      {open && text && (
        <span role="tooltip" className="panel absolute z-50 left-0 top-full mt-2 w-72 p-3 text-xs leading-relaxed text-chrome normal-case tracking-normal font-sans">
          <span className="label block mb-1 text-accent">What does this mean?</span>
          {text}
        </span>
      )}
    </span>
  );
}
