import { z } from "zod";

const identifierSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => value.trim().length > 0, {
    message: "Identifier must not be blank.",
  });

/**
 * The entire capability granted to the dedicated floating-preview renderer.
 * `sourceUrl` is constructed and held by Main after a Worker lookup; neither
 * the main renderer nor this child can provide an arbitrary file/HTTP URL.
 */
export const floatingPreviewStateSchema = z.strictObject({
  assetId: identifierSchema,
  /** The child only supports static images and PDF documents. */
  mediaType: z.enum(["image", "pdf"]),
  sourceUrl: z.string().startsWith("super://"),
});

export type FloatingPreviewState = z.infer<typeof floatingPreviewStateSchema>;
