import { mainnetRpc } from "../../packages/solana/src/index";
import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519";
const rpc = mainnetRpc();
const ids = process.argv.slice(2);
for (const id of ids) {
  const p = await rpc.getAccount(id);
  if (!p) {
    console.log(id, "MISSING");
    continue;
  }
  if (p.owner !== "BPFLoaderUpgradeab1e11111111111111111111111") {
    console.log(id, "owner", p.owner);
    continue;
  }
  const pd = bs58.encode(p.data.slice(4, 36));
  const h = (await rpc.getAccount(pd, { offset: 0, length: 45 }))!;
  const dv = new DataView(h.data.buffer);
  const slot = dv.getBigUint64(4, true);
  const auth = h.data[12] ? bs58.encode(h.data.slice(13, 45)) : null;
  let info = "";
  if (auth) {
    const a = await rpc.getAccount(auth);
    let onCurve = true;
    try {
      ed25519.ExtendedPoint.fromHex(bs58.decode(auth));
    } catch {
      onCurve = false;
    }
    info = `owner=${a?.owner ?? "none"} len=${a?.data.length ?? 0} onCurve=${onCurve}`;
  }
  console.log(id, "slot", slot, "auth", auth, info);
}
