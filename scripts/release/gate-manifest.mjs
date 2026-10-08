/** Explicit regression inventory: no broad E2E glob (NAS/benchmarks are opt-in). */
export const DEFAULT_E2E_FILES = Object.freeze([
  'tests/e2e/library-lifecycle.test.ts',
  'tests/e2e/critical-confirmation.test.ts',
  'tests/e2e/asset-ingestion.test.ts',
  'tests/e2e/process-lifecycle.test.ts',
  'tests/e2e/linked-folders.test.ts',
  'tests/e2e/organization-search-trash.test.ts',
  'tests/e2e/organization-metadata-persistence.test.ts',
  'tests/e2e/media-preview.test.ts',
  'tests/e2e/media-video-playback.test.ts',
  'tests/e2e/asset-pagination.test.ts',
  'tests/e2e/desktop-ingestion.test.ts',
  'tests/e2e/managed-move.test.ts',
  'tests/e2e/browsing-preferences.test.ts',
  'tests/e2e/trash-relink-flow.test.ts',
  'tests/e2e/context-menu.test.ts',
  'tests/e2e/selection-marquee.test.ts',
  'tests/e2e/shell-navigation.test.ts',
  'tests/e2e/folder-create-root.test.ts',
  'tests/e2e/library-recent.test.ts',
  'tests/e2e/folder-context-menu.test.ts',
  'tests/e2e/asset-rename.test.ts',
  'tests/e2e/folder-recursive-scope.test.ts',
  'tests/e2e/windows-typography.test.ts',
  'tests/e2e/tag-management.test.ts',
  'tests/e2e/automation-script-rating.test.ts',
  'tests/e2e/plugin-management.test.ts',
  'tests/e2e/plugin-standard-host-activation.test.ts',
  'tests/e2e/plugin-trusted-host-activation.test.ts',
  'tests/e2e/filter-interaction.test.ts',
  'tests/e2e/preview-background-refresh.test.ts',
  'tests/e2e/ai-inspector-refresh.test.ts',
  'tests/e2e/task-status-polling.test.ts',
  'tests/e2e/import-conflict-flows.test.ts',
  'tests/e2e/tray-watcher-recovery.test.ts',
  'tests/e2e/sidebar-emoji.test.ts',
  'tests/e2e/metadata-version-semantics.test.ts',
]);

export const GATE_STAGES = Object.freeze(['contract', 'development', 'native-updater', 'package']);
export const MAINLINE_STAGES = Object.freeze(['contract', 'development', 'native-updater']);
export const GATE_STATUSES = Object.freeze(['PASS', 'FAIL', 'SKIP', 'NOT_RUN', 'BLOCKED']);

export function getDefaultE2EFiles() {
  return [...DEFAULT_E2E_FILES];
}

// Positional Playwright file/path filters replace defaults; flags alone retain
// the suite. In particular, a --grep value that looks like a filename is not a
// file filter. Keep the existing CLI pass-through, without shell parsing.
export function resolveE2EArguments(argv) {
  const valueOptions = new Set(['--browser', '-c', '--config', '-g', '--grep', '-G', '--grep-invert', '-j', '--workers',
    '--global-timeout', '--max-failures', '--output', '--project', '--repeat-each', '--reporter',
    '--retries', '--shard', '--timeout', '--trace', '--tsconfig', '--ui-host', '--ui-port',
    '--test-list', '--test-list-invert', '--last-failed-file', '--run-agents', '--update-source-method']);
  const optionalModes = new Map([
    ['--debug', ['inspector', 'cli']],
    ['--update-snapshots', ['all', 'changed', 'missing', 'none']],
    ['-u', ['all', 'changed', 'missing', 'none']],
  ]);
  let positional = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') { positional = index + 1 < argv.length; break; }
    if (argument === '--project' || argument.startsWith('--project=')) {
      while (argv[index + 1] && !argv[index + 1].startsWith('-')) index += 1;
      continue;
    }
    if (optionalModes.has(argument)) {
      // Bare --debug/-u must not swallow a following explicit test file.
      if (optionalModes.get(argument).includes(argv[index + 1])) index += 1;
      continue;
    }
    if (argument === '--only-changed') {
      if (argv[index + 1] && !argv[index + 1].startsWith('-')) index += 1;
      continue;
    }
    if (valueOptions.has(argument)) { index += 1; continue; }
    if (!argument.startsWith('-')) { positional = true; break; }
  }
  return positional ? [...argv] : [...getDefaultE2EFiles(), ...argv];
}

function gate(id, stage, command, argv, capabilities = ['npm'], platform = 'all') {
  return Object.freeze({
    id, stage, command, argv: Object.freeze(argv), capabilities: Object.freeze(capabilities), platform,
    required: true,
    preconditions: Object.freeze(stage === 'development'
      ? ['exclusive .vite build directory', 'isolated fixture libraries and userData', 'workers=1']
      : stage === 'native-updater'
        ? ['fresh owned preview directory', 'interactive Windows desktop', 'no installed-app update']
        : stage === 'package' ? ['separate packaging authorization', 'fresh package evidence'] : []),
    evidence: stage === 'development' ? 'per-test Playwright JSON and traces'
      : stage === 'native-updater' ? 'fresh compiled fixture binaries, 9 scenarios, logs and screenshots'
        : 'command exit status; gate results JSON',
  });
}

export const RELEASE_GATES = Object.freeze([
  ...['lint', 'typecheck', 'extension:verify', 'test:library-availability', 'test', 'test:perf:search']
    .map((alias) => gate(alias, 'contract', 'npm', ['run', alias])),
  gate('development-e2e', 'development', 'node', ['scripts/run-e2e.mjs', '--workers=1'], ['electron', 'desktop']),
  gate('native-updater', 'native-updater', 'native-updater-fixture', ['scripts/release/preview-update-ui.iss'],
    ['iscc', 'csc', 'pwsh', 'desktop'], ['win32']),
  gate('package', 'package', 'npm', ['run', 'package']),
  gate('verify-package', 'package', 'npm', ['run', 'verify:package']),
  gate('packaged-startup', 'package', 'npm', ['run', 'test:e2e:packaged'], ['npm', 'electron', 'desktop']),
]);

export function getGateManifest(stages = GATE_STAGES) {
  for (const stage of stages) {
    if (!GATE_STAGES.includes(stage)) throw new Error(`Unknown gate stage: ${stage}`);
  }
  return RELEASE_GATES.filter((entry) => stages.includes(entry.stage));
}

export function getGate(id) {
  const entry = RELEASE_GATES.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown release gate: ${id}`);
  return entry;
}
