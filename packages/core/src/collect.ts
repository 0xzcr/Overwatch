import { classifyAuthority } from "./classify";
import { classifyOracleOwner } from "./constants/oracles";
import { SQUADS_V4, SYSTEM_PROGRAM } from "./constants/programs";
import type { ProtocolConfig } from "./config";
import { decodeProgramAccount, decodeProgramDataHeader, PROGRAMDATA_HEADER_LEN } from "./decoders/loader";
import { decodeNonce, NONCE_ACCOUNT_LEN, NONCE_AUTHORITY_OFFSET } from "./decoders/nonce";
import {
  CONFIG_TX_DISCRIMINATOR, decodeConfigTransaction, decodeMultisig, decodeProposal, findVaultIndex, MULTISIG_FIELD_OFFSET,
  pendingFrom, PROPOSAL_DISCRIMINATOR,
} from "./decoders/squads";
import { decodeMint } from "./decoders/token";
import { encode } from "./base58";
import { adapters } from "./adapters/index";
import type { ControlSnapshot, MultisigFacts, NonceFacts, ProgramFacts } from "./types";

export interface Acc { address: string; owner: string; lamports: number; data: Uint8Array }
/** Structural subset of @overwatch/solana Rpc, so core stays transport-agnostic. */
export interface AccountReader {
  getSlot(): Promise<number>;
  getMultipleAccounts(a: string[], slice?: { offset: number; length: number }): Promise<(Acc | null)[]>;
  getProgramAccounts(program: string, filters: unknown[], slice?: { offset: number; length: number }): Promise<Acc[]>;
}

export interface CollectOptions {
  /** skip nonce scan (expensive; reconciler runs it hourly) and reuse these */
  nonces?: NonceFacts[];
  scanNonces?: boolean;
  scanProposals?: boolean;
  warn?: (m: string) => void;
}

export interface CollectResult { snapshot: ControlSnapshot; warnings: string[]; nonceScan: "ok" | "skipped" | "unsupported" }

