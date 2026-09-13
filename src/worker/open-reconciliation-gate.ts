/** One full reconciliation per open, with stale deferred callbacks invalidated. */
export class OpenReconciliationGate {
  private readonly pending = new Map<string, number>();
  private sequence = 0;

  open(libraryId: string): void {
    this.pending.set(libraryId, ++this.sequence);
  }

  postpone(libraryId: string): number | undefined {
    if (!this.pending.has(libraryId)) return undefined;
    const ticket = ++this.sequence;
    this.pending.set(libraryId, ticket);
    return ticket;
  }

  claim(libraryId: string, ticket: number): boolean {
    if (this.pending.get(libraryId) !== ticket) return false;
    this.pending.delete(libraryId);
    return true;
  }

  close(libraryId: string): void {
    this.pending.delete(libraryId);
  }
}
