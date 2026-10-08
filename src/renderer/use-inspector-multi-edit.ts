/** Complete multi-selection Inspector reads and durable per-target writes. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AssetMetadataResult, AssetSummary } from "../shared/asset-types";
import type { SuperLibraryApi } from "../shared/library-api";
import type { RendererLibrarySummary } from "../shared/protocol/responses";
import { formatBatchRatingNotice } from "./batch-tag-notice";
import { LibraryOperationError, toMessage } from "./error-utils";
import { useLocale, useT } from "./i18n";
import { editorFieldsFromMultiEdit, rebuildMultiEditFromCache, type InspectorMultiEditModel } from "./inspector-multi-edit";
import { IDLE_METADATA_READ_STATE, type MetadataReadController, type MetadataReadState, type MetadataSessionOwner } from "./metadata-read-controller";

export type UseInspectorMultiEditParams = {
  api: SuperLibraryApi | null; library: RendererLibrarySummary | null;
  metadataController: MetadataReadController; metadataSession: MetadataSessionOwner | null;
  selectedAssetIds: readonly string[]; selectedAssetIdRef: MutableRefObject<string | undefined>;
  setEditDescription: Dispatch<SetStateAction<string>>; setEditRating: Dispatch<SetStateAction<number>>;
  setEditFavorite: Dispatch<SetStateAction<boolean>>; setEditSourceUrl: Dispatch<SetStateAction<string>>;
  setEditAuthor: Dispatch<SetStateAction<string>>; setAssetMetadata: Dispatch<SetStateAction<AssetMetadataResult | null>>;
  setAssets: Dispatch<SetStateAction<AssetSummary[]>>; setTrashedAssets: Dispatch<SetStateAction<AssetSummary[]>>;
  setNotice: (message: string | null, historyEntryId?: string) => void; setError: (message: string | null) => void;
};
type Fields = { description?: string; favorite?: boolean; palette?: string[]; sourcePageUrl?: string; author?: string };
export type UseInspectorMultiEditResult = {
  multiEdit: InspectorMultiEditModel | null; metadataReadState: MetadataReadState; retryMetadata: () => void;
  applyMultiEditModel: (model: InspectorMultiEditModel | null) => void;
  rebuildAndApplyMultiEdit: (assetIds: readonly string[]) => void;
  saveMetadataForSelection: (assetIds: readonly string[], fields: Fields) => Promise<void>;
  batchSetRatingForSelection: (rating: number, assetIds: string[]) => Promise<void>;
};

export function useInspectorMultiEdit({
  api, library, metadataController, metadataSession, selectedAssetIds,
  setEditDescription, setEditRating, setEditFavorite, setEditSourceUrl, setEditAuthor,
  setAssets, setTrashedAssets, setNotice, setError,
}: UseInspectorMultiEditParams): UseInspectorMultiEditResult {
  const t = useT(); const { locale } = useLocale();
  const idsKey = [...new Set(selectedAssetIds)].join("\0");
  type EditorValues = ReturnType<typeof editorFieldsFromMultiEdit>;
  const editorContext = useMemo(() => ({ owner: metadataSession, idsKey }), [metadataSession, idsKey]);
  const editorBaselineRef = useRef<{ context: typeof editorContext; owner: MetadataSessionOwner | null;
    idsKey: string; values: Partial<EditorValues> } | null>(null);
  useLayoutEffect(() => {
    const baseline = { context: editorContext, ...editorContext, values: {} as Partial<EditorValues> };
    editorBaselineRef.current = baseline;
    return () => { if (editorBaselineRef.current === baseline) editorBaselineRef.current = null; };
  }, [editorContext]);
  const [published, setPublished] = useState<{ owner: MetadataSessionOwner | null; idsKey: string;
    model: InspectorMultiEditModel | null; state: MetadataReadState;
  }>({ owner: null, idsKey: "", model: null, state: IDLE_METADATA_READ_STATE });
  const syncEditors = useCallback((model: InspectorMultiEditModel | null, selectionKey: string, submitted?: Partial<EditorValues>) => {
    const owner = metadataSession; const baseline = editorBaselineRef.current;
    if (!model || !owner || !baseline || baseline.context !== editorContext || !metadataController.isCurrent(owner) ||
      baseline.owner !== owner || baseline.idsKey !== selectionKey) return;
    const fields = editorFieldsFromMultiEdit(model);
    const publish = <K extends keyof EditorValues>(field: K, setter: Dispatch<SetStateAction<EditorValues[K]>>) => {
      const hadBaseline = Object.prototype.hasOwnProperty.call(baseline.values, field);
      const previous = baseline.values[field]; const value = fields[field];
      baseline.values[field] = value;
      const acknowledged = submitted?.[field];
      setter((current) => metadataController.isCurrent(owner) && editorBaselineRef.current === baseline &&
        (!hadBaseline || Object.is(current, previous) ||
          (model[field].kind === "uniform" && acknowledged !== undefined && Object.is(current, acknowledged))) ? value : current);
    };
    publish("description", setEditDescription); publish("rating", setEditRating); publish("favorite", setEditFavorite);
    publish("sourceUrl", setEditSourceUrl); publish("author", setEditAuthor);
  }, [editorContext, metadataController, metadataSession, setEditDescription, setEditRating, setEditFavorite, setEditSourceUrl, setEditAuthor]);
  const rebuildAndApplyMultiEdit = useCallback((assetIds: readonly string[], submitted?: Partial<EditorValues>) => {
    const owner = metadataSession;
    if (!owner || !metadataController.isCurrent(owner)) return;
    const ids = [...new Set(assetIds)]; const state = metadataController.snapshot(owner, ids);
    const model = state.status === "ready" ? rebuildMultiEditFromCache(ids, metadataController.currentCache(owner)) : null;
    setPublished({ owner, idsKey: ids.join("\0"), model, state }); syncEditors(model, ids.join("\0"), submitted);
  }, [metadataController, metadataSession, syncEditors]);
  const applyMultiEditModel = useCallback(() => {
    rebuildAndApplyMultiEdit(idsKey ? idsKey.split("\0") : []);
  }, [rebuildAndApplyMultiEdit, idsKey]);
  const retryMetadata = useCallback(() => {
    if (metadataSession) metadataController.retry(metadataSession, idsKey ? idsKey.split("\0") : []);
  }, [metadataController, metadataSession, idsKey]);

  useEffect(() => {
    const owner = metadataSession; const ids = idsKey ? idsKey.split("\0") : []; let cancelled = false;
    if (!owner || !api || ids.length < 2) {
      queueMicrotask(() => { if (!cancelled) setPublished({ owner, idsKey, model: null, state: IDLE_METADATA_READ_STATE }); });
      return () => { cancelled = true; };
    }
    let reportedFailure: string | undefined;
    const unsubscribe = metadataController.observe(owner, ids, "bulk", (state) => {
      if (cancelled || !metadataController.isCurrent(owner)) return;
      const model = state.status === "ready" ? rebuildMultiEditFromCache(ids, metadataController.currentCache(owner)) : null;
      setPublished({ owner, idsKey, model, state }); syncEditors(model, idsKey);
      if (state.error && reportedFailure !== state.error.code) {
        reportedFailure = state.error.code;
        setError(toMessage(new LibraryOperationError(state.error), t("toast.readMetadataFailed"), locale));
      } else if (state.status === "ready") reportedFailure = undefined;
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [api, metadataController, metadataSession, idsKey, syncEditors, setError, t, locale]);

  const saveMetadataForSelection = useCallback(async (assetIds: readonly string[], fields: Fields) => {
    const owner = metadataSession;
    if (!api || !library || !owner || !assetIds.length || !metadataController.isCurrent(owner)) return;
    const targetApi = api; const ids = [...new Set(assetIds)];
    let updated = 0; let conflicts = 0; let lastHistoryEntryId: string | undefined;
    for (const assetId of ids) {
      if (!metadataController.isCurrent(owner)) return;
      if (metadataController.hasConflict(owner, assetId)) { conflicts++; continue; }
      let current = metadataController.peek(owner, assetId);
      if (!current) {
        const read = await metadataController.request(owner, assetId, "bulk");
        if (!metadataController.isCurrent(owner)) return;
        if (!read.ok) {
          if (read.error.code !== "CANCELLED") setError(toMessage(new LibraryOperationError(read.error), t("toast.readMetadataFailed"), locale));
          continue;
        }
        current = read.value;
      }
      const ticket = metadataController.beginMutation(owner, [assetId]);
      try {
        const result = await targetApi.setAssetMetadata({ libraryId: owner.libraryId, assetId, expectedVersion: current.entityVersion, ...fields });
        if (!metadataController.isCurrent(owner)) return;
        if (!result.ok) {
          if (result.error.code === "VERSION_CONFLICT") {
            metadataController.markConflict(owner, assetId, result.error.currentEntityVersion!); conflicts++; continue;
          }
          throw new LibraryOperationError(result.error);
        }
        metadataController.commitMutation(ticket, [result.value]); updated++; lastHistoryEntryId = result.value.historyEntryId;
        const latest = metadataController.peek(owner, assetId);
        if (latest && fields.favorite !== undefined) {
          const update = (asset: AssetSummary) => asset.assetId === assetId ? { ...asset, favorite: latest.favorite } : asset;
          const canPatchSummary = () => metadataController.isCurrent(owner) && metadataController.peek(owner, assetId) === latest;
          setAssets((items) => canPatchSummary() ? items.map(update) : items);
          setTrashedAssets((items) => canPatchSummary() ? items.map(update) : items);
        }
      } catch (caught) {
        if (metadataController.isCurrent(owner)) setError(toMessage(caught, t("toast.metadataSaveFailed"), locale)); return;
      }
    }
    if (!metadataController.isCurrent(owner)) return;
    rebuildAndApplyMultiEdit(ids, { description: fields.description, favorite: fields.favorite,
      sourceUrl: fields.sourcePageUrl, author: fields.author });
    if (conflicts) setNotice(t("toast.metadataVersionConflict"));
    else if (updated) setNotice(t("toast.metadataSaved"), lastHistoryEntryId);
  }, [api, library, metadataController, metadataSession, setError, t, locale,
    setAssets, setTrashedAssets, rebuildAndApplyMultiEdit, setNotice]);

  const batchSetRatingForSelection = useCallback(async (rating: number, assetIds: string[]) => {
    const owner = metadataSession;
    if (!api || !library || !owner || !assetIds.length || !metadataController.isCurrent(owner)) return;
    const ids = [...new Set(assetIds)]; const ticket = metadataController.beginMutation(owner, ids);
    try {
      const result = await api.setAssetsRating({ libraryId: owner.libraryId, assetIds: ids, rating });
      if (!metadataController.isCurrent(owner)) return;
      if (!result.ok) throw new LibraryOperationError(result.error);
      const skipped = new Set(result.value.skipped.map((item) => item.assetId));
      const applied = new Set(ids.filter((assetId) => !skipped.has(assetId)));
      const optimistic = new Set([...applied].filter((assetId) => metadataController.getEpoch(owner, assetId) === ticket.epochs.get(assetId)));
      // Batch rating leaves entityVersion unchanged; its success still expires
      // pre-mutation reads, and active selections re-read the complete metadata.
      metadataController.commitMutation({ owner, epochs: new Map([...ticket.epochs].filter(([assetId]) => applied.has(assetId))) });
      const publicationEpochs = new Map([...optimistic].map((assetId) => [assetId, metadataController.getEpoch(owner, assetId)]));
      const update = (asset: AssetSummary) => optimistic.has(asset.assetId) && metadataController.getEpoch(owner, asset.assetId) === publicationEpochs.get(asset.assetId)
        ? { ...asset, rating } : asset;
      setAssets((items) => metadataController.isCurrent(owner) ? items.map(update) : items);
      setTrashedAssets((items) => metadataController.isCurrent(owner) ? items.map(update) : items);
      rebuildAndApplyMultiEdit(ids);
      setNotice(formatBatchRatingNotice(rating, ids.length - result.value.skipped.length, result.value.skipped, locale), result.value.historyEntryId);
    } catch (caught) {
      if (metadataController.isCurrent(owner)) setError(toMessage(caught, t("toast.batchRatingFailed"), locale));
    }
  }, [api, library, metadataController, metadataSession, setAssets, setTrashedAssets,
    rebuildAndApplyMultiEdit, setNotice, setError, t, locale]);

  const isPublished = published.owner === metadataSession && published.idsKey === idsKey;
  const state = new Set(selectedAssetIds).size >= 2 && metadataSession
    ? metadataController.snapshot(metadataSession, selectedAssetIds) : IDLE_METADATA_READ_STATE;
  return { multiEdit: isPublished && state.status === "ready" ? published.model : null, metadataReadState: state,
    retryMetadata, applyMultiEditModel, rebuildAndApplyMultiEdit, saveMetadataForSelection, batchSetRatingForSelection };
}
