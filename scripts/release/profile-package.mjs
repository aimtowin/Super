#!/usr/bin/env node
/** Read-only filesystem timings. Never a build receipt or release authorization. */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectPackagePayload } from './build-provenance.mjs';

const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));

export async function profilePackage({ repoRoot, packageRoot, platform, concurrency = [4], rounds = 2 }) {
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 5) {
    throw new RangeError('Profiling rounds must be an integer from 1 to 5.');
  }
  if (!Array.isArray(concurrency) || concurrency.length < 1 || concurrency.length > 8
    || concurrency.some((width) => !Number.isSafeInteger(width) || width < 1 || width > 8)) {
    throw new RangeError('Profiling concurrency must contain 1 to 8 integer widths between 1 and 8.');
  }
  const samples = [];
  let expected;
  for (let round = 1; round <= rounds; round++) {
    // Reverse every other round to expose warm filesystem cache/order bias.
    const widths = round % 2 === 1 ? concurrency : [...concurrency].reverse();
    for (const width of widths) {
      const inspection = await inspectPackagePayload({ repoRoot, packageRoot, platform, concurrency: width });
      const encoded = JSON.stringify(inspection.files);
      if (expected === undefined) expected = encoded;
      else if (encoded !== expected) throw new Error('Payload changed between profiling samples; results cannot be compared.');
      samples.push({ round, fingerprint: createHash('sha256').update(encoded).digest('hex'), metrics: inspection.metrics });
    }
  }
  return { mode: 'payload-inspection-only', provenanceVerified: false, platform, samples };
}

function argumentsFrom(argv) {
  const known = new Set(['--repo-root', '--package-dir', '--platform', '--concurrency', '--rounds']);
  const values = new Map();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (!known.has(flag) || values.has(flag)) throw new Error(`Unknown or repeated profile option: ${flag}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    values.set(flag, value);
  }
  const repoRoot = path.resolve(values.get('--repo-root') ?? defaultRoot);
  const platform = values.get('--platform') ?? `${process.platform}-${process.arch}`;
  const packageRoot = path.resolve(repoRoot, values.get('--package-dir') ?? `out/Super-${platform}`);
  return { repoRoot, packageRoot, platform,
    concurrency: (values.get('--concurrency') ?? '4').split(',').map(Number), rounds: Number(values.get('--rounds') ?? '2') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const result = await profilePackage(argumentsFrom(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
