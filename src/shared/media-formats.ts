/**
 * Product-level media format registry.
 *
 * An extension appearing here means Super has an owned thumbnail/preview
 * path for it. It deliberately does not mean that Chromium can play or render
 * the original file directly; the Worker selects a derivative where needed.
 */

export const SHARP_IMAGE_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.jfif', '.avif', '.gif', '.tif', '.tiff', '.webp', '.svg',
] as const;

/** Formats decoded by the bundled OIIO runtime rather than by Chromium/sharp. */
export const OIIO_IMAGE_EXTENSIONS = [
  '.bmp', '.ico', '.psd', '.exr', '.tga',
] as const;

/** Camera RAW formats decoded by OIIO's LibRaw plugin. */
export const RAW_IMAGE_EXTENSIONS = [
  '.raw', '.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2',
] as const;

export const IMAGE_EXTENSIONS = [
  ...SHARP_IMAGE_EXTENSIONS,
  ...OIIO_IMAGE_EXTENSIONS,
  ...RAW_IMAGE_EXTENSIONS,
] as const;

export const VIDEO_EXTENSIONS = [
  '.mp4', '.mov', '.avi', '.wmv', '.webm', '.mkv', '.m4v', '.flv',
] as const;

/**
 * T1 3D formats (slice 0030, decision #3): FBX / OBJ(MTL) / glTF / GLB / STL.
 * Registration means Super owns a preview path for these; actual rendering
 * (viewer + offscreen thumbnails) lands in later slices (C / E).
 */
export const MODEL_EXTENSIONS = [
  '.fbx', '.obj', '.gltf', '.glb', '.stl',
] as const;

/**
 * SolidWorks native files are indexed and given a format thumbnail, but are
 * intentionally not added to MODEL_EXTENSIONS: Super has no licensed native
 * geometry reader in the base install, so routing them to the WebGL model
 * queue would create a misleading failed preview.
 */
export const SOLIDWORKS_EXTENSIONS = [
  '.sldprt', '.sldasm', '.slddrw',
] as const;

/** Document formats with a native preview/viewer path. */
import { FONT_EXTENSIONS } from './font-media';

export const DOCUMENT_EXTENSIONS = [
  '.pdf', '.html', '.htm', ...FONT_EXTENSIONS,
] as const;

export type ImageDecoder = 'sharp' | 'oiio';

const sharpExtensions = new Set<string>(SHARP_IMAGE_EXTENSIONS);
const rawImageExtensions = new Set<string>(RAW_IMAGE_EXTENSIONS);
const oiioExtensions = new Set<string>([
  ...OIIO_IMAGE_EXTENSIONS,
  ...RAW_IMAGE_EXTENSIONS,
]);
const imageExtensions = new Set<string>(IMAGE_EXTENSIONS);
const videoExtensions = new Set<string>(VIDEO_EXTENSIONS);
const modelExtensions = new Set<string>(MODEL_EXTENSIONS);
const solidWorksExtensions = new Set<string>(SOLIDWORKS_EXTENSIONS);
const documentExtensions = new Set<string>(DOCUMENT_EXTENSIONS);

function normalizedExtension(extensionOrFilename: string): string {
  const lower = extensionOrFilename.toLowerCase();
  const lastDot = lower.lastIndexOf('.');
  return lastDot >= 0 ? lower.slice(lastDot) : lower;
}

export function isRawImageExtension(extensionOrFilename: string): boolean {
  return rawImageExtensions.has(normalizedExtension(extensionOrFilename));
}

export function isSupportedImageExtension(extensionOrFilename: string): boolean {
  return imageExtensions.has(normalizedExtension(extensionOrFilename));
}

export function isSupportedVideoExtension(extensionOrFilename: string): boolean {
  return videoExtensions.has(normalizedExtension(extensionOrFilename));
}

export function isSupportedModelExtension(extensionOrFilename: string): boolean {
  return modelExtensions.has(normalizedExtension(extensionOrFilename));
}

/** Native SolidWorks parts, assemblies, and drawings with external-app preview. */
export function isSolidWorksExtension(extensionOrFilename: string): boolean {
  return solidWorksExtensions.has(normalizedExtension(extensionOrFilename));
}

