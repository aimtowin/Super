import { describe, expect, it } from 'vitest';
import { OpenReconciliationGate } from '../../src/worker/open-reconciliation-gate';

describe('open reconciliation scheduling', () => {
  it('does not schedule another full scan after each directory browse', () => {
    const gate = new OpenReconciliationGate();
    gate.open('library');
    const ticket = gate.postpone('library')!;
    expect(gate.claim('library', ticket)).toBe(true);
    expect(gate.postpone('library')).toBeUndefined();
    expect(gate.claim('library', ticket)).toBe(false);
  });

  it('invalidates older callbacks while browsing and across close/reopen', () => {
    const gate = new OpenReconciliationGate();
    gate.open('library');
    const older = gate.postpone('library')!;
    const current = gate.postpone('library')!;
    expect(gate.claim('library', older)).toBe(false);
    gate.close('library');
    gate.open('library');
    expect(gate.claim('library', current)).toBe(false);
    expect(gate.claim('library', gate.postpone('library')!)).toBe(true);
  });
});
