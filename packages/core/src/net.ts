// Server-only (node:dns, node:net). Import from "@overwatch/core/net"; the package root stays browser-safe.
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
// Private, loopback, CGNAT, link-local (cloud metadata), benchmarking, multicast and reserved ranges.
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(net, bits, "ipv4");
// Unspecified, loopback, NAT64 (can smuggle the ranges above), unique-local, link-local, multicast. No ::ffff:0:0/96 rule:
// BlockList matches IPv4 lookups against mapped IPv6 rules, so it would block every IPv4 address; mapped ones are unwrapped below.
for (const [net, bits] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, bits, "ipv6");

/** "::ffff:127.0.0.1" or its normalised "::ffff:7f00:1" → "127.0.0.1"; anything else unchanged. */
function unmapV4(ip: string) {
  const m = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(ip);
  if (!m) return ip;
  if (m[1]) return m[1];
  const n = (parseInt(m[2]!, 16) << 16) | parseInt(m[3]!, 16);
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}
const isBlocked = (raw: string) => {
  const ip = unmapV4(raw);
  return blocked.check(ip, isIP(ip) === 4 ? "ipv4" : "ipv6");
};

/**
 * Why a webhook URL must not be called, or null when it may be. Refuses hosts that resolve to internal addresses, so a
 * subscriber can't make our servers request our own network or the cloud metadata service. WEBHOOK_ALLOW_PRIVATE_URLS=true
 * (local development and the pipeline smoke test only) allows http and private hosts.
 * shortcut: checks the address at resolve time, so DNS rebinding between this check and the request could slip through;
 * pin the resolved address in the HTTP client if webhooks ever run inside a network with sensitive internal services.
 */
export async function webhookUrlProblem(raw: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "not a valid URL";
  }
  const allowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE_URLS === "true";
  if (u.protocol !== "https:" && !(allowPrivate && u.protocol === "http:")) return "must use https";
  if (u.username || u.password) return "must not contain a username or password";
  if (allowPrivate) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) return "host does not resolve";
  if (addrs.some(isBlocked)) return "points to a private or internal address";
  return null;
}
