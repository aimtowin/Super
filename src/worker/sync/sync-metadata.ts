import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sourcePageUrlSchema, assetAuthorSchema } from '../../shared/protocol/requests';

export const syncMetadataSchema = z.strictObject({
  formatVersion: z.literal(1),
  user: z.strictObject({
    description: z.string().max(10000).nullable(), rating: z.number().int().min(0).max(5),
    favorite: z.boolean(), sourcePageUrl: sourcePageUrlSchema.nullable(), author: assetAuthorSchema.nullable(),
  }),
  analysis: z.strictObject({analyzedAt:z.string().max(64),modelId:z.string().max(512),modelVersion:z.string().max(512)}).nullable().optional(),
  humanTags: z.array(z.string().min(1).max(255)).max(200),
  aiTags: z.array(z.strictObject({name:z.string().min(1).max(255),modelId:z.string().max(512),modelVersion:z.string().max(512)})).max(200),
  ai: z.array(z.strictObject({
    fieldName: z.enum(['description','rating']), value:z.string().max(10000),
    modelId:z.string().max(512), modelVersion:z.string().max(512), generatedAt:z.string().max(64),
  })).max(16),
});
export type SyncMetadata = z.infer<typeof syncMetadataSchema>;
export function emptySyncMetadata(): SyncMetadata {
  return {formatVersion:1,user:{description:null,rating:0,favorite:false,sourcePageUrl:null,author:null},analysis:null,humanTags:[],aiTags:[],ai:[]};
}
export function canonicalSyncMetadata(value: SyncMetadata): SyncMetadata {
  const result = syncMetadataSchema.parse(value);
  const compare = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;
  const fold = (name: string) => name.normalize('NFC').replace(/[A-Z]/gu, c => c.toLowerCase());
  result.analysis ??= null;
  result.humanTags = [...new Map(result.humanTags.map(name => [fold(name), name.normalize('NFC')])).values()].sort(compare);
  result.aiTags = [...new Map(result.aiTags.map(tag => [fold(tag.name),tag])).values()];
  result.aiTags.sort((a,b) => compare(a.name,b.name) || compare(a.modelId,b.modelId) || compare(a.modelVersion,b.modelVersion));
  result.ai.sort((a,b) => compare(b.generatedAt,a.generatedAt) || compare(JSON.stringify(a),JSON.stringify(b)));
  return result;
}
export function metadataFingerprint(value: SyncMetadata | undefined): string {
    const canonical = value ? canonicalSyncMetadata(value) : null;
  if (canonical) {
    const fold = (name: string) => name.replace(/[A-Z]/gu, c => c.toLowerCase());
    canonical.humanTags = canonical.humanTags.map(fold).sort();
    canonical.aiTags = canonical.aiTags.map(tag => ({...tag,name:fold(tag.name)})).sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class SyncMetadataConflict extends Error {
  readonly code = 'METADATA_CONFLICT';
  constructor(readonly fields: string[]) {super('同步人工元数据冲突：' + fields.join(', ') + '。已保留双方内容，请确认后再同步。');}
}
/** Three-way human edits; AI remains a separate provenance-bearing layer. */
export function mergeSyncMetadata(base: SyncMetadata | undefined, local: SyncMetadata, remote: SyncMetadata | undefined): SyncMetadata {
  if (!remote) return canonicalSyncMetadata(local);
  local = canonicalSyncMetadata(local); remote = canonicalSyncMetadata(remote);
  if (base) base = canonicalSyncMetadata(base);
  const baseline = base ?? emptySyncMetadata(), result = structuredClone(local), conflicts: string[] = [];
  for (const key of Object.keys(local.user) as Array<keyof SyncMetadata['user']>) {
    const a = local.user[key], b = remote.user[key], old = baseline.user[key];
    if (same(a,b) || same(b,old)) continue;
    if (same(a,old)) Object.assign(result.user,{[key]:b}); else conflicts.push(key);
  }
  if (conflicts.length) throw new SyncMetadataConflict(conflicts);
  const identity = (name: string) => name.normalize('NFC').replace(/[A-Z]/gu, c => c.toLowerCase());
  const oldTags = new Set(baseline.humanTags.map(identity)), a = new Map(local.humanTags.map(name => [identity(name),name])), b = new Map(remote.humanTags.map(name => [identity(name),name]));
  result.humanTags = [...new Set([...oldTags,...a.keys(),...b.keys()])].filter(key => {
    const old = oldTags.has(key), left = a.has(key), right = b.has(key);
    return left === old ? right : left;
  }).map(key => a.get(key) ?? b.get(key)!).sort((x,y) => x.localeCompare(y));
  const mergeAi = <T>(left: T[], right: T[], old: T[], key: (item: T) => string): T[] => {
    if (same(left,right) || same(right,old)) return left;
    if (same(left,old)) return right;
    return [...new Map([...right,...left].map(item => [key(item),item])).values()];
  };
  result.aiTags = mergeAi(local.aiTags,remote.aiTags,baseline.aiTags,item => identity(item.name)).sort((x,y) => x.name.localeCompare(y.name));
  result.ai = mergeAi(local.ai,remote.ai,baseline.ai,item => JSON.stringify(item)).sort((x,y) => y.generatedAt.localeCompare(x.generatedAt));
  if (same(local.analysis,baseline.analysis)) result.analysis = remote.analysis;
  else if (!same(remote.analysis,baseline.analysis) && !same(local.analysis,remote.analysis)) {
    result.analysis = [local.analysis,remote.analysis].filter(item => item != null).sort((a,b) => b.analyzedAt.localeCompare(a.analyzedAt))[0] ?? null;
  }
  // Refuse overflow, never silently discard conflict provenance.
  return canonicalSyncMetadata(result);
}
