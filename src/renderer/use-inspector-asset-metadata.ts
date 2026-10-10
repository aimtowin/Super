/** Single Inspector metadata/AI hydration and versioned, serial durable saves. */
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type Dispatch, type MutableRefObject, type SetStateAction,
} from "react";
import type { AssetMetadataResult, AssetSummary } from "../shared/asset-types";
import type { SuperLibraryApi } from "../shared/library-api";
import type { RendererLibrarySummary } from "../shared/protocol/responses";
import { LibraryOperationError, toMessage } from "./error-utils";
import { useLocale, useT } from "./i18n";
import { resolveInspectorDescription } from "./inspector-description";
import {
  IDLE_METADATA_READ_STATE,
  type MetadataReadController, type MetadataReadState, type MetadataSessionOwner,
} from "./metadata-read-controller";

export type InspectorAiContent = {
  assetId: string; description?: string; tags?: string[]; rating?: number; modelVersion?: string;
  reanalysis?: { description: string | null; tags: string[]; rating: number | null; modelVersion: string };
};
export type UseInspectorAssetMetadataParams = {
  api: SuperLibraryApi | null; library: RendererLibrarySummary | null;
  metadataController: MetadataReadController; metadataSession: MetadataSessionOwner | null;
  selectedAssetId: string | undefined;
  selectedAssetIds: readonly string[];
  selectedAssetIdRef: MutableRefObject<string | undefined>;
  selectedAssetIdsRef: MutableRefObject<readonly string[]>;
  assetMetadata: AssetMetadataResult | null;
  editDescription: string;
  editRating: number; editFavorite: boolean; editSourceUrl: string; editAuthor: string;
  setAssetMetadata: Dispatch<SetStateAction<AssetMetadataResult | null>>;
  setVersionConflict: Dispatch<SetStateAction<boolean>>;
  setEditDescription: Dispatch<SetStateAction<string>>; setEditRating: Dispatch<SetStateAction<number>>;
  setEditFavorite: Dispatch<SetStateAction<boolean>>; setEditSourceUrl: Dispatch<SetStateAction<string>>;
  setEditAuthor: Dispatch<SetStateAction<string>>; setDescriptionIsAi: Dispatch<SetStateAction<boolean>>;
  aiContentRef: MutableRefObject<InspectorAiContent | null>;
  setAiContent: Dispatch<SetStateAction<InspectorAiContent | null>>;
  setAssets: Dispatch<SetStateAction<AssetSummary[]>>; setTrashedAssets: Dispatch<SetStateAction<AssetSummary[]>>;
  setNotice: (message: string | null, historyEntryId?: string) => void;
  setError: (message: string | null) => void;
};
export type MetadataSaveFields = {
  description?: string; rating?: number; favorite?: boolean; palette?: string[];
  sourcePageUrl?: string; author?: string;
};
type EditorValues = { description: string; rating: number; favorite: boolean; sourcePageUrl: string; author: string };
export type UseInspectorAssetMetadataResult = {
  loadMetadata: () => Promise<void>; retryMetadata: () => void;
  metadataReadState: MetadataReadState;
  loadAiContentForAsset: (assetId: string) => Promise<void>;
  aiContentLoadedAssetId: string | null;
  saveMetadata: (fields: MetadataSaveFields) => Promise<void>;
};

