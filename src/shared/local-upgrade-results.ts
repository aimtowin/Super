import { z } from 'zod';
import { assetSummarySchema } from './asset-types';

export const folderInspectionSchema = z.strictObject({
  folderId: z.string().min(1), name: z.string(), absolutePath: z.string(),
  locationKind: z.enum(['managed', 'linked']), status: z.enum(['available', 'offline']),
  assetCount: z.number().int().nonnegative(), byteSize: z.number().int().nonnegative(),
  childFolderCount: z.number().int().nonnegative(), covers: z.array(assetSummarySchema).max(4),
});
export type FolderInspection = z.infer<typeof folderInspectionSchema>;

export const ignorePreviewSchema = z.strictObject({
  matchedAssets: z.number().int().nonnegative(), matchedFolders: z.number().int().nonnegative(),
  paths: z.array(z.strictObject({ relativePath: z.string(), kind: z.enum(['asset', 'folder']) })).max(200),
});
export type IgnorePreview = z.infer<typeof ignorePreviewSchema>;
export const embeddedGenerationSchema = z.strictObject({
  generator: z.enum(['stable-diffusion','comfyui']),
  fields: z.record(z.string().max(79), z.string().max(131072)).refine(fields => Object.keys(fields).length <= 3 && Object.values(fields).reduce((sum,field) => sum + field.length,0) <= 131072),
});
export type EmbeddedGenerationInfo = z.infer<typeof embeddedGenerationSchema>;
