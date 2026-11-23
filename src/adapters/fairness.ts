/**
 * Provably-fair derivation (ADR-0005). WebCrypto SHA-256 (browser and Node ≥ 20).
 *   commitment = SHA-256(serverSeed)
 *   spin n     = SHA-256(`${serverSeed}:${clientSeed}:${nonce}:${n}`) → sector = u32(h[0..4]) mod sectors, offset = u16(h[4..6]) / 65536
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSeedHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type DerivedSpin = { readonly sectorIndex: number; readonly offset: number };

export async function deriveSpin(serverSeed: string, clientSeed: string, nonce: number, spin: number, sectors: number): Promise<DerivedSpin> {
  const h = await sha256Hex(`${serverSeed}:${clientSeed}:${nonce}:${spin}`);
  return { sectorIndex: (parseInt(h.slice(0, 8), 16) >>> 0) % sectors, offset: parseInt(h.slice(8, 12), 16) / 65536 };
}

export type TrialVerification = {
  readonly commitmentOk: boolean;
  readonly spinsOk: boolean;
  readonly derived: readonly DerivedSpin[];
};

export async function verifyTrial(input: {
  readonly serverSeed: string;
  readonly serverSeedHash: string;
  readonly clientSeed: string;
  readonly nonce: number;
  readonly sectors: number;
  readonly spins: readonly { readonly spin: number; readonly sectorIndex: number; readonly offset: number }[];
}): Promise<TrialVerification> {
  const commitmentOk = (await sha256Hex(input.serverSeed)) === input.serverSeedHash;
  const derived = await Promise.all(input.spins.map((s) => deriveSpin(input.serverSeed, input.clientSeed, input.nonce, s.spin, input.sectors)));
  const spinsOk = input.spins.every((s, i) => derived[i]?.sectorIndex === s.sectorIndex && Math.abs((derived[i]?.offset ?? -1) - s.offset) < 1e-9);
  return { commitmentOk, spinsOk, derived };
}