export function useInspectorAssetMetadata({
  api, library, metadataController, metadataSession,
  selectedAssetId, selectedAssetIds, selectedAssetIdRef, selectedAssetIdsRef,
  editDescription, editRating, editFavorite, editSourceUrl, editAuthor, setAssetMetadata, setVersionConflict,
  setEditDescription, setEditRating, setEditFavorite, setEditSourceUrl, setEditAuthor,
  setDescriptionIsAi, aiContentRef, setAiContent, setAssets, setTrashedAssets,
  setNotice, setError,
}: UseInspectorAssetMetadataParams): UseInspectorAssetMetadataResult {
  const t = useT(); const { locale } = useLocale();
  const metadataSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const selectionKey = [...new Set(selectedAssetIds)].join("\0");
  const editorContext = useMemo(() => ({ owner: metadataSession, assetId: selectedAssetId, selectionKey }),
    [metadataSession, selectedAssetId, selectionKey]);
  const editDescriptionRef = useRef(editDescription);
  const editorValuesRef = useRef<EditorValues>({ description: editDescription, rating: editRating,
    favorite: editFavorite, sourcePageUrl: editSourceUrl, author: editAuthor });
  useLayoutEffect(() => {
    editorValuesRef.current = { description: editDescription, rating: editRating,
      favorite: editFavorite, sourcePageUrl: editSourceUrl, author: editAuthor };
  }, [editDescription, editRating, editFavorite, editSourceUrl, editAuthor]);
  useLayoutEffect(() => { editDescriptionRef.current = editDescription; }, [editDescription]);
  const editorBaselineRef = useRef<{
    context: typeof editorContext;
    owner: MetadataSessionOwner | null; assetId: string | undefined; selectionKey: string;
    values: Partial<EditorValues>; descriptionDraftProtected: boolean; presentedDescription: string;
  } | null>(null);
  useLayoutEffect(() => {
    // Render only computes the prospective identity. A committed selection
    // owns mutable draft baselines; an abandoned render cannot replace them.
    const baseline = { context: editorContext, ...editorContext, values: {} as Partial<EditorValues>,
      descriptionDraftProtected: false, presentedDescription: editDescriptionRef.current };
    editorBaselineRef.current = baseline;
    return () => { if (editorBaselineRef.current === baseline) editorBaselineRef.current = null; };
  }, [editorContext]);
  const [descriptionPublication, setDescriptionPublication] = useState<{
    owner: MetadataSessionOwner; assetId: string; baseline: object; value: string; fromAi: boolean; adoptSource: boolean;
  } | null>(null);
  const [loadedAi, setLoadedAi] = useState<{ owner: MetadataSessionOwner; assetId: string } | null>(null);
  const [, setReadState] = useState<{
    owner: MetadataSessionOwner | null; assetId: string | undefined; state: MetadataReadState;
  }>({ owner: null, assetId: undefined, state: IDLE_METADATA_READ_STATE });

  const publishEditor = useCallback(<K extends keyof EditorValues>(
    owner: MetadataSessionOwner, assetId: string, field: K, value: EditorValues[K],
    setter: Dispatch<SetStateAction<EditorValues[K]>>, submitted?: EditorValues[K],
  ) => {
    const baseline = editorBaselineRef.current;
    if (!baseline || baseline.context !== editorContext || baseline.owner !== owner || baseline.assetId !== assetId) return;
    const hadBaseline = Object.prototype.hasOwnProperty.call(baseline.values, field);
    const previous = baseline.values[field];
    const protectDescription = field === "description" && baseline.descriptionDraftProtected;
    baseline.values[field] = value;
    setter((current) => {
      if (!metadataController.isCurrent(owner) || selectedAssetIdRef.current !== assetId ||
        selectedAssetIdsRef.current.length >= 2 || editorBaselineRef.current !== baseline) return current;
      // A refresh may advance the confirmed baseline but must not consume an
      // unrelated draft, or newer input typed while this same field was saving.
      return !hadBaseline || (!protectDescription && Object.is(current, previous)) ||
        (submitted !== undefined && Object.is(current, submitted)) ? value : current;
    });
  }, [editorContext, metadataController, selectedAssetIdRef, selectedAssetIdsRef]);

  const publishDescription = useCallback((owner: MetadataSessionOwner, assetId: string,
    resolved: { value: string; fromAi: boolean }, submitted?: string,
  ) => {
    const baseline = editorBaselineRef.current;
    if (!baseline || baseline.context !== editorContext || baseline.owner !== owner || baseline.assetId !== assetId) return;
    const currentText = editDescriptionRef.current;
    const acknowledged = submitted !== undefined && currentText === submitted;
    const adoptSource = !Object.prototype.hasOwnProperty.call(baseline.values, "description") || acknowledged ||
      (!baseline.descriptionDraftProtected && (currentText === baseline.values.description || currentText === baseline.presentedDescription));
    // Once a draft was retained, equality with a later AI payload does not
    // turn that human draft into AI input. Only its own confirmed save or a
    // genuine selection/session boundary releases this source protection.
    if (!adoptSource) baseline.descriptionDraftProtected = true;
    else if (acknowledged) baseline.descriptionDraftProtected = false;
    publishEditor(owner, assetId, "description", resolved.value, setEditDescription, submitted);
    setDescriptionPublication({ owner, assetId, baseline, ...resolved, adoptSource });
  }, [editorContext, publishEditor, setEditDescription]);

  useLayoutEffect(() => {
    if (!descriptionPublication) return;
    const publication = descriptionPublication;
    const baseline = editorBaselineRef.current;
    if (!baseline) return;
    const canPublish = () => metadataController.isCurrent(publication.owner) &&
      selectedAssetIdRef.current === publication.assetId && selectedAssetIdsRef.current.length < 2 &&
      editorBaselineRef.current === publication.baseline;
    if (!canPublish()) return;
    if (!publication.adoptSource || editDescription !== publication.value) {
      baseline.descriptionDraftProtected = true;
      return;
    }
    baseline.presentedDescription = editDescription;
    // Synchronize provenance only after the controlled text actually adopted
    // the candidate. No setState side effects occur inside the text updater.
    setDescriptionIsAi((current) => canPublish() && editDescriptionRef.current === publication.value ? publication.fromAi : current);
  }, [descriptionPublication, editDescription, metadataController, selectedAssetIdRef, selectedAssetIdsRef, setDescriptionIsAi]);

  // The controller already committed this value. Editor drafts are separate
  // from that confirmed baseline; successful saves acknowledge only their fields.
  const applyCurrentMetadata = useCallback((owner: MetadataSessionOwner, assetId: string, submitted?: MetadataSaveFields) => {
    if (!metadataController.isCurrent(owner) || selectedAssetIdRef.current !== assetId) return;
    const metadata = metadataController.peek(owner, assetId);
    if (!metadata) return;
    const canPublish = () => metadataController.isCurrent(owner) && selectedAssetIdRef.current === assetId;
    setVersionConflict((current) => canPublish() ? metadataController.hasConflict(owner, assetId) : current);
    setAssetMetadata((current) => canPublish() ? metadata : current);
    if (selectedAssetIdsRef.current.length >= 2) return;
    const ai = aiContentRef.current?.assetId === assetId ? aiContentRef.current : null;
    const description = resolveInspectorDescription(metadata.description, ai?.description);
    publishDescription(owner, assetId, description, submitted?.description);
    publishEditor(owner, assetId, "rating", metadata.rating, setEditRating, submitted?.rating);
    publishEditor(owner, assetId, "favorite", metadata.favorite, setEditFavorite, submitted?.favorite);
    publishEditor(owner, assetId, "sourcePageUrl", metadata.sourcePageUrl ?? "", setEditSourceUrl, submitted?.sourcePageUrl);
    publishEditor(owner, assetId, "author", metadata.author ?? "", setEditAuthor, submitted?.author);
  }, [metadataController, selectedAssetIdRef, selectedAssetIdsRef, aiContentRef,
    setVersionConflict, setAssetMetadata,
    setEditRating, setEditFavorite, setEditSourceUrl, setEditAuthor, publishEditor, publishDescription]);

  const loadMetadata = useCallback(async () => {
    const owner = metadataSession;
    if (!owner || !selectedAssetId || !metadataController.isCurrent(owner)) return;
    // Explicit conflict recovery replaces only the drafts present at the click.
    // Ordinary/background reads still preserve drafts, as does newer input
    // entered while this read is in flight. Do not acknowledge a stale read.
    const conflictDraft = metadataController.hasConflict(owner, selectedAssetId)
      ? { ...editorValuesRef.current } : undefined;
    const clickedBaseline = editorBaselineRef.current;
    metadataController.invalidate(owner, [selectedAssetId]);
    const result = await metadataController.request(owner, selectedAssetId, "primary");
    if (!metadataController.isCurrent(owner)) return;
    if (result.ok) applyCurrentMetadata(owner, selectedAssetId,
      !metadataController.hasConflict(owner, selectedAssetId) && editorBaselineRef.current === clickedBaseline
        ? conflictDraft : undefined);
    else if (result.error.code !== "CANCELLED") {
      setError(toMessage(new LibraryOperationError(result.error), t("toast.readMetadataFailed"), locale));
    }
  }, [metadataSession, selectedAssetId, metadataController, applyCurrentMetadata, setError, t, locale]);

  const retryMetadata = useCallback(() => {
    if (metadataSession && selectedAssetId) metadataController.retry(metadataSession, [selectedAssetId]);
  }, [metadataController, metadataSession, selectedAssetId]);

  const loadAiContentForAsset = useCallback(async (assetId: string) => {
    const owner = metadataSession;
    if (!api || !owner || !assetId || !metadataController.isCurrent(owner)) return;
    const epoch = metadataController.getEpoch(owner, assetId);
    const canPublish = () => metadataController.isCurrent(owner) &&
      metadataController.getEpoch(owner, assetId) === epoch && selectedAssetIdRef.current === assetId;
    try {
      const result = await api.getAiContent({ libraryId: owner.libraryId, assetId });
      if (!canPublish()) return;
      if (!result.ok) {
        setAiContent((current) => canPublish() ? null : current);
        setLoadedAi((current) => canPublish() ? null : current);
        return;
      }
      setLoadedAi((current) => canPublish() ? { owner, assetId } : current);
      const { description, tags, rating, modelVersion, reanalysis } = result.value;
      const next: InspectorAiContent | null = description?.trim() || tags.length || rating != null || reanalysis
        ? { assetId, ...(description ? { description } : {}), ...(tags.length ? { tags } : {}),
          ...(rating != null ? { rating } : {}), ...(modelVersion ? { modelVersion } : {}),
          ...(reanalysis ? { reanalysis } : {}) }
        : null;
      setAiContent((current) => canPublish() ? next : current);
      if (selectedAssetIdsRef.current.length < 2) {
        const human = metadataController.peek(owner, assetId)?.description ?? "";
        const resolved = resolveInspectorDescription(human, next?.description);
        publishDescription(owner, assetId, resolved);
      }
    } catch {
      if (canPublish()) {
        setAiContent((current) => canPublish() ? null : current);
        setLoadedAi((current) => canPublish() ? null : current);
      }
    }
  }, [api, metadataController, metadataSession, selectedAssetIdRef, selectedAssetIdsRef,
    setAiContent, publishDescription]);

  useEffect(() => {
    const owner = metadataSession;
    let cancelled = false;
    if (!owner || !selectedAssetId || !api) {
      queueMicrotask(() => {
        if (cancelled) return;
        setAssetMetadata((current) => cancelled ? current : null);
        setVersionConflict((current) => cancelled ? current : false);
        setAiContent((current) => cancelled ? current : null);
        setLoadedAi((current) => cancelled ? current : null);
        setDescriptionIsAi((current) => cancelled ? current : false);
        setReadState({ owner, assetId: selectedAssetId, state: IDLE_METADATA_READ_STATE });
      });
      return () => { cancelled = true; };
    }
    let hydratedEpoch = metadataController.getEpoch(owner, selectedAssetId);
    let reportedFailure: string | undefined;
    queueMicrotask(() => {
      if (cancelled || !metadataController.isCurrent(owner)) return;
      const canPublish = () => !cancelled && metadataController.isCurrent(owner) && selectedAssetIdRef.current === selectedAssetId;
      setLoadedAi((current) => canPublish() ? null : current);
      setAiContent((current) => canPublish() ? null : current);
      void loadAiContentForAsset(selectedAssetId);
    });
    const unsubscribe = metadataController.observe(owner, [selectedAssetId], "primary", (state) => {
      if (cancelled || !metadataController.isCurrent(owner) || selectedAssetIdRef.current !== selectedAssetId) return;
      setReadState({ owner, assetId: selectedAssetId, state });
      const canPublish = () => !cancelled && metadataController.isCurrent(owner) && selectedAssetIdRef.current === selectedAssetId;
      setVersionConflict((current) => canPublish() ? metadataController.hasConflict(owner, selectedAssetId) : current);
      if (state.status === "ready") {
        reportedFailure = undefined; applyCurrentMetadata(owner, selectedAssetId);
        const epoch = metadataController.getEpoch(owner, selectedAssetId);
        if (epoch !== hydratedEpoch) { hydratedEpoch = epoch; void loadAiContentForAsset(selectedAssetId); }
      } else {
        setAssetMetadata((current) => canPublish() ? null : current);
        if (state.error && state.error.code !== reportedFailure) {
          reportedFailure = state.error.code;
          setError(toMessage(new LibraryOperationError(state.error), t("toast.readMetadataFailed"), locale));
        }
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [api, metadataController, metadataSession, selectedAssetId, selectedAssetIdRef,
    applyCurrentMetadata, loadAiContentForAsset, setAssetMetadata, setVersionConflict,
    setAiContent, setDescriptionIsAi, setError, t, locale]);

  const saveMetadata = useCallback((fields: MetadataSaveFields): Promise<void> => {
    const owner = metadataSession; const targetAssetId = selectedAssetId;
    if (!api || !library || !owner || !targetAssetId ||
      !metadataController.isCurrent(owner) || metadataController.hasConflict(owner, targetAssetId)) return Promise.resolve();
    const targetApi = api; setError(null);
    const operation = metadataSaveQueueRef.current.then(async () => {
      if (!metadataController.isCurrent(owner) || metadataController.hasConflict(owner, targetAssetId)) return;
      let currentMetadata = metadataController.lastConfirmed(owner, targetAssetId);
      if (!currentMetadata) {
        const read = await metadataController.request(owner, targetAssetId, "primary");
        if (!read.ok || !metadataController.isCurrent(owner)) return;
        currentMetadata = read.value;
      }
      const ticket = metadataController.beginMutation(owner, [targetAssetId]);
      try {
        const result = await targetApi.setAssetMetadata({ libraryId: owner.libraryId, assetId: targetAssetId,
          expectedVersion: currentMetadata.entityVersion, ...fields });
        // Dispatched durable writes finish, but never publish to a new owner.
        if (!metadataController.isCurrent(owner)) return;
        if (!result.ok) {
          if (result.error.code === "VERSION_CONFLICT") {
            metadataController.markConflict(owner, targetAssetId, result.error.currentEntityVersion!);
            if (selectedAssetIdRef.current === targetAssetId) {
              setVersionConflict((current) => metadataController.isCurrent(owner) && selectedAssetIdRef.current === targetAssetId ? true : current);
            }
            setNotice(t("toast.metadataVersionConflict")); return;
          }
          throw new LibraryOperationError(result.error);
        }
        metadataController.commitMutation(ticket, [result.value]);
        const latest = metadataController.peek(owner, targetAssetId);
        if (latest) {
          const updateSummary = (asset: AssetSummary) => asset.assetId === targetAssetId
            ? { ...asset, rating: latest.rating, favorite: latest.favorite } : asset;
          const canPatchSummary = () => metadataController.isCurrent(owner) && metadataController.peek(owner, targetAssetId) === latest;
          setAssets((current) => canPatchSummary() ? current.map(updateSummary) : current);
          setTrashedAssets((current) => canPatchSummary() ? current.map(updateSummary) : current);
          applyCurrentMetadata(owner, targetAssetId, fields);
        }
        setNotice(t("toast.metadataSaved"), result.value.historyEntryId);
      } catch (caught) {
        if (metadataController.isCurrent(owner)) setError(toMessage(caught, t("toast.metadataSaveFailed"), locale));
      }
    });
    metadataSaveQueueRef.current = operation; return operation;
  }, [api, library, metadataController, metadataSession, selectedAssetId,
    selectedAssetIdRef, setError, setVersionConflict, setNotice, setAssets,
    setTrashedAssets, applyCurrentMetadata, t, locale]);

  const currentState = selectedAssetId && metadataSession
    ? metadataController.snapshot(metadataSession, [selectedAssetId]) : IDLE_METADATA_READ_STATE;
  return { loadMetadata, retryMetadata, metadataReadState: currentState, loadAiContentForAsset, saveMetadata,
    aiContentLoadedAssetId: loadedAi?.owner === metadataSession ? loadedAi.assetId : null };
}
