// Checks or refreshes the checked-in HTML snapshot used by build-dataset.mjs.
// The check mode is deliberately read-only so it is safe for scheduled CI.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataset, SNAPSHOT_PATH, UPSTREAM_URL } from './build-dataset.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const snapshotFile = resolve(here, '../', SNAPSHOT_PATH);
const mode = process.argv[2];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchSnapshot() {
  const response = await fetch(UPSTREAM_URL, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html',
      'Cache-Control': 'no-cache',
      'User-Agent': 'MtbScope dataset snapshot check',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Could not fetch dataset snapshot: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('Upstream dataset snapshot was empty.');
  return bytes;
}

async function checkSnapshot(upstream) {
  const local = await readFile(snapshotFile);
  if (!local.equals(upstream)) {
    throw new Error(
      `Dataset snapshot drift detected.\n` +
      `  checked in: sha256:${sha256(local)}\n` +
      `  upstream:   sha256:${sha256(upstream)}\n` +
      'Run npm run data:refresh to intentionally update the snapshot and generated catalog.',
    );
  }

  console.log(`Dataset snapshot is current (sha256:${sha256(local)}).`);
}

async function refreshSnapshot(upstream) {
  await writeFile(snapshotFile, upstream);
  console.log(`Refreshed ${SNAPSHOT_PATH} (sha256:${sha256(upstream)}).`);
  buildDataset();
}

async function main() {
  if (mode !== '--check' && mode !== '--refresh') {
    throw new Error('Usage: node scripts/refresh-dataset.mjs --check|--refresh');
  }

  const upstream = await fetchSnapshot();
  if (mode === '--check') await checkSnapshot(upstream);
  else await refreshSnapshot(upstream);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
