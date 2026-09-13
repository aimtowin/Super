import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FileTypeThumbnail,
  fileTypeThumbnailLabel,
  fileTypeThumbnailTone,
} from "../../src/renderer/FileTypeThumbnail";

describe("file-type thumbnails", () => {
  it("uses an uppercase filename suffix and a stable theme tone", () => {
    expect(fileTypeThumbnailLabel("release-build.zip")).toBe("ZIP");
    expect(fileTypeThumbnailLabel("installer.exe")).toBe("EXE");
    expect(fileTypeThumbnailTone("release-build.zip")).toBe(
      fileTypeThumbnailTone("another.zip"),
    );
  });

  it("falls back safely when a file has no usable suffix", () => {
    expect(fileTypeThumbnailLabel("README")).toBe("FILE");
    expect(fileTypeThumbnailLabel(".gitignore")).toBe("FILE");
    expect(fileTypeThumbnailLabel("archive.")).toBe("FILE");
  });

  it("renders a non-interactive, suffix-led preview tile", () => {
    const markup = renderToStaticMarkup(
      createElement(FileTypeThumbnail, { fileName: "tool.exe" }),
    );
    expect(markup).toContain('class="file-type-thumbnail"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(">EXE<");
  });
});
