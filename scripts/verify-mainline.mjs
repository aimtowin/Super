import { MAINLINE_STAGES } from './release/gate-manifest.mjs';
import { runGates } from './release/run-gates.mjs';

const gateEnvironment = process.platform === 'darwin' && process.arch === 'arm64'
  ? { ...process.env, SUPER_REQUIRE_REAL_MEDIA: '1' }
  : process.env;

const report = runGates({
  stages: MAINLINE_STAGES, root: process.cwd(), environment: gateEnvironment,
  onResult: (result) => process.stdout.write(`[verify:mainline] ${result.id}: ${result.status} (${result.reason})\n`),
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.exitCode;
