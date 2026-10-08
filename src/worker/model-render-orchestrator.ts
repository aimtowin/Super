import { BUNDLED_HDRI_PRESET_IDS } from '../shared/hdri-presets';
import {
  MODEL_THUMBNAIL_DEFAULT_EDGE,
  MODEL_THUMBNAIL_RENDER_TIMEOUT_MS,
  modelThumbnailFormatForFileName,
  type ModelThumbnailRenderRequest,
  type ModelThumbnailRenderResult,
  type ModelThumbnailSourceAuthorization,
} from '../shared/model-thumbnail-protocol';
import type { FbxConvertCommandResult } from './fbx/convert-command';
import type { ModelThumbnailRenderOutcome } from './library-service';

export type ModelRenderInput = {
  libraryId: string;
  assetId: string;
  revisionId: string;
  relativeFilePath: string;
  byteSize: number | null;
  signal: AbortSignal;
  views?: ReadonlyArray<readonly [number, number, number]>;
};

type SourceId = Pick<ModelThumbnailSourceAuthorization, 'libraryId' | 'assetId' | 'revisionId'>;
type Companion = ModelThumbnailRenderRequest['companionMap'][number];

export function createModelRenderOrchestrator(ports: {
  convertFbx: (input: { libraryId: string; assetId: string }) => Promise<FbxConvertCommandResult>;
  resolveCompanions: (input: { libraryId: string; assetId: string }) => readonly Companion[];
  authorizeSource: (input: SourceId) => ModelThumbnailSourceAuthorization;
  requestModelRender: (
    input: Omit<ModelThumbnailRenderRequest, 'type' | 'requestId'> & {
      sourceAuthorizations: readonly ModelThumbnailSourceAuthorization[];
    },
    signal?: AbortSignal,
  ) => Promise<ModelThumbnailRenderResult>;
}) {
  return async (input: ModelRenderInput): Promise<ModelThumbnailRenderOutcome> => {
    const checkAbort = () => {
      if (input.signal.aborted) throw new DOMException('Model render cancelled.', 'AbortError');
    };
    checkAbort();
    const format = modelThumbnailFormatForFileName(input.relativeFilePath);
    if (!format) return { status: 'failed', errorCode: 'MODEL_LOAD_FAILED' };
    let effectiveFormat: ModelThumbnailRenderRequest['format'] = format;
    let renderUrl: string;
    if (format === 'fbx') {
      const conversion = await ports.convertFbx({ libraryId: input.libraryId, assetId: input.assetId });
      // Conversion is shared single-flight work. Do not cancel its cache write,
      // but never start a render for the individual job that was cancelled.
      checkAbort();
      if (conversion.status !== 'ready') {
        return {
          status: 'failed', errorCode: conversion.errorCode,
          ...(conversion.reason === undefined ? {} : { reason: conversion.reason }),
        };
      }
      effectiveFormat = 'glb';
      renderUrl = `super://preview/${input.libraryId}/${conversion.glbArtifactId}`;
    } else {
      renderUrl = `super://source/${input.libraryId}/${input.assetId}?revision=${encodeURIComponent(input.revisionId)}`;
    }
    checkAbort();
    const companions = ports.resolveCompanions({ libraryId: input.libraryId, assetId: input.assetId });
    const sourceAuthorizations: ModelThumbnailSourceAuthorization[] = [
      ports.authorizeSource({ libraryId: input.libraryId, assetId: input.assetId, revisionId: input.revisionId }),
      ...companions.map((companion) => ports.authorizeSource({
        libraryId: input.libraryId, assetId: companion.assetId, revisionId: companion.revisionId,
      })),
    ];
    checkAbort();
    return ports.requestModelRender({
      libraryId: input.libraryId, assetId: input.assetId, revisionId: input.revisionId,
      format: effectiveFormat, renderUrl,
      companionMap: companions.map((companion) => ({
        relativeFilePath: companion.relativeFilePath,
        assetId: companion.assetId,
        revisionId: companion.revisionId,
        extension: companion.extension,
      })),
      hdriPresetId: BUNDLED_HDRI_PRESET_IDS[0]!,
      width: MODEL_THUMBNAIL_DEFAULT_EDGE, height: MODEL_THUMBNAIL_DEFAULT_EDGE,
      timeoutMs: MODEL_THUMBNAIL_RENDER_TIMEOUT_MS, sourceAuthorizations,
      ...(input.views === undefined ? {} : {
        views: input.views.map((view) => [view[0], view[1], view[2]] as [number, number, number]),
      }),
    }, input.signal);
  };
}
