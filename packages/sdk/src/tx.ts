// Write-side instruction builders. Boundary: uses @solana/web3.js v1 (shared with @sqds/multisig).
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { REGISTRY_PROGRAM_ID, VAULT_PROGRAM_ID, protocolIdBytes } from "./registry";

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const D = {
  initialize: [175, 175, 109, 31, 13, 152, 155, 237],
  add_publisher: [38, 8, 234, 44, 75, 29, 163, 146],
  remove_publisher: [91, 64, 158, 101, 76, 157, 68, 102],
  set_admin: [251, 163, 0, 52, 91, 194, 187, 92],
  set_paused: [91, 60, 125, 192, 176, 225, 166, 218],
  upsert_risk: [100, 193, 6, 204, 191, 188, 65, 166],
  allocate: [64, 38, 189, 129, 24, 157, 82, 136],
  check_and_exit: [50, 231, 150, 138, 251, 99, 222, 82],
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  initialize_vault: [48, 191, 163, 44, 71, 129, 63, 164],
  reset_position: [26, 231, 79, 28, 18, 115, 223, 107],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
};
const u64 = (n: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
const data = (d: number[], ...parts: Uint8Array[]) => Buffer.concat([Buffer.from(d), ...parts]);
const m = (pubkey: PublicKey, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });
const pda = (seeds: (Buffer | Uint8Array)[], p: PublicKey) => PublicKey.findProgramAddressSync(seeds, p)[0];

export class RegistryIx {
  readonly program: PublicKey;
  constructor(programId = REGISTRY_PROGRAM_ID) {
    this.program = new PublicKey(programId);
  }
  config() {
    return pda([Buffer.from("config")], this.program);
  }
  risk(slug: string) {
    return pda([Buffer.from("risk"), protocolIdBytes(slug)], this.program);
  }
  initialize(payer: PublicKey, admin: PublicKey) {
    return new TransactionInstruction({
      programId: this.program,
      keys: [m(payer, true, true), m(this.config(), false, true), m(SystemProgram.programId)],
      data: data(D.initialize, admin.toBytes()),
    });
  }
  private admin(d: number[], admin: PublicKey, arg: Uint8Array) {
    return new TransactionInstruction({
      programId: this.program,
      keys: [m(admin, true), m(this.config(), false, true)],
      data: data(d, arg),
    });
  }
  addPublisher(admin: PublicKey, p: PublicKey) {
    return this.admin(D.add_publisher, admin, p.toBytes());
  }
  removePublisher(admin: PublicKey, p: PublicKey) {
    return this.admin(D.remove_publisher, admin, p.toBytes());
  }
  setAdmin(admin: PublicKey, n: PublicKey) {
    return this.admin(D.set_admin, admin, n.toBytes());
  }
  setPaused(admin: PublicKey, paused: boolean) {
    return this.admin(D.set_paused, admin, Uint8Array.of(paused ? 1 : 0));
  }
  upsertRisk(
    publisher: PublicKey,
    slug: string,
    score: number,
    grade: number,
    flags: bigint,
    lastEventSlot: number | bigint,
  ) {
    return new TransactionInstruction({
      programId: this.program,
      keys: [m(publisher, true, true), m(this.config()), m(this.risk(slug), false, true), m(SystemProgram.programId)],
      data: data(D.upsert_risk, protocolIdBytes(slug), Uint8Array.of(score, grade), u64(flags), u64(lastEventSlot)),
    });
  }
}

