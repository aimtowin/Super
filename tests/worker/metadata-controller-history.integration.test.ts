import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMetadataReadController, type MetadataReadController, type MetadataSessionOwner } from "../../src/renderer/metadata-read-controller";
import { LibraryService } from "../../src/worker/library-service";

const fixturePrefix = "super-metadata-controller-history-";
const fixtures: Array<{ root: string; service: LibraryService; controller: MetadataReadController; owner: MetadataSessionOwner | null }> = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0).reverse()) {
    fixture.controller.disposeSession(fixture.owner);
    await fixture.service.closeAllAsync();
    const root = path.resolve(fixture.root);
    const temporaryParent = path.resolve(tmpdir());
    // Every write/deletion in this fixture is confined to its explicitly named
    // mkdtemp child; never use a real library or userData path.
    if (path.dirname(root).toLowerCase() !== temporaryParent.toLowerCase() || !path.basename(root).startsWith(fixturePrefix)) {
      throw new Error("Refusing cleanup outside the isolated metadata-history fixture.");
    }
    rmSync(root, { recursive: true, force: true });
  }
});

describe("actual metadata history + renderer controller (A5 review)", () => {
  it.each([0, 1])("accepts authoritative metadata after undo restores logical version %i", async (baselineVersion) => {
    const root = mkdtempSync(path.join(tmpdir(), fixturePrefix));
    const service = new LibraryService();
    const controller = createMetadataReadController(async (input) => ({ ok: true, value: service.getAssetMetadata(input) }));
    const fixture = { root, service, controller, owner: null as MetadataSessionOwner | null };
    fixtures.push(fixture);
    const library = service.createLibrary({ displayName: "Metadata history fixture", selectedParentPath: root });
    const sourcePath = path.join(root, "source.txt");
    writeFileSync(sourcePath, "isolated metadata history asset");
    const imported = service.prepareOrExecuteImport({ libraryId: library.libraryId, sourceKind: "files", sourcePaths: [sourcePath] });
    if (!("assets" in imported) || imported.assets.length !== 1) throw new Error("Expected one isolated imported asset.");
    const assetId = imported.assets[0]!.assetId;
    const owner = controller.activateSession({ libraryId: library.libraryId, displayName: library.displayName, displayPath: root });
    fixture.owner = owner;

    if (baselineVersion === 1) {
      const initial = service.getAssetMetadata({ libraryId: library.libraryId, assetId });
      service.setAssetMetadata({ libraryId: library.libraryId, assetId, expectedVersion: initial.entityVersion, description: "baseline" });
    }
    const before = service.getAssetMetadata({ libraryId: library.libraryId, assetId });
    expect(before.entityVersion).toBe(baselineVersion);
    expect((await controller.request(owner, assetId)).ok).toBe(true);

    const ticket = controller.beginMutation(owner, [assetId]);
    const after = service.setAssetMetadata({ libraryId: library.libraryId, assetId, expectedVersion: before.entityVersion, description: "edited" });
    const receipt = service.recordAssetMetadataHistory({ libraryId: library.libraryId, before, after });
    expect(controller.commitMutation(ticket, [after])).toBe(true);
    expect(controller.peek(owner, assetId)?.entityVersion).toBe(baselineVersion + 1);

    const undone = await service.undoOperationHistory({ libraryId: library.libraryId, expectedHistoryEntryId: receipt.historyEntryId });
    expect(undone.direction).toBe("undo");
    const actualRestored = service.getAssetMetadata({ libraryId: library.libraryId, assetId });
    expect(actualRestored.entityVersion).toBe(baselineVersion);
    expect(actualRestored.description).toBe(before.description);

    // Match the App's confirmed undo-success publication, without rotating
    // its owner or changing the durable logical history-version semantics.
    controller.invalidateAfterHistoryRestore(owner);
    const fresh = await controller.request(owner, assetId);
    expect(fresh.ok, "A fresh same-session read after successful undo must not be rejected as stale").toBe(true);
    if (!fresh.ok) return;
    expect(fresh.value.entityVersion).toBe(baselineVersion);
    expect(fresh.value.description).toBe(before.description);
    expect(controller.snapshot(owner, [assetId]).status).toBe("ready");

    const redone = await service.redoOperationHistory({ libraryId: library.libraryId, expectedHistoryEntryId: receipt.historyEntryId });
    expect(redone.direction).toBe("redo");
    controller.invalidateAfterHistoryRestore(owner);
    const replay = await controller.request(owner, assetId);
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.description).toBe("edited");
  });
});
