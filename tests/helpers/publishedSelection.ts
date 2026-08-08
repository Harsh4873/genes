import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlock, type Envelope } from '../../src/lib/lockbox';

// The published dataset ships encrypted, so tests that assert against the real
// numbers need the passphrase. Without it they skip, the way the Firestore
// rules tests in the sibling repos skip without an emulator — the statistics
// themselves stay covered either way.

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');

function passphrase(): string | null {
  const fromEnv = process.env.SELECTION_PASSPHRASE?.trim();
  if (fromEnv) return fromEnv;
  const file = resolve(ROOT, '.selection-passphrase');
  if (!existsSync(file)) return null;
  const value = readFileSync(file, 'utf8').trim();
  return value || null;
}

/** The decrypted payload, or null when this checkout cannot open it. */
export async function publishedSelectionJson(): Promise<unknown | null> {
  const secret = passphrase();
  const file = resolve(ROOT, 'public/data/selection.enc');
  if (!secret || !existsSync(file)) return null;
  const envelope = JSON.parse(readFileSync(file, 'utf8')) as Envelope;
  return JSON.parse(await unlock(envelope, secret)) as unknown;
}
