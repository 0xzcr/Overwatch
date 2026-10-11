import { readPubkey } from "../base58";

/** UpgradeableLoaderState::Program — u32 discriminant 2, then programdata pubkey (36 bytes). */
export function decodeProgramAccount(data: Uint8Array): { programDataAddress: string } {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 36) throw new Error(`program account too short: ${data.length}`);
  const tag = dv.getUint32(0, true);
  if (tag !== 2) throw new Error(`not an UpgradeableLoaderState::Program (tag=${tag})`);
  return { programDataAddress: readPubkey(data, 4) };
}

export const PROGRAMDATA_HEADER_LEN = 45;

/** UpgradeableLoaderState::ProgramData — u32 tag 3, u64 slot, Option<Pubkey>. */
export function decodeProgramDataHeader(data: Uint8Array): { slot: number; upgradeAuthority: string | null } {
  if (data.length < 13) throw new Error(`programdata too short: ${data.length}`);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = dv.getUint32(0, true);
  if (tag !== 3) throw new Error(`not an UpgradeableLoaderState::ProgramData (tag=${tag})`);
  const slot = Number(dv.getBigUint64(4, true));
  const some = data[12];
  if (some === 0) return { slot, upgradeAuthority: null };
  if (some !== 1) throw new Error(`bad option tag ${some}`);
  return { slot, upgradeAuthority: readPubkey(data, 13) };
}
