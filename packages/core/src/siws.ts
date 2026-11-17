/**
 * Sign-in with a Solana wallet. The wallet signs a plain-text message (no transaction, no fee); the server checks
 * the signature against the address in the message. The format follows Sign-In With Solana (CAIP-122 style), which
 * wallets such as Phantom and Solflare display as a sign-in request.
 */
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

export interface SignInFields {
  domain: string;
  address: string;
  uri: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

export const SIGN_IN_STATEMENT = "Sign in to Overwatch. Signing is free and sends no transaction.";

/** The exact text the wallet signs. The server rebuilds it from trusted values and compares byte for byte. */
export function signInMessage(f: SignInFields): string {
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.address,
    "",
    SIGN_IN_STATEMENT,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
    "Chain ID: mainnet",
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expiration Time: ${f.expirationTime}`,
  ].join("\n");
}

/** True when `signature` (64 bytes) is `address`'s ed25519 signature over `message`. Never throws. */
export function verifyWalletSignature(address: string, message: string, signature: Uint8Array): boolean {
  try {
    const publicKey = bs58.decode(address);
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    return ed25519.verify(signature, new TextEncoder().encode(message), publicKey);
  } catch {
    return false;
  }
}

/** A valid Solana address: base58, 32 bytes. */
export function isAddress(value: string): boolean {
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}
