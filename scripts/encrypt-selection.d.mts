// Types for the publishing script, so the round-trip test can drive the real
// encryptor rather than a reimplementation of it.
import type { Envelope } from '../src/lib/lockbox';

export declare const ITERATIONS: number;
export declare function readPassphrase(): string;
export declare function encrypt(plaintext: Uint8Array, passphrase: string): Envelope;
export declare function encryptSelection(): void;
