/**
 * Privileges for the `super://` artifact / source media scheme.
 *
 * Must be registered via `protocol.registerSchemesAsPrivileged` before
 * `app.ready`. `stream: true` is required so `<video>` / `<audio>` treat
 * Range responses as a streaming transport; without it Chromium buffers as if
 * the body were a single download, and seek/scrub against `createArtifactResponse`
 * frequently surfaces MEDIA_ERR_NETWORK / decode failures (Super-jh2).
 */
export const SUPER_PROTOCOL_SCHEME = "super" as const;
export const SUPER_PLUGIN_PROTOCOL_SCHEME = "super-plugin" as const;

export const SUPER_PROTOCOL_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true,
  corsEnabled: true,
} as const;

export function superProtocolSchemes() {
  return [
    {
      scheme: SUPER_PROTOCOL_SCHEME,
      privileges: { ...SUPER_PROTOCOL_PRIVILEGES },
    },
    {
      scheme: SUPER_PLUGIN_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ];
}
