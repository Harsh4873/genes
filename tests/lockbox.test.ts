import { describe, expect, it } from 'vitest';
import { LockedError, isEnvelope, unlock } from '../src/lib/lockbox';
import { encrypt } from '../scripts/encrypt-selection.mjs';

// The publishing script encrypts with node:crypto and the browser decrypts with
// Web Crypto, so the round trip is the thing worth testing: a payload sealed by
// the build must open in the app, and must not open any other way.

const PAYLOAD = JSON.stringify({ genes: [{ o: 'Rv0001', dpd: 0.5 }], note: 'secret until published' });

describe('lockbox', () => {
  it('opens a payload sealed by the build script', async () => {
    const envelope = encrypt(Buffer.from(PAYLOAD), 'correct horse battery staple');
    expect(isEnvelope(envelope)).toBe(true);
    await expect(unlock(envelope, 'correct horse battery staple')).resolves.toBe(PAYLOAD);
  });

  it('refuses a wrong passphrase at the authentication tag', async () => {
    const envelope = encrypt(Buffer.from(PAYLOAD), 'right');
    await expect(unlock(envelope, 'wrong')).rejects.toBeInstanceOf(LockedError);
    await expect(unlock(envelope, '')).rejects.toBeInstanceOf(LockedError);
  });

  it('refuses a tampered ciphertext even with the right passphrase', async () => {
    const envelope = encrypt(Buffer.from(PAYLOAD), 'right');
    const bytes = Buffer.from(envelope.ct, 'base64');
    bytes[10] ^= 0xff;
    await expect(unlock({ ...envelope, ct: bytes.toString('base64') }, 'right')).rejects.toBeInstanceOf(LockedError);
  });

  it('uses a fresh salt and IV every time, so the same payload seals differently', () => {
    const a = encrypt(Buffer.from(PAYLOAD), 'same');
    const b = encrypt(Buffer.from(PAYLOAD), 'same');
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('derives the key slowly enough to matter, since the ciphertext is public', () => {
    expect(encrypt(Buffer.from('x'), 'p').kdf.iterations).toBeGreaterThanOrEqual(600_000);
  });

  it('compresses before encrypting, so the published file is not inflated', () => {
    const repetitive = Buffer.from('{"a":1}'.repeat(4000));
    const envelope = encrypt(repetitive, 'p');
    expect(envelope.compression).toBe('gzip');
    expect(Buffer.from(envelope.ct, 'base64').length).toBeLessThan(repetitive.length / 4);
  });

  it('rejects anything that is not an envelope', () => {
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope({ genes: [] })).toBe(false);
    expect(isEnvelope({ v: 2, ct: 'x', kdf: {}, cipher: {} })).toBe(false);
  });

  it('refuses an envelope asking for an algorithm it does not implement', async () => {
    const envelope = encrypt(Buffer.from(PAYLOAD), 'p');
    await expect(unlock({ ...envelope, cipher: { ...envelope.cipher, name: 'AES-CBC' } }, 'p')).rejects.toBeInstanceOf(
      LockedError,
    );
  });
});
