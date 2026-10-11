import { describe, it, expect } from "vitest";
import { telegramHtml, backoffMs, MAX_ATTEMPTS, webhookPayload } from "../src/format";

const a = { name: "Kamino <Lend>", slug: "kamino-lend", severity: "CRITICAL", title: "Timelock removed", explanation: "2 people can now change the program instantly.", type: "TIMELOCK_REMOVED", txSignature: "abc", network: "mainnet", labels: ["Drift pattern"] };
describe("alert formatting", () => {
  it("escapes HTML and includes the what-you-can-do line and links", () => {
    const m = telegramHtml(a, "https://ow.example");
    expect(m).toContain("Kamino &lt;Lend&gt;");
    expect(m).toContain("What you can do:");
    expect(m).toContain("https://explorer.solana.com/tx/abc");
    expect(m).toContain("https://ow.example/protocols/kamino-lend");
    expect(m.startsWith("🚨")).toBe(true);
  });
  it("backs off exponentially, max 6 attempts", () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([10_000, 20_000, 40_000]);
    expect(MAX_ATTEMPTS).toBe(6);
  });
  it("webhook payload is versioned", () => {
    expect(webhookPayload({ ...a, id: 1, detectedAt: "x", slot: 2 }).version).toBe("2026-10-11");
  });
});
