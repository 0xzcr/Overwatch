/** Captures real account bytes from mainnet/devnet into /fixtures (read-only). */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { mainnetRpc, devnetRpc, type Rpc } from "@overwatch/solana";
import { decodeProgramAccount } from "@overwatch/core";

const out = new URL("../fixtures/", import.meta.url);
mkdirSync(out, { recursive: true });
const save = async (rpc: Rpc, net: string, name: string, address: string, slice?: { offset: number; length: number }) => {
  const a = await rpc.getAccount(address, slice);
  if (!a) throw new Error(`${name} ${address} missing on ${net}`);
  writeFileSync(new URL(`${name}.json`, out), JSON.stringify({ network: net, address, owner: a.owner, lamports: a.lamports, capturedAt: new Date().toISOString(), slice: slice ?? null, data: Buffer.from(a.data).toString("base64") }, null, 2));
  console.log(`saved ${name} (${a.data.length} bytes)`);
  return a;
};

const m = mainnetRpc();
const d = devnetRpc();
const programs = { drift: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH", kamino: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", squads: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf", solend: "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo", openbook: "opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb" };
for (const [k, id] of Object.entries(programs)) {
  const p = await save(m, "mainnet", `program-${k}`, id);
  await save(m, "mainnet", `programdata-${k}`, decodeProgramAccount(p.data).programDataAddress, { offset: 0, length: 45 });
}
await save(m, "mainnet", "multisig-drift", "7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM");
await save(m, "mainnet", "multisig-raydium", "tr8rgazUrZzgdkfc6Q622nVJHMMzh29trdBE2uBHb4u");
await save(m, "mainnet", "realms-governance-openbook", "CZoAmQErbMwhSNA5WtbWLcwGE1mhXEv4hTvyvvHXGkrr");
await save(m, "mainnet", "mint-usdc", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
await save(m, "mainnet", "mint-pyusd-t22", "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo");
await save(d, "devnet", "nonce-devnet", "4Hub1pDfV2MSG6Xq3Urg1H5NssTHAZXwpQeoiuk48YCb");
// admin-config adapter accounts
const { DRIFT_STATE_PDA, KAMINO_MAIN_MARKET, MARGINFI_MAIN_GROUP, ORCA_CONFIG } = await import("@overwatch/core");
await save(m, "mainnet", "admin-drift-state", DRIFT_STATE_PDA);
await save(m, "mainnet", "admin-kamino-market", KAMINO_MAIN_MARKET);
await save(m, "mainnet", "admin-marginfi-group", MARGINFI_MAIN_GROUP);
await save(m, "mainnet", "admin-orca-config", ORCA_CONFIG);
