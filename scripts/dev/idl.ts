import { PublicKey } from "@solana/web3.js";
import { inflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { mainnetRpc } from "@overwatch/solana";
const rpc = mainnetRpc();
mkdirSync("fixtures/idl", { recursive: true });
for (const [slug, id] of Object.entries({
  drift: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
  kamino: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
  marginfi: "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
  jupperps: "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu",
  orca: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  meteora: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  raydiumclmm: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
})) {
  const pid = new PublicKey(id);
  const [base] = PublicKey.findProgramAddressSync([], pid);
  const addr = await PublicKey.createWithSeed(base, "anchor:idl", pid);
  const a = await rpc.getAccount(addr.toBase58());
  if (!a) {
    console.log(slug, "no anchor IDL account");
    continue;
  }
  const len = new DataView(a.data.buffer, a.data.byteOffset).getUint32(40, true);
  const json = JSON.parse(inflateSync(Buffer.from(a.data.subarray(44, 44 + len))).toString());
  writeFileSync(`fixtures/idl/${slug}.json`, JSON.stringify(json));
  console.log(
    slug,
    "IDL",
    json.metadata?.spec ? "new-spec" : "legacy",
    json.version ?? json.metadata?.version,
    "accounts:",
    (json.accounts ?? [])
      .map((x: { name: string }) => x.name)
      .slice(0, 12)
      .join(","),
  );
}
