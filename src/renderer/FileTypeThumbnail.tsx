const MAX_EXTENSION_LABEL_LENGTH = 8;
const FILE_TYPE_TONES = ["blue", "violet", "amber", "teal", "rose"] as const;

export type FileTypeThumbnailTone = (typeof FILE_TYPE_TONES)[number];

/**
 * Human-readable filename suffix for a non-raster file card. Keep the label
 * bounded so an unusual extension cannot destabilise a compact card layout.
 */
export function fileTypeThumbnailLabel(fileName: string): string {
  const normalized = fileName.trim();
  const dot = normalized.lastIndexOf(".");
  if (dot <= 0 || dot === normalized.length - 1) return "FILE";
  return normalized.slice(dot + 1, dot + 1 + MAX_EXTENSION_LABEL_LENGTH).toUpperCase();
}

/** A stable, deliberately quiet accent assignment without persisting UI state. */
export function fileTypeThumbnailTone(fileName: string): FileTypeThumbnailTone {
  const label = fileTypeThumbnailLabel(fileName);
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + (label.codePointAt(index) ?? 0)) >>> 0;
  }
  return FILE_TYPE_TONES[hash % FILE_TYPE_TONES.length]!;
}

/**
 * Theme-native fallback for assets that intentionally have no raster preview
 * (archives, installers, binaries and other `other` formats). CSS consumes
 * the data tone through palette variables, so it automatically follows both
 * dark and light themes without generating or storing an image artifact.
 */
export function FileTypeThumbnail({ fileName }: { fileName: string }) {
  const label = fileTypeThumbnailLabel(fileName);
  return (
    <div
      aria-hidden="true"
      className="file-type-thumbnail"
      data-tone={fileTypeThumbnailTone(fileName)}
    >
      <span className="file-type-thumbnail-fold" />
      <span className="file-type-thumbnail-label">{label}</span>
    </div>
  );
}
