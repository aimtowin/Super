import { randomFillSync } from "node:crypto";
import { emptySyncMetadata, metadataFingerprint } from "../../src/worker/sync/sync-metadata";
import { crc32 } from "node:zlib";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryService } from "../../src/worker/library-service";
import { resolveFfmpegPath } from "../../src/worker/binary-resolver";
import { executeBoundedWriteWorkerCommand } from "../../src/worker/bounded-write-command";
import { resolveFolderOntoFolderDrop } from "../../src/renderer/folder-drag-drop";
import { createToneWavBytes } from "./large-library-media";
import { colorFilterSql } from "../../src/shared/color-filter-presets";
import { createRequire } from "node:module";
import { renameSync, mkdirSync } from "node:fs";
import { importNoConflict } from "./import-no-conflict";

const roots: string[] = [];
const services: LibraryService[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "super-local-upgrades-")); roots.push(root);
  const service = new LibraryService({ observerFactory: () => ({ close() {} }) }); services.push(service);
  const library = service.createLibrary({ displayName: "Local upgrades", selectedParentPath: root });
  return { root, service, library, libraryId: library.libraryId };
}
afterEach(async () => {
  for (const service of services.splice(0)) service.closeAll();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith("super-local-upgrades-")) throw Error("Not an owned fixture");
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe("local upgrade real pipelines", () => {
  it("does not repeatedly enqueue unsupported font raster jobs while retaining source previews", () => {
    const f = fixture(), source = path.join(f.root, 'Sample.ttf');
    writeFileSync(source, readFileSync(path.resolve('resources/fonts/DejaVuSans.ttf')));
    const asset = importNoConflict(f.service, f.libraryId, source).assets[0]!;
    expect(f.service.getPreviewArtifact(f.libraryId, asset.assetId)).toMatchObject({mediaType: 'document'});
    for (let repeat = 0; repeat < 3; repeat++) {
      expect(f.service.enqueueThumbnailJobs(f.libraryId, {assetIds: [asset.assetId], limit: 10})).toBe(0);
    }
  });
  it("matches arbitrary colors with cyclic hue and explicit exclusion in real SQLite", () => {
    const Database = createRequire(import.meta.url)("better-sqlite3");
    const db = new Database(":memory:");
    try {
      db.exec("CREATE TABLE p(name TEXT,h REAL,s REAL,l REAL); INSERT INTO p VALUES ('red',0,1,.5),('near',359,1,.5),('blue',240,1,.5),('gray',0,0,.5)");
      const include = colorFilterSql("h",["#ff0000~10"],false,"l","s")!;
      expect(db.prepare(`SELECT name FROM p WHERE ${include.sql} ORDER BY name`).all(...include.params)).toEqual([{name:"near"},{name:"red"}]);
      const exclude = colorFilterSql("h",["#ff0000~10"],true,"l","s")!;
      expect(db.prepare(`SELECT name FROM p WHERE ${exclude.sql} ORDER BY name`).all(...exclude.params)).toEqual([{name:"blue"},{name:"gray"}]);
    } finally {db.close();}
  });
  it("keeps cached folder facts when a linked root goes offline", () => {
    const f=fixture(), source=path.join(f.root,"linked"); mkdirSync(source);
    writeFileSync(path.join(source,"keep.txt"),"abc");
    const linked=f.service.importFolderAsLinked({libraryId:f.libraryId,sourceRootPath:source});
    const folder=f.service.listLinkedFolders(f.libraryId)[0]!;
    expect(linked).toBeDefined();
    expect(f.service.inspectFolder({libraryId:f.libraryId,folderId:folder.folderId})).toMatchObject({locationKind:"linked",assetCount:1,byteSize:3});
    renameSync(source,path.join(f.root,"offline"));
    f.service.refreshManagedAssets(f.libraryId);
    expect(f.service.inspectFolder({libraryId:f.libraryId,folderId:folder.folderId})).toMatchObject({status:"offline",assetCount:1,byteSize:3});
  });
  it("extracts embedded audio artwork and retains waveform fallback for plain audio", async () => {
    const f=fixture(), wav=path.join(f.root,"tone.wav"), cover=path.join(f.root,"cover.png"), audio=path.join(f.root,"artwork.m4a");
    writeFileSync(wav,createToneWavBytes(0));
    writeFileSync(cover,await sharp({create:{width:64,height:64,channels:3,background:"#0000ff"}}).png().toBuffer());
    execFileSync(resolveFfmpegPath(),["-hide_banner","-loglevel","error","-i",wav,"-i",cover,"-map","0:a","-map","1:v","-c:a","aac","-c:v","copy","-disposition:v","attached_pic","-y",audio],{windowsHide:true,timeout:20000});
    const art=importNoConflict(f.service,f.libraryId,audio).assets[0]!, plain=importNoConflict(f.service,f.libraryId,wav).assets[0]!;
    f.service.enqueueThumbnailJobs(f.libraryId,{assetIds:[art.assetId,plain.assetId],limit:10});
    await f.service.processThumbnailQueue(f.libraryId,{maxJobs:10});
    const thumbnail=f.service.getCurrentArtifact(f.libraryId,art.assetId,"thumbnail")!;
    expect(thumbnail.status).toBe("ready");
    const stats=await sharp(f.service.getArtifactAbsolutePath(f.libraryId,thumbnail.artifactId)).stats();
    expect(stats.channels[2]!.mean).toBeGreaterThan(200); expect(stats.channels[0]!.mean).toBeLessThan(20);
    expect(f.service.getCurrentArtifact(f.libraryId,plain.assetId,"thumbnail")).toMatchObject({status:"ready"});
    expect(f.service.getPreviewArtifact(f.libraryId,art.assetId)).toMatchObject({mediaType:"audio",playbackMode:"source"});
  },30000);
  it("converts an empty UTF-16 document to valid empty UTF-8 and restores its original BOM", async () => {
    const f=fixture(), source=path.join(f.root,"empty.txt");writeFileSync(source,Buffer.from([0xff,0xfe]));
    const asset=importNoConflict(f.service,f.libraryId,source).assets[0]!;
    f.service.saveTextAsset({libraryId:f.libraryId,assetId:asset.assetId,content:"",expectedRevisionId:asset.currentRevisionId!,convertToUtf8:true});
    expect(f.service.readTextAsset({libraryId:f.libraryId,assetId:asset.assetId})).toMatchObject({content:"",encoding:"utf-8",editable:true});
    await f.service.undoOperationHistory({libraryId:f.libraryId,expectedHistoryEntryId:f.service.getOperationHistoryStatus(f.libraryId).undoTop!.historyEntryId});
    expect(readFileSync(f.service.resolveAssetPath(f.libraryId,asset.assetId))).toEqual(Buffer.from([0xff,0xfe]));
  });
  it("reads bounded chunks consistently and refuses changed sources between chunks", () => {
    const f = fixture(), source = path.join(f.root,"large.txt");
    const bytes = Buffer.alloc(3_500_000,97); writeFileSync(source,bytes);
    const asset = importNoConflict(f.service,f.libraryId,source).assets[0]!;
    const parts: Buffer[] = []; let offset = 0, sourceToken: string | undefined;
    do {
      const read = f.service.readManagedAssetContent({libraryId:f.libraryId,assetId:asset.assetId,maxBytes:32*1024*1024,offset,sourceToken,expectedRevisionId:asset.currentRevisionId!});
      const part = Buffer.from(read.dataBase64,"base64"); expect(part.length).toBeLessThanOrEqual(1024*1024); parts.push(part);
      sourceToken = read.sourceToken; offset = read.nextOffset!;
      if (!read.truncated) break;
    } while (offset < bytes.length);
    expect(Buffer.concat(parts)).toEqual(bytes);
    expect(() => f.service.readManagedAssetContent({libraryId:f.libraryId,assetId:asset.assetId,offset:1})).toThrow();
    writeFileSync(f.service.resolveAssetPath(f.libraryId,asset.assetId),Buffer.alloc(bytes.length,98));
    expect(() => f.service.readManagedAssetContent({libraryId:f.libraryId,assetId:asset.assetId,offset:100,sourceToken,expectedRevisionId:asset.currentRevisionId!})).toThrow();
  });
  it("preserves ICC profiles and exact undo for an image above the inline IPC limit", async () => {
    const f = fixture(), source = path.join(f.root,"large.png");
    const original = await sharp(randomFillSync(Buffer.alloc(1200*900*3)),{raw:{width:1200,height:900,channels:3}}).png().withIccProfile("p3").withMetadata({orientation:6}).toBuffer();
    expect(original.length).toBeGreaterThan(2*1024*1024); writeFileSync(source,original);
    const asset = importNoConflict(f.service,f.libraryId,source).assets[0]!;
    await f.service.transformImageAsset({libraryId:f.libraryId,assetId:asset.assetId,expectedRevisionId:asset.currentRevisionId!,quarterTurns:1,flipHorizontal:false,flipVertical:false});
    const target = f.service.resolveAssetPath(f.libraryId,asset.assetId);
    expect((await sharp(target).metadata()).icc).toEqual((await sharp(original).metadata()).icc);
    await f.service.undoOperationHistory({libraryId:f.libraryId,expectedHistoryEntryId:f.service.getOperationHistoryStatus(f.libraryId).undoTop!.historyEntryId});
    expect(readFileSync(target)).toEqual(original);
    await f.service.redoOperationHistory({libraryId:f.libraryId,expectedHistoryEntryId:f.service.getOperationHistoryStatus(f.libraryId).redoTop!.historyEntryId});
    expect(readFileSync(target)).not.toEqual(original);
  },30000);
  it("applies independent manual and AI metadata layers with stale-write protection", () => {
    const f = fixture(), source = path.join(f.root,"metadata.txt"); writeFileSync(source,"test");
    const asset = importNoConflict(f.service,f.libraryId,source).assets[0]!;
    const syncId = f.service.syncSnapshot(f.libraryId).assets.find(a => a.assetId === asset.assetId)!.syncId;
    const before = f.service.readSyncMetadata(f.libraryId,syncId)!;
    const data = emptySyncMetadata(); data.user.description="Manual"; data.user.rating=5; data.humanTags=["Human"];
    data.aiTags=[{name:"AI",modelId:"model-x",modelVersion:"1"}]; data.ai=[{fieldName:"description",value:"Generated",modelId:"model-x",modelVersion:"1",generatedAt:"2026-10-10T00:00:00Z"}];
    data.analysis={analyzedAt:"2026-10-10T00:00:00Z",modelId:"model-x",modelVersion:"1"};
    f.service.applySyncMetadata(f.libraryId,syncId,metadataFingerprint(before),data);
    const after = f.service.readSyncMetadata(f.libraryId,syncId)!;
    expect(after).toEqual(data); expect(f.service.hasAcceptedAiAnalysis(f.libraryId,asset.assetId)).toBe(true);
    expect(f.service.getAssetMetadata({libraryId:f.libraryId,assetId:asset.assetId})).toMatchObject({description:"Manual",rating:5});
    expect(() => f.service.applySyncMetadata(f.libraryId,syncId,metadataFingerprint(before),emptySyncMetadata())).toThrow();
    expect(f.service.readSyncMetadata(f.libraryId,syncId)).toEqual(after);
  });

  it("separates embedded generation markers from AI analysis and filters their actual indexed revisions", async () => {
    const f = fixture();
    const png = await sharp({create:{width:16,height:16,channels:3,background:"red"}}).png().toBuffer();
    const fields = Buffer.from("parameters\0a painting\nSteps: 20, Sampler: Euler, Seed: 42", "utf8");
    const kind = Buffer.from("tEXt"), chunk = Buffer.alloc(fields.length+12);
    chunk.writeUInt32BE(fields.length); kind.copy(chunk,4); fields.copy(chunk,8); chunk.writeUInt32BE(crc32(Buffer.concat([kind,fields])),fields.length+8);
    const marked = path.join(f.root,"marked.png"), ordinary = path.join(f.root,"ordinary.png");
    writeFileSync(marked,Buffer.concat([png.subarray(0,png.length-12),chunk,png.subarray(png.length-12)])); writeFileSync(ordinary,png);
    const ai = importNoConflict(f.service,f.libraryId,marked).assets[0]!;
    const photo = importNoConflict(f.service,f.libraryId,ordinary).assets[0]!;
    expect(f.service.getEmbeddedGeneration({libraryId:f.libraryId,assetId:ai.assetId})).toMatchObject({generator:"stable-diffusion"});
    expect(f.service.getEmbeddedGeneration({libraryId:f.libraryId,assetId:photo.assetId})).toBeNull();
    expect(f.service.searchAssets({libraryId:f.libraryId,filters:[{field:"generation_status",values:["marked"],exclude:false}]}).items.map(a => a.assetId)).toEqual([ai.assetId]);
    expect(f.service.searchAssets({libraryId:f.libraryId,filters:[{field:"generation_status",values:["marked"],exclude:true}]}).items.map(a => a.assetId)).toEqual([photo.assetId]);
    expect(f.service.searchAssets({libraryId:f.libraryId,filters:[{field:"analysis_status",values:["unanalyzed"],exclude:false}]}).total).toBe(2);
  });

  it("inspects recursive indexed folders and previews ignore rules without persisting them", () => {
    const f = fixture();
    const parent = f.service.createManagedFolder({libraryId: f.libraryId, name: "Parent"});
    const empty = f.service.createManagedFolder({libraryId: f.libraryId, name: "Empty", parentFolderId: parent.folderId});
    const child = f.service.createManagedFolder({libraryId: f.libraryId, name: "Child", parentFolderId: parent.folderId});
    const source = path.join(f.root, "keep.txt"); writeFileSync(source, "abc");
    importNoConflict(f.service, f.libraryId, source, child.folderId);
    expect(f.service.inspectFolder({libraryId:f.libraryId,folderId:parent.folderId})).toMatchObject({assetCount:1,byteSize:3,childFolderCount:2,locationKind:"managed"});
    expect(f.service.inspectFolder({libraryId:f.libraryId,folderId:empty.folderId})).toMatchObject({assetCount:0,byteSize:0});
    const before = f.service.getGitignore(f.libraryId);
    const preview = f.service.previewIgnoreRules({libraryId:f.libraryId,content:"Assets/Parent/\n!Assets/Parent/Empty/\n"});
    expect(preview).toMatchObject({matchedAssets:1});
    expect(f.service.getGitignore(f.libraryId)).toEqual(before);
    expect(f.service.searchAssets({libraryId:f.libraryId}).total).toBe(1);
    expect(() => f.service.previewIgnoreRules({libraryId:f.libraryId,content:"x\n".repeat(2001)})).toThrow();
  });

  it("explicitly converts legacy text with durable byte undo/redo and refuses implicit conversion", async () => {
    const f = fixture(), source = path.join(f.root, "legacy.txt");
    const original = Buffer.from([0xff,0xfe,0x60,0x4f,0x7d,0x59]);
    writeFileSync(source, original);
    const asset = importNoConflict(f.service, f.libraryId, source).assets[0]!;
    const before = f.service.readTextAsset({libraryId:f.libraryId,assetId:asset.assetId});
    expect(before).toMatchObject({content:"你好",encoding:"utf-16le",editable:false});
    expect(() => f.service.saveTextAsset({libraryId:f.libraryId,assetId:asset.assetId,content:before.content,expectedRevisionId:before.revisionId})).toThrow();
    f.service.saveTextAsset({libraryId:f.libraryId,assetId:asset.assetId,content:before.content,expectedRevisionId:before.revisionId,convertToUtf8:true});
    const target = f.service.resolveAssetPath(f.libraryId, asset.assetId);
    expect(readFileSync(target).toString("utf8")).toBe("你好");
    const history = f.service.getOperationHistoryStatus(f.libraryId);
    expect(history.undoTop).not.toBeNull();
    await f.service.undoOperationHistory({libraryId:f.libraryId,expectedHistoryEntryId:f.service.getOperationHistoryStatus(f.libraryId).undoTop!.historyEntryId});
    expect(readFileSync(target)).toEqual(original);
    await f.service.redoOperationHistory({libraryId:f.libraryId,expectedHistoryEntryId:f.service.getOperationHistoryStatus(f.libraryId).redoTop!.historyEntryId});
    expect(readFileSync(target).toString("utf8")).toBe("你好");
  });
  it("writes a managed static-image transform with stable identity and exact byte undo", async () => {
    const f = fixture(), source = path.join(f.root,"rotate.png");
    const original = await sharp({create:{width:80,height:48,channels:3,background:"red"}}).png().toBuffer();
    writeFileSync(source, original);
    const asset = importNoConflict(f.service,f.libraryId,source).assets[0]!;
    const result = await f.service.transformImageAsset({libraryId:f.libraryId,assetId:asset.assetId,expectedRevisionId:asset.currentRevisionId!,quarterTurns:1,flipHorizontal:false,flipVertical:false});
    expect(result.assetId).toBe(asset.assetId);
    const target = f.service.resolveAssetPath(f.libraryId,asset.assetId);
    expect(await sharp(target).metadata()).toMatchObject({width:48,height:80});
    await f.service.undoOperationHistory({libraryId:f.libraryId,expectedHistoryEntryId:f.service.getOperationHistoryStatus(f.libraryId).undoTop!.historyEntryId});
    expect(readFileSync(target)).toEqual(original);
    await f.service.redoOperationHistory({libraryId:f.libraryId,expectedHistoryEntryId:f.service.getOperationHistoryStatus(f.libraryId).redoTop!.historyEntryId});
    expect(await sharp(target).metadata()).toMatchObject({width:48,height:80});
    writeFileSync(target,"external edit");
    await expect(f.service.undoOperationHistory({libraryId:f.libraryId,expectedHistoryEntryId:f.service.getOperationHistoryStatus(f.libraryId).undoTop!.historyEntryId})).rejects.toThrow();
    expect(readFileSync(target).toString()).toBe("external edit");
  });
  it.each(["jfif", "avif"])("imports %s, decodes its real bytes, queues a thumbnail and resolves its original MIME", async extension => {
    const f = fixture();
    const source = path.join(f.root, "sample." + extension);
    const input = sharp({ create: { width: 80, height: 48, channels: 3, background: "#5c8dcc" } });
    const bytes = await (extension === "avif" ? input.avif() : input.jpeg()).toBuffer();
    writeFileSync(source, bytes);
    const asset = importNoConflict(f.service, f.libraryId, source).assets[0]!;
    expect(f.service.enqueueThumbnailJobs(f.libraryId, { assetIds: [asset.assetId], limit: 10 })).toBeGreaterThan(0);
    await f.service.processThumbnailQueue(f.libraryId, { maxJobs: 10 });
    const artifact = f.service.getCurrentArtifact(f.libraryId, asset.assetId, "thumbnail")!;
    expect(artifact).toMatchObject({ status: "ready", width: 80, height: 48 });
    const metadata = await sharp(f.service.getArtifactAbsolutePath(f.libraryId, artifact.artifactId)).metadata();
    expect(metadata.width).toBe(80);
    const preview = f.service.getPreviewArtifact(f.libraryId, asset.assetId);
    expect(preview).toMatchObject({ mediaType: "image", status: "ready", playbackMode: "source", sourceMimeType: extension === "avif" ? "image/avif" : "image/jpeg" });
    expect(f.service.getCurrentMediaSource(f.libraryId, asset.assetId, preview.sourceRevisionId!).mimeType).toBe(preview.sourceMimeType);
  });
  it("generates a real FLV poster and an explicit decode-fallback proxy without pre-encoding all imports", async () => {
    const f = fixture(); const source = path.join(f.root, "clip.flv");
    const frame = path.join(f.root, "frame.png");
    writeFileSync(frame, await sharp({ create: { width: 64, height: 48, channels: 3, background: "blue" } }).png().toBuffer());
    execFileSync(resolveFfmpegPath(), ["-hide_banner", "-loglevel", "error", "-loop", "1", "-i", frame, "-t", "0.6", "-r", "10", "-c:v", "flv", "-an", "-y", source], { timeout: 20_000, windowsHide: true });
    const asset = importNoConflict(f.service, f.libraryId, source).assets[0]!;
    expect(f.service.enqueueThumbnailJobs(f.libraryId, { assetIds: [asset.assetId], limit: 10 })).toBeGreaterThan(0);
    await f.service.processThumbnailQueue(f.libraryId, { maxJobs: 10 });
    expect(f.service.getCurrentArtifact(f.libraryId, asset.assetId, "video_poster")).toMatchObject({ status: "ready" });
    expect(f.service.getCurrentArtifact(f.libraryId, asset.assetId, "webm_proxy")).toBeNull();
    expect(f.service.getPreviewArtifact(f.libraryId, asset.assetId)).toMatchObject({ mediaType: "video", sourceMimeType: "video/x-flv" });
    f.service.enqueueArtifactRetry({ libraryId: f.libraryId, assetId: asset.assetId, kind: "webm_proxy" });
    await f.service.processThumbnailQueue(f.libraryId, { maxJobs: 10 });
    const preview = f.service.getPreviewArtifact(f.libraryId, asset.assetId, "proxy-fallback");
    expect(preview).toMatchObject({ mediaType: "video", status: "ready", playbackMode: "proxy" });
    expect(existsSync(f.service.getArtifactAbsolutePath(f.libraryId, preview.artifactId!))).toBe(true);
  }, 30_000);
  it("outdents a physical child to root with its asset ID and bytes intact", () => {
    const f = fixture();
    const parent = f.service.createManagedFolder({ libraryId: f.libraryId, name: "Parent" });
    const child = f.service.createManagedFolder({ libraryId: f.libraryId, name: "Child", parentFolderId: parent.folderId });
    const source = path.join(f.root, "keep.txt"); writeFileSync(source, "original");
    const asset = importNoConflict(f.service, f.libraryId, source, child.folderId).assets[0]!;
    const drop = resolveFolderOntoFolderDrop({ targetFolderId: parent.folderId, draggedFolderIds: [child.folderId], folders: f.service.listManagedFolders(f.libraryId), promoteOnParentDrop: true });
    expect(drop.kind).toBe("move"); if (drop.kind !== "move") throw Error("No move");
    f.service.moveManagedFolders({ libraryId: f.libraryId, folderIds: [...drop.folderIds], targetParentFolderId: drop.targetParentFolderId, conflictStrategy: "keep-both" });
    expect(f.service.listManagedFolders(f.libraryId).find(item => item.folderId === child.folderId)?.parentFolderId).toBeNull();
    expect(readFileSync(f.service.resolveAssetPath(f.libraryId, asset.assetId), "utf8")).toBe("original");
    expect(existsSync(path.join(f.library.libraryPath, "Assets", "Parent", "Child", "keep.txt"))).toBe(false);
    expect(existsSync(path.join(f.library.libraryPath, "Assets", "Child", "keep.txt"))).toBe(true);
  });
  it("collection promotion is undoable, preserves membership, and refuses descendant cycles", async () => {
    const f = fixture();
    const parent = f.service.createCollection({ libraryId: f.libraryId, name: "Parent" });
    const child = f.service.createCollection({ libraryId: f.libraryId, name: "Child", parentId: parent.collectionId });
    const source = path.join(f.root, "keep.txt"); writeFileSync(source, "keep");
    const asset = importNoConflict(f.service, f.libraryId, source).assets[0]!;
    f.service.addCollectionAssets({ libraryId: f.libraryId, collectionId: child.collectionId, assetIds: [asset.assetId] });
    const result = await f.service.runBoundedWrite(f.libraryId, () => executeBoundedWriteWorkerCommand(f.service, { type: "collection.update", libraryId: f.libraryId, collectionId: child.collectionId, parentId: null }));
    if (!result?.ok || result.type !== "collection.updated" || !result.historyEntryId) throw Error("Missing history receipt");
    expect(result.collection.parentId).toBeNull();
    await f.service.undoOperationHistory({ libraryId: f.libraryId, expectedHistoryEntryId: result.historyEntryId });
    expect(f.service.listCollections(f.libraryId).find(item => item.collectionId === child.collectionId)?.parentId).toBe(parent.collectionId);
    expect(f.service.listCollectionAssets({ libraryId: f.libraryId, collectionId: child.collectionId, recursive: false })[0]?.assetId).toBe(asset.assetId);
    expect(() => f.service.updateCollection({ libraryId: f.libraryId, collectionId: parent.collectionId, parentId: child.collectionId })).toThrow();
    await f.service.redoOperationHistory({ libraryId: f.libraryId, expectedHistoryEntryId: result.historyEntryId });
    expect(f.service.listCollections(f.libraryId).find(item => item.collectionId === child.collectionId)?.parentId).toBeNull();
  });
});
