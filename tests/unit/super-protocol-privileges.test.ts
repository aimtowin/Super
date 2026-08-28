import { describe, expect, it } from "vitest";

import {
  SUPER_PROTOCOL_PRIVILEGES,
  SUPER_PROTOCOL_SCHEME,
  SUPER_PLUGIN_PROTOCOL_SCHEME,
  superProtocolSchemes,
} from "../../src/main/super-protocol-privileges";

describe("super protocol privileges", () => {
  it("enables streaming media for seekable Range playback", () => {
    expect(SUPER_PROTOCOL_SCHEME).toBe("super");
    expect(SUPER_PROTOCOL_PRIVILEGES.stream).toBe(true);
    expect(SUPER_PROTOCOL_PRIVILEGES.standard).toBe(true);
    expect(SUPER_PROTOCOL_PRIVILEGES.secure).toBe(true);
    expect(SUPER_PROTOCOL_PRIVILEGES.supportFetchAPI).toBe(true);

    const schemes = superProtocolSchemes();
    expect(schemes).toHaveLength(2);
    expect(schemes[0]?.scheme).toBe("super");
    expect(schemes[0]?.privileges.stream).toBe(true);
    expect(schemes[1]?.scheme).toBe(SUPER_PLUGIN_PROTOCOL_SCHEME);
    expect(schemes[1]?.privileges.stream).toBe(true);
  });
});
