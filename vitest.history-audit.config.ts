import { defineConfig } from 'vitest/config';

// Deliberately separate from the normal green regression suite. These probes
// assert desired behaviour, not the continued existence of a known bug.
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 120_000,
    include: ['tests/audit/library-safety-audit.test.ts'],
    fileParallelism: false,
  },
});
