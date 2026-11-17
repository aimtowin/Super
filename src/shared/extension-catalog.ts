import { z } from 'zod';

/**
 * Static extension catalogue served by the Super update host. The catalogue is
 * intentionally declarative: the client only accepts an asset path on the same
 * HTTPS origin and verifies the declared size and SHA-256 before installation.
 */
export const EXTENSION_CATALOG_VERSION = 1 as const;

export const DEFAULT_EXTENSION_CATALOG_URL =
  'https://43.142.93.106/downloads/super/plugins/latest.json';

const extensionIdSchema = z.string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/u);

const extensionVersionSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u);

const platformTokenSchema = z.enum([
  'any',
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-ia32',
  'win32-x64',
]);

export const extensionCatalogAssetSchema = z.strictObject({
  /** Relative POSIX path below the catalogue's `/downloads/super/plugins/` root. */
  path: z.string()
    .min(1)
    .max(1_024)
    .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u),
  size: z.number().int().positive().max(256 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});

export const extensionCatalogEntrySchema = z.strictObject({
  id: extensionIdSchema,
  name: z.string().min(1).max(160),
  version: extensionVersionSchema,
  description: z.string().min(1).max(2_000),
  author: z.string().min(1).max(160).optional(),
  platform: platformTokenSchema,
  minAppVersion: extensionVersionSchema.optional(),
  asset: extensionCatalogAssetSchema,
  /** One-time host tutorial shown after installation. */
  tutorial: z.strictObject({
    title: z.string().min(1).max(160),
    steps: z.array(z.string().min(1).max(500)).min(1).max(8),
  }).optional(),
});

export const extensionCatalogSchema = z.strictObject({
  catalogVersion: z.literal(EXTENSION_CATALOG_VERSION),
  generatedAt: z.string().min(1).max(80).optional(),
  extensions: z.array(extensionCatalogEntrySchema).max(200),
});

export type ExtensionCatalogAsset = z.infer<typeof extensionCatalogAssetSchema>;
export type ExtensionCatalogEntry = z.infer<typeof extensionCatalogEntrySchema>;
export type ExtensionCatalog = z.infer<typeof extensionCatalogSchema>;