export function isSupportedDocumentExtension(extensionOrFilename: string): boolean {
  return documentExtensions.has(normalizedExtension(extensionOrFilename));
}

export function imageDecoderForExtension(
  extensionOrFilename: string,
): ImageDecoder | null {
  const extension = normalizedExtension(extensionOrFilename);
  if (sharpExtensions.has(extension)) return 'sharp';
  if (oiioExtensions.has(extension)) return 'oiio';
  return null;
}

/**
 * Non-native image viewers need a decoded derivative because Chromium cannot
 * render the source container itself.  Keep this separate from the thumbnail
 * decoder: TIFF can still use Sharp for ordinary cards, but large/metadata-
 * heavy TIFFs are deliberately routed through OIIO for both safety and the
 * full-resolution viewer path. TIFF is intentionally routed through OIIO for
 * both card and viewer decoding; other formats retain their existing card
 * decoder while the viewer selects the appropriate full-resolution path.
 */
export function imageViewerDecoderForExtension(
  extensionOrFilename: string,
): ImageDecoder | null {
  const extension = normalizedExtension(extensionOrFilename);
  if (extension === '.tif' || extension === '.tiff') return 'oiio';
  return imageDecoderForExtension(extension);
}

/** Native source rendering is an optimization, never the format-support path. */
export function directImageMimeForExtension(
  extensionOrFilename: string,
): string | null {
  switch (normalizedExtension(extensionOrFilename)) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jfif':
    case '.jpeg': return 'image/jpeg';
    case '.avif': return 'image/avif';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    // SVG stays vector in the viewer; the grid still uses its generated
    // thumbnail for predictable card sizing and performance.
    case '.svg': return 'image/svg+xml';
    default: return null;
  }
}

export function imageMimeForExtension(extensionOrFilename: string): string | null {
  switch (normalizedExtension(extensionOrFilename)) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jfif':
    case '.jpeg': return 'image/jpeg';
    case '.avif': return 'image/avif';
    case '.gif': return 'image/gif';
    case '.tif':
    case '.tiff': return 'image/tiff';
    case '.webp': return 'image/webp';
    case '.bmp': return 'image/bmp';
    case '.ico': return 'image/x-icon';
    case '.svg': return 'image/svg+xml';
    case '.psd': return 'image/vnd.adobe.photoshop';
    case '.exr': return 'image/x-exr';
    case '.tga': return 'image/x-tga';
    case '.dng': return 'image/x-adobe-dng';
    case '.raw': return 'image/x-camera-raw';
    case '.cr2': return 'image/x-canon-cr2';
    case '.cr3': return 'image/x-canon-cr3';
    case '.nef': return 'image/x-nikon-nef';
    case '.arw': return 'image/x-sony-arw';
    case '.raf': return 'image/x-fuji-raf';
    case '.orf': return 'image/x-olympus-orf';
    case '.rw2': return 'image/x-panasonic-rw2';
    default: return null;
  }
}

export function videoMimeForExtension(extensionOrFilename: string): string | null {
  switch (normalizedExtension(extensionOrFilename)) {
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.avi': return 'video/x-msvideo';
    case '.wmv': return 'video/x-ms-wmv';
    case '.webm': return 'video/webm';
    case '.mkv': return 'video/x-matroska';
    case '.m4v': return 'video/x-m4v';
    case '.flv': return 'video/x-flv';
    default: return null;
  }
}

/**
 * Product MIME labels for the T1 3D set. These are informational (the viewer
 * loads models through three.js loaders, not <object>/Chromium media); they
 * surface in resolutions/Inspector so the renderer can branch on kind.
 */
export function modelMimeForExtension(extensionOrFilename: string): string | null {
  switch (normalizedExtension(extensionOrFilename)) {
    case '.glb': return 'model/gltf-binary';
    case '.gltf': return 'model/gltf+json';
    case '.obj': return 'model/obj';
    case '.fbx': return 'model/fbx';
    case '.stl': return 'model/stl';
    default: return null;
  }
}
