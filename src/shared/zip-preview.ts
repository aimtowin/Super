import { z } from 'zod';

export const zipPreviewSchema = z.strictObject({
  revisionId: z.string().min(1),
  entries: z.array(z.strictObject({ name: z.string().max(2048), directory: z.boolean(), size: z.number().int().nonnegative() })).max(5000),
  member: z.strictObject({ name: z.string().max(2048), mime: z.string(), base64: z.string().max(12_000_000) }).nullable(),
});
export type ZipPreview = z.infer<typeof zipPreviewSchema>;
export type ZipPreviewInput = { libraryId: string; assetId: string; memberPath?: string; expectedRevisionId?: string };
