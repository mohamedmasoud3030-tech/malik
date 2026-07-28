/**
 * Verifies that finance hub lazy loading is real, not just structural.
 *
 * `lazy(() => import(...))` in the source only pays off if the bundler actually
 * emits a separate chunk per section and the hub chunk merely references it.
 * If a future change turns one of those into a static import, the source still
 * looks lazy while the bundle silently ships every finance workspace up front.
 *
 * This checks the built output directly:
 *   1. the hub chunk exists and stays small (no inlined section bodies)
 *   2. each of the eight sections resolves to its own chunk
 *   3. the hub references each of those chunks as a dynamic import
 *
 * Run after `pnpm build`. Exits non-zero on failure so CI can gate on it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const assetsDir = resolve('dist/public/assets');

/** Chunk name prefixes Rollup derives from each section module. */
const expectedSectionChunks = {
  invoices: ['invoices-page-'],
  // The receipts body is shared with the standalone /receipts route, so Rollup
  // may name the shared chunk after either entry point.
  receipts: ['receipts-page-', '_protected.receipts-'],
  expenses: ['expenses-page-'],
  arrears: ['arrears-page-'],
  deposits: ['deposits-page-'],
  owner_settlements: ['owner-settlements-page-'],
  bank_reconciliation: ['bank-reconciliation-page-'],
  commissions: ['commissions-page-'],
};

const MAX_HUB_CHUNK_BYTES = 60_000;

let files;
try {
  files = readdirSync(assetsDir);
} catch {
  console.error(`Finance hub bundle check: no build output at ${assetsDir}. Run "pnpm build" first.`);
  process.exit(1);
}

const failures = [];

const hubChunk = files.find((file) => file.startsWith('finance-hub-workspace-') && file.endsWith('.js'));
if (!hubChunk) {
  console.error('Finance hub bundle check: finance-hub-workspace chunk was not emitted.');
  process.exit(1);
}

const hubSource = readFileSync(resolve(assetsDir, hubChunk), 'utf8');
const hubBytes = statSync(resolve(assetsDir, hubChunk)).size;

if (hubBytes > MAX_HUB_CHUNK_BYTES) {
  failures.push(`hub chunk is ${(hubBytes / 1024).toFixed(1)} KB (limit ${(MAX_HUB_CHUNK_BYTES / 1024).toFixed(0)} KB) — a section body is probably inlined`);
}

const report = [];
for (const [sectionId, prefixes] of Object.entries(expectedSectionChunks)) {
  const chunk = files.find((file) => prefixes.some((prefix) => file.startsWith(prefix)) && file.endsWith('.js'));

  if (!chunk) {
    failures.push(`${sectionId}: no dedicated chunk emitted (expected one of ${prefixes.join(', ')}*)`);
    report.push(`  FAIL ${sectionId.padEnd(20)} chunk=MISSING`);
    continue;
  }

  // The hub must reference the chunk by name, which is how Rollup wires a
  // dynamic import. A static import would have inlined it instead.
  if (!hubSource.includes(chunk)) {
    failures.push(`${sectionId}: hub chunk does not dynamically reference ${chunk} — the import is no longer lazy`);
    report.push(`  FAIL ${sectionId.padEnd(20)} chunk=${chunk} (not referenced)`);
    continue;
  }

  const kb = (statSync(resolve(assetsDir, chunk)).size / 1024).toFixed(1);
  report.push(`  ok   ${sectionId.padEnd(20)} ${chunk} (${kb} KB)`);
}

console.log(`Finance hub bundle check — hub chunk ${hubChunk} (${(hubBytes / 1024).toFixed(1)} KB)`);
console.log(report.join('\n'));

if (failures.length > 0) {
  console.error('\nFinance hub bundle check FAILED:\n' + failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('\nFinance hub bundle check passed: all 8 sections are separately chunked and lazily referenced.');
