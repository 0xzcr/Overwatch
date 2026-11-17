import "server-only";
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
/** USDC has 6 decimals on mainnet and devnet. */
const USDC_DECIMALS = 6;

/** The associated token account of `owner` for `mint` (where wallets keep that token). */
export function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM,
  )[0];
}

/** Creates the treasury's token account if it is missing (instruction 1 = CreateIdempotent: no-op when it exists). */
function createAtaIdempotent(payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey) {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

/**
 * SPL Token TransferChecked (instruction 12): amount as u64 little-endian, then decimals. The invoice's reference
 * rides along as a read-only key, so the payment can be found by looking up the reference (Solana Pay convention).
 */
function transferChecked(o: {
  source: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  owner: PublicKey;
  amount: bigint;
  reference: PublicKey;
}) {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0);
  data.writeBigUInt64LE(o.amount, 1);
  data.writeUInt8(USDC_DECIMALS, 9);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: o.source, isSigner: false, isWritable: true },
      { pubkey: o.mint, isSigner: false, isWritable: false },
      { pubkey: o.destination, isSigner: false, isWritable: true },
      { pubkey: o.owner, isSigner: true, isWritable: false },
      { pubkey: o.reference, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** An unsigned USDC payment from `payer` to the treasury, ready for the payer's wallet to sign and send. */
export function buildUsdcPayment(o: {
  payer: string;
  treasury: string;
  mint: string;
  amount: bigint;
  reference: string;
  recentBlockhash: string;
}): Uint8Array {
  const payer = new PublicKey(o.payer);
  const treasury = new PublicKey(o.treasury);
  const mint = new PublicKey(o.mint);
  const destination = associatedTokenAddress(treasury, mint);
  const tx = new Transaction({ feePayer: payer, recentBlockhash: o.recentBlockhash });
  tx.add(createAtaIdempotent(payer, destination, treasury, mint));
  tx.add(
    transferChecked({
      source: associatedTokenAddress(payer, mint),
      mint,
      destination,
      owner: payer,
      amount: o.amount,
      reference: new PublicKey(o.reference),
    }),
  );
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}
