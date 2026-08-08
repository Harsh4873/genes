// Encrypts the Selection Lab dataset for publication.
//
// The site is static files on GitHub Pages, so there is no server to check a
// password against: anything the browser can fetch, anyone can fetch. The only
// way to publish this dataset without publishing its contents is to publish it
// encrypted, and let the browser decrypt it once the owner supplies the
// passphrase. What lands in the repository and on the CDN is ciphertext.
//
// Format (public/data/selection.enc), a JSON envelope of base64 fields:
//
//   { v, kdf: { name, hash, iterations, salt }, cipher: { name, iv }, ct }
//
// The plaintext is gzipped before encryption, because ciphertext does not
// compress on the wire and the dataset is ~1.3 MB of JSON.
//
// The passphrase is read from SELECTION_PASSPHRASE or ./.selection-passphrase
// and is never written to the repository. Rotating it means re-running this
// script and committing the new artefact; the old ciphertext stays readable
// with the old passphrase wherever it has already been copied, so treat a
// rotation as protecting future publication, not past.
//
// Run: SELECTION_PASSPHRASE='...' node scripts/encrypt-selection.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = resolve(here, '../', process.env.SELECTION_SOURCE_DIR ?? 'private');
const IN = resolve(SOURCE_DIR, 'selection.json');
const OUT = resolve(here, '../public/data/selection.enc');
const PASSPHRASE_FILE = resolve(here, '../.selection-passphrase');

/** OWASP's floor for PBKDF2-SHA256; the ciphertext is public, so this matters. */
export const ITERATIONS = 600_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export function readPassphrase() {
  const fromEnv = process.env.SELECTION_PASSPHRASE;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  if (existsSync(PASSPHRASE_FILE)) {
    const fromFile = readFileSync(PASSPHRASE_FILE, 'utf8').trim();
    if (fromFile) return fromFile;
  }
  throw new Error(
    'No passphrase. Set SELECTION_PASSPHRASE or write it to .selection-passphrase (both are gitignored).',
  );
}

export function encrypt(plaintext, passphrase) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_BYTES, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(plaintext, { level: 9 })), cipher.final()]);
  // WebCrypto expects the GCM tag appended to the ciphertext.
  const ct = Buffer.concat([body, cipher.getAuthTag()]);
  return {
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: salt.toString('base64') },
    cipher: { name: 'AES-GCM', iv: iv.toString('base64') },
    compression: 'gzip',
    ct: ct.toString('base64'),
  };
}

export function encryptSelection() {
  if (!existsSync(IN)) {
    throw new Error(`${IN} is missing. Run "npm run build:selection" first.`);
  }
  const plaintext = readFileSync(IN);
  const envelope = encrypt(plaintext, readPassphrase());
  writeFileSync(OUT, JSON.stringify(envelope));
  const size = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`Encrypted ${size(plaintext.length)} -> ${OUT} (${size(Buffer.byteLength(JSON.stringify(envelope)))})`);
  console.log(`  PBKDF2-SHA256, ${ITERATIONS.toLocaleString()} iterations, AES-256-GCM`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) encryptSelection();
