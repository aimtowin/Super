import { describe, expect, it } from 'vitest';
import { estimateWorkerMessageBytes, WorkerRequestBudget } from '../../src/main/worker-request-budget';

describe('Worker request admission budget', () => {
  it('reserves a separate cancellation lane and releases only the matching origin', () => {
    const budget = new WorkerRequestBudget<object>(2, 2000, 1), owner = {}, other = {};
    budget.reserve('a', owner, 'small'); budget.reserve('b', owner, 'small');
    expect(() => budget.reserve('c', owner, 'small')).toThrow(/busy/);
    budget.reserve('cancel', owner, 'cancel', true);
    expect(() => budget.reserve('cancel2', owner, 'cancel', true)).toThrow(/busy/);
    expect(budget.release('a', other)).toBe(false);
    expect(() => budget.reserve('c', owner, 'small')).toThrow();
    expect(budget.release('a', owner)).toBe(true);
    budget.reserve('c', owner, 'small');
    budget.releaseOwner(owner); budget.reserve('new', other, 'small');
  });
  it('bounds nested payload accounting without building a second JSON/base64 string', () => {
    const payload: Record<string, unknown> = {dataBase64: 'x'.repeat(1000)}; payload.self = payload;
    expect(estimateWorkerMessageBytes(payload, 100)).toBeGreaterThan(100);
    const budget = new WorkerRequestBudget<object>(100, 100);
    expect(() => budget.reserve('a', {}, payload)).toThrow();
  });
});
