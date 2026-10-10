/** Reservations last until the origin's actual terminal, not the caller's timeout. */
export class WorkerRequestBudgetError extends Error {
  readonly code = 'WORKER_REQUEST_BACKPRESSURE';
  constructor() { super('Library Worker is busy. Wait for current tasks before retrying.'); }
}

export function estimateWorkerMessageBytes(value: unknown, cap = 128 * 1024 * 1024): number {
  const stack: unknown[] = [value], seen = new Set<object>(); let bytes = 0, nodes = 0;
  while (stack.length) {
    const item = stack.pop();
    if (++nodes > 1_000_000) return cap + 1;
    if (typeof item === 'string') bytes += item.length * 2 + 16;
    else if (typeof item === 'number' || typeof item === 'boolean') bytes += 8;
    else if (item && typeof item === 'object') {
      if (seen.has(item)) continue; seen.add(item); bytes += 32;
      if (ArrayBuffer.isView(item)) bytes += item.byteLength;
      else if (item instanceof ArrayBuffer) bytes += item.byteLength;
      else for (const [key, child] of Object.entries(item)) { bytes += key.length * 2; stack.push(child); }
    }
    if (bytes > cap) return bytes;
  }
  return bytes;
}

export class WorkerRequestBudget<Owner> {
  private readonly held = new Map<string, {owner: Owner; bytes: number; control: boolean}>();
  private bytes = 0;
  constructor(private readonly maxCount = 256, private readonly maxBytes = 128 * 1024 * 1024, private readonly controlSlots = 16) {}
  reserve(id: string, owner: Owner, payload: unknown, control = false): void {
    const size = estimateWorkerMessageBytes(payload, this.maxBytes);
    const normal = [...this.held.values()].filter(item => !item.control).length;
    const controls = this.held.size - normal;
    if (size > this.maxBytes || (control ? controls >= this.controlSlots : normal >= this.maxCount || this.bytes + size > this.maxBytes))
      throw new WorkerRequestBudgetError();
    this.held.set(id, {owner, bytes: size, control}); this.bytes += size;
  }
  release(id: string, owner: Owner): boolean {
    const item = this.held.get(id); if (!item || item.owner !== owner) return false;
    this.held.delete(id); this.bytes -= item.bytes; return true;
  }
  releaseOwner(owner: Owner): void { for (const [id, item] of this.held) if (item.owner === owner) this.release(id, owner); }
}
