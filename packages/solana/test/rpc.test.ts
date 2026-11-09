import { afterEach, describe, expect, it, vi } from "vitest";
import { Rpc } from "../src/rpc";

// A JSON-RPC success body for the given result.
const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
// A JSON-RPC error body, like a provider that blocks a method.
const refused = () =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "method blocked" } }));

/** Replaces fetch with a fake that answers per endpoint URL and records which URLs were called. */
function fakeFetch(answers: Record<string, (body: { method: string; params: unknown[] }) => Response>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    calls.push(url);
    return answers[url]!(JSON.parse(init.body));
  });
  return calls;
}

/**
 * An endpoint whose history starts at `firstSlot`: it answers the depth check with that slot and every other
 * request with `result`.
 */
const endpoint = (firstSlot: number, result: unknown) => (body: { method: string }) =>
  body.method === "getFirstAvailableBlock" ? ok(firstSlot) : ok(result);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Rpc failover", () => {
  it("uses the first endpoint when it works", async () => {
    const calls = fakeFetch({ "https://a": () => ok(42), "https://b": () => ok(7) });
    const rpc = new Rpc({ url: "https://a", fallbackUrls: ["https://b"] });
    expect(await rpc.getSlot()).toBe(42);
    expect(calls).toEqual(["https://a"]);
  });

  it("moves to the next endpoint when one is down", async () => {
    const calls = fakeFetch({ "https://a": () => new Response("", { status: 503 }), "https://b": () => ok(7) });
    const rpc = new Rpc({ url: "https://a", fallbackUrls: ["https://b"], maxRetries: 3 });
    expect(await rpc.getSlot()).toBe(7);
    expect(calls).toEqual(["https://a", "https://b"]);
    // The next request goes straight to the endpoint that worked.
    await rpc.getSlot();
    expect(calls.at(-1)).toBe("https://b");
  });

  it("tries another endpoint when a provider refuses the method", async () => {
    const calls = fakeFetch({ "https://a": refused, "https://b": () => ok(7) });
    const rpc = new Rpc({ url: "https://a", fallbackUrls: ["https://b"] });
    expect(await rpc.getSlot()).toBe(7);
    expect(calls).toEqual(["https://a", "https://b"]);
  });

  it("gives up once every endpoint has refused", async () => {
    const calls = fakeFetch({ "https://a": refused, "https://b": refused });
    const rpc = new Rpc({ url: "https://a", fallbackUrls: ["https://b"] });
    await expect(rpc.getSlot()).rejects.toThrow("method blocked");
    expect(calls).toEqual(["https://a", "https://b"]);
  });

  it("still throws a refusal straight away with a single endpoint", async () => {
    const calls = fakeFetch({ "https://a": refused });
    const rpc = new Rpc({ url: "https://a" });
    await expect(rpc.getSlot()).rejects.toThrow("method blocked");
    expect(calls).toEqual(["https://a"]);
  });

  it("goes back to the preferred endpoint once it has rested", async () => {
    let aDown = true;
    const calls = fakeFetch({
      "https://a": () => (aDown ? new Response("", { status: 503 }) : ok(1)),
      "https://b": () => ok(2),
    });
    const rpc = new Rpc({ url: "https://a", fallbackUrls: ["https://b"] });
    const now = Date.now();
    expect(await rpc.getSlot()).toBe(2);
    aDown = false;
    // Still inside the cooldown: stay on b.
    expect(await rpc.getSlot()).toBe(2);
    // Two minutes later: a is preferred again.
    vi.spyOn(Date, "now").mockReturnValue(now + 120_000);
    expect(await rpc.getSlot()).toBe(1);
    expect(calls.at(-1)).toBe("https://a");
  });
});

describe("Rpc transaction history", () => {
  const sig = [{ signature: "s1", slot: 5, err: null }];

  it("uses the shallowest endpoint that still reaches back far enough", async () => {
    const calls = fakeFetch({
      "https://archive": endpoint(0, sig),
      "https://recent": endpoint(900, sig),
    });
    const rpc = new Rpc({ url: "https://archive", fallbackUrls: ["https://recent"] });
    // Needs history from slot 950: the recent node covers it and is preferred.
    await rpc.getSignaturesForAddress("X", {}, 950);
    expect(calls.slice(-1)).toEqual(["https://recent"]);
    // Needs history from slot 100: only the archive reaches that far.
    await rpc.getSignaturesForAddress("X", {}, 100);
    expect(calls.slice(-1)).toEqual(["https://archive"]);
  });

  it("checks depth once, not on every call", async () => {
    const calls = fakeFetch({ "https://a": endpoint(0, sig) });
    const rpc = new Rpc({ url: "https://a" });
    await rpc.getSignaturesForAddress("X");
    await rpc.getSignaturesForAddress("X");
    expect(calls).toHaveLength(3);
  });

  it("defaults to archives only", async () => {
    const calls = fakeFetch({ "https://recent": endpoint(900, null), "https://archive": endpoint(0, null) });
    const rpc = new Rpc({ url: "https://recent", fallbackUrls: ["https://archive"] });
    await rpc.getTransaction("s1");
    expect(calls.at(-1)).toBe("https://archive");
  });

  it("still uses a shallow endpoint for account reads", async () => {
    const calls = fakeFetch({ "https://recent": endpoint(900, 9), "https://archive": endpoint(0, 1) });
    const rpc = new Rpc({ url: "https://recent", fallbackUrls: ["https://archive"] });
    expect(await rpc.getSlot()).toBe(9);
    expect(calls).toEqual(["https://recent"]);
  });

  it("fails loudly when no endpoint reaches back far enough", async () => {
    fakeFetch({ "https://recent": endpoint(900, sig) });
    const rpc = new Rpc({ url: "https://recent" });
    await expect(rpc.getSignaturesForAddress("X", {}, 100)).rejects.toThrow("no endpoint has transaction history");
  });

  it("checks depth again later when the check itself failed", async () => {
    let limited = true;
    fakeFetch({ "https://a": (body) => (limited ? new Response("", { status: 429 }) : endpoint(0, sig)(body)) });
    const rpc = new Rpc({ url: "https://a", maxRetries: 0 });
    await expect(rpc.getSignaturesForAddress("X")).rejects.toThrow("no endpoint has transaction history");
    limited = false;
    expect(await rpc.getSignaturesForAddress("X")).toEqual(sig);
  });
});