export async function collectSnapshot(rpc: AccountReader, cfg: ProtocolConfig, opts: CollectOptions = {}): Promise<CollectResult> {
  const warnings: string[] = [];
  const warn = (m: string) => { warnings.push(m); opts.warn?.(m); };
  const slot = await rpc.getSlot();

  // 1. programs → programdata → authority
  const progAccs = await rpc.getMultipleAccounts(cfg.programs.map((p) => p.id));
  const pdAddrs = progAccs.map((a, i) => {
    if (!a) { warn(`program ${cfg.programs[i]!.id} not found`); return null; }
    try { return decodeProgramAccount(a.data).programDataAddress; } catch (e) { warn(`program ${a.address}: ${(e as Error).message}`); return null; }
  });
  const pdAccs = await rpc.getMultipleAccounts(pdAddrs.filter((x): x is string => !!x), { offset: 0, length: PROGRAMDATA_HEADER_LEN });
  const pdMap = new Map(pdAccs.filter((x): x is Acc => !!x).map((a) => [a.address, decodeProgramDataHeader(a.data)]));

  // 2. multisigs
  const msAccs = await rpc.getMultipleAccounts(cfg.multisigs.map((m) => m.address));
  const multisigs: MultisigFacts[] = [];
  for (const [i, m] of cfg.multisigs.entries()) {
    const a = msAccs[i];
    if (!a || a.owner !== SQUADS_V4) { warn(`multisig ${m.address} missing or not owned by Squads v4`); continue; }
    try {
      multisigs.push({ ...decodeMultisig(m.address, a.data, m.vault_index, m.role), pending: [] });
    } catch (e) { warn(`multisig ${m.address}: ${(e as Error).message}`); }
  }

  const auths = cfg.programs.map((_, i) => (pdAddrs[i] ? pdMap.get(pdAddrs[i]!)?.upgradeAuthority ?? null : null));
  const authAccs = await rpc.getMultipleAccounts(auths.filter((x): x is string => !!x));
  const authOwner = new Map(authAccs.map((a, i) => [auths.filter((x): x is string => !!x)[i]!, a?.owner ?? null]));

  const programs: ProgramFacts[] = [];
  for (const [i, p] of cfg.programs.entries()) {
    const pd = pdAddrs[i] ? pdMap.get(pdAddrs[i]!) : undefined;
    if (!pd) continue;
    const auth = pd.upgradeAuthority;
    const ms = auth ? multisigs.find((m) => findVaultIndex(m.address, auth) !== null) : undefined;
    programs.push({
      programId: p.id, label: p.label, programDataAddress: pdAddrs[i]!, lastDeploySlot: pd.slot, upgradeAuthority: auth,
      authorityOwner: auth ? authOwner.get(auth) ?? null : null,
      authorityKind: classifyAuthority({ authority: auth, owner: auth ? authOwner.get(auth) ?? null : null, squadsV4VaultMatch: !!ms }),
      multisig: ms?.address ?? null,
    });
  }

  // 3. pending config proposals (gPA memcmp on multisig field)
  if (opts.scanProposals !== false) {
    for (const ms of multisigs) {
      try {
        const filt = (disc: Uint8Array) => [
          { memcmp: { offset: 0, bytes: encode(disc) } },
          { memcmp: { offset: MULTISIG_FIELD_OFFSET, bytes: ms.address } },
        ];
        const [props, cfgs] = await Promise.all([
          rpc.getProgramAccounts(SQUADS_V4, filt(PROPOSAL_DISCRIMINATOR)),
          rpc.getProgramAccounts(SQUADS_V4, filt(CONFIG_TX_DISCRIMINATOR)),
        ]);
        ms.pending = pendingFrom(ms, props.map((p) => decodeProposal(p.data)), cfgs.map((c) => ({ address: c.address, ...decodeConfigTransaction(c.data) })));
      } catch (e) { warn(`proposals for ${ms.address}: ${(e as Error).message}`); }
    }
  }

  // 4. nonce accounts for signers
  let nonceScan: CollectResult["nonceScan"] = "skipped";
  let nonces = opts.nonces ?? [];
  if (opts.scanNonces) {
    const signers = [...new Set(multisigs.flatMap((m) => m.members.map((x) => x.key)))];
    const found: NonceFacts[] = [];
    nonceScan = "ok";
    for (const s of signers) {
      try {
        const accs = await rpc.getProgramAccounts(SYSTEM_PROGRAM, [{ dataSize: NONCE_ACCOUNT_LEN }, { memcmp: { offset: NONCE_AUTHORITY_OFFSET, bytes: s } }]);
        for (const a of accs) { const n = decodeNonce(a.address, a.data); if (n) found.push(n); }
      } catch (e) {
        nonceScan = "unsupported";
        warn(`nonce scan unsupported by RPC (${(e as Error).message}); falling back to transaction stream`);
        break;
      }
    }
    if (nonceScan === "ok") nonces = found;
  }

  // 5. collateral + oracles + adapters
  const mintAccs = await rpc.getMultipleAccounts(cfg.collateral_mints);
  const mints = mintAccs.flatMap((a) => { if (!a) return []; try { return [decodeMint(a.address, a.owner, a.data)]; } catch (e) { warn(`mint ${a.address}: ${(e as Error).message}`); return []; } });
  const adapter = adapters.get(cfg.slug);
  const admin = [];
  if (adapter) {
    const accs = await rpc.getMultipleAccounts(adapter.accounts());
    for (const a of accs) if (a) { try { admin.push(adapter.decode(a)); } catch (e) { warn(`adapter ${cfg.slug}: ${(e as Error).message}`); } }
  }
  const oracleAddrs = [...new Set([...cfg.oracles, ...admin.flatMap((a) => a.oracles)])];
  const orAccs = await rpc.getMultipleAccounts(oracleAddrs);
  const progIds = cfg.programs.map((p) => p.id);
  const oracles = orAccs.flatMap((a) => (a ? [{ address: a.address, owner: a.owner, ...classifyOracleOwner(a.owner, progIds) }] : []));

  return {
    snapshot: { protocol: cfg.slug, slot, takenAt: new Date().toISOString(), programs, multisigs, nonces, mints, oracles, admin, verified: cfg.verified },
    warnings,
    nonceScan,
  };
}