export class VaultIx {
  readonly program: PublicKey;
  readonly registry: RegistryIx;
  constructor(
    public mint: PublicKey,
    programId = VAULT_PROGRAM_ID,
    registryId = REGISTRY_PROGRAM_ID,
  ) {
    this.program = new PublicKey(programId);
    this.registry = new RegistryIx(registryId);
  }
  vault() {
    return pda([Buffer.from("vault"), this.mint.toBuffer()], this.program);
  }
  idle() {
    return pda([Buffer.from("idle"), this.vault().toBuffer()], this.program);
  }
  shareMint() {
    return pda([Buffer.from("shares"), this.vault().toBuffer()], this.program);
  }
  position(slug: string) {
    return pda([Buffer.from("position"), this.vault().toBuffer(), protocolIdBytes(slug)], this.program);
  }
  positionTokens(slug: string) {
    return pda([Buffer.from("position_tokens"), this.position(slug).toBuffer()], this.program);
  }
  initializeVault(manager: PublicKey, minScore: number) {
    return new TransactionInstruction({
      programId: this.program,
      data: data(D.initialize_vault, Uint8Array.of(minScore)),
      keys: [
        m(manager, true, true),
        m(this.mint),
        m(this.vault(), false, true),
        m(this.shareMint(), false, true),
        m(this.idle(), false, true),
        m(TOKEN_PROGRAM),
        m(SystemProgram.programId),
      ],
    });
  }
  private userIx(d: number[], user: PublicKey, userTokens: PublicKey, userShares: PublicKey, amount: bigint | number) {
    return new TransactionInstruction({
      programId: this.program,
      data: data(d, u64(amount)),
      keys: [
        m(user, true),
        m(this.vault()),
        m(this.idle(), false, true),
        m(this.shareMint(), false, true),
        m(userTokens, false, true),
        m(userShares, false, true),
        m(TOKEN_PROGRAM),
      ],
    });
  }
  deposit(user: PublicKey, userTokens: PublicKey, userShares: PublicKey, amount: bigint | number) {
    return this.userIx(D.deposit, user, userTokens, userShares, amount);
  }
  withdraw(user: PublicKey, userTokens: PublicKey, userShares: PublicKey, shares: bigint | number) {
    return this.userIx(D.withdraw, user, userTokens, userShares, shares);
  }
  allocate(manager: PublicKey, slug: string, amount: bigint | number) {
    return new TransactionInstruction({
      programId: this.program,
      data: data(D.allocate, protocolIdBytes(slug), u64(amount)),
      keys: [
        m(manager, true, true),
        m(this.vault(), false, true),
        m(this.mint),
        m(this.idle(), false, true),
        m(this.position(slug), false, true),
        m(this.positionTokens(slug), false, true),
        m(TOKEN_PROGRAM),
        m(SystemProgram.programId),
      ],
    });
  }
  checkAndExit(caller: PublicKey, slug: string) {
    return new TransactionInstruction({
      programId: this.program,
      data: data(D.check_and_exit),
      keys: [
        m(caller, true),
        m(this.vault(), false, true),
        m(this.idle(), false, true),
        m(this.position(slug), false, true),
        m(this.positionTokens(slug), false, true),
        m(this.registry.risk(slug)),
        m(TOKEN_PROGRAM),
      ],
    });
  }
  resetPosition(manager: PublicKey, slug: string) {
    return new TransactionInstruction({
      programId: this.program,
      data: data(D.reset_position),
      keys: [m(manager, true), m(this.vault()), m(this.position(slug), false, true), m(this.registry.risk(slug))],
    });
  }
}

/** Decoders for vault accounts. */
export function decodePosition(d: Uint8Array) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return {
    vault: new PublicKey(d.slice(8, 40)).toBase58(),
    protocolId: d.slice(40, 72),
    tokenAccount: new PublicKey(d.slice(72, 104)).toBase58(),
    allocated: dv.getBigUint64(104, true),
    shielded: d[112] === 1,
  };
}
export function decodeVault(d: Uint8Array) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return {
    manager: new PublicKey(d.slice(8, 40)).toBase58(),
    mint: new PublicKey(d.slice(40, 72)).toBase58(),
    shareMint: new PublicKey(d.slice(72, 104)).toBase58(),
    idle: new PublicKey(d.slice(104, 136)).toBase58(),
    totalAllocated: dv.getBigUint64(136, true),
    minScore: d[144]!,
  };
}
export const SHIELD_TRIGGERED_DISCRIMINATOR = [18, 135, 31, 17, 156, 54, 146, 166];
