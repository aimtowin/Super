/**
 * Inspector field input/save handlers + AI description promote
 * (Super-uye wave 7 extract from App.tsx).
 */

import {
  useCallback,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  type MutableRefObject,
} from "react";

import type { AssetMetadataResult, AssetSummary } from "../shared/asset-types";
import type { SuperLibraryApi } from "../shared/library-api";
import type { SuperShellApi } from "../shared/external-url";
import { toOpenableExternalUrl } from "../shared/external-url";
import type { RendererLibrarySummary } from "../shared/protocol/responses";
import { toMessage } from "./error-utils";
import { useLocale, useT } from "./i18n";
import type { InspectorMultiEditModel } from "./inspector-multi-edit";
import { isValidInspectorSourceUrl } from "./inspector-source-url";
import { resolveInspectorTagTarget } from "./inspector-tag-target";
import type {
  InspectorAiContent,
  MetadataSaveFields,
} from "./use-inspector-asset-metadata";
import type { MetadataReadController, MetadataSessionOwner } from "./metadata-read-controller";

export type UseInspectorFieldHandlersParams = {
  api: SuperLibraryApi | null;
  shellApi: SuperShellApi | null | undefined;
  library: RendererLibrarySummary | null;
  metadataController: MetadataReadController;
  metadataSession: MetadataSessionOwner | null;
  selectedAssetIdRef: MutableRefObject<string | undefined>;
  selectedAsset: AssetSummary | undefined;
  selectedAssetId: string | undefined;
  selectedAssetIds: readonly string[];
  assetMetadata: AssetMetadataResult | null;
  multiEdit: InspectorMultiEditModel | null;
  editDescription: string;
  editFavorite: boolean;
  editSourceUrl: string;
  editAuthor: string;
  descriptionIsAi: boolean;
  aiContent: InspectorAiContent | null;
  setEditDescription: Dispatch<SetStateAction<string>>;
  setEditRating: Dispatch<SetStateAction<number>>;
  setEditFavorite: Dispatch<SetStateAction<boolean>>;
  setEditSourceUrl: Dispatch<SetStateAction<string>>;
  setEditAuthor: Dispatch<SetStateAction<string>>;
  setDescriptionIsAi: Dispatch<SetStateAction<boolean>>;
  setAiContent: Dispatch<SetStateAction<InspectorAiContent | null>>;
  saveMetadata: (fields: MetadataSaveFields) => Promise<void>;
  saveMetadataForSelection: (
    assetIds: readonly string[],
    fields: {
      description?: string;
      favorite?: boolean;
      sourcePageUrl?: string;
      author?: string;
    },
  ) => Promise<void>;
  batchSetRatingForSelection: (
    rating: number,
    assetIds: string[],
  ) => Promise<void>;
  loadMetadata: () => Promise<void>;
  setNotice: (message: string | null) => void;
  setError: (message: string | null) => void;
};

export function useInspectorFieldHandlers({
  api,
  shellApi,
  library,
  metadataController,
  metadataSession,
  selectedAssetIdRef,
  selectedAsset,
  selectedAssetId,
  selectedAssetIds,
  assetMetadata,
  multiEdit,
  editDescription,
  editFavorite,
  editSourceUrl,
  editAuthor,
  descriptionIsAi,
  aiContent,
  setEditDescription,
  setEditRating,
  setEditFavorite,
  setEditSourceUrl,
  setEditAuthor,
  setDescriptionIsAi,
  setAiContent,
  saveMetadata,
  saveMetadataForSelection,
  batchSetRatingForSelection,
  setNotice,
  setError,
}: UseInspectorFieldHandlersParams) {
  const t = useT();
  const { locale } = useLocale();

  const handlePromoteAiDescription = useCallback(
    async (value: string) => {
      const owner = metadataSession;
      if (!api || !library || !selectedAsset || !metadataController.isCurrent(owner)) return;
      const assetId = selectedAsset.assetId;
      const trimmed = value.trim();
      const previous = aiContent?.description?.trim() ?? "";
      if (
        aiContent?.assetId !== selectedAsset.assetId ||
        trimmed === previous
      ) {
        return;
      }
      try {
        await saveMetadata({ description: trimmed });
        // saveMetadata reports errors through UI rather than rejecting. Do not
        // clear AI provenance unless the versioned human description committed.
        if (!metadataController.isCurrent(owner) || metadataController.hasConflict(owner, assetId) ||
          metadataController.peek(owner, assetId)?.description?.trim() !== trimmed) return;
        const cleared = await api.clearAiContent({
          libraryId: library.libraryId,
          scope: { kind: "asset", assetIds: [selectedAsset.assetId] },
          confirm: false,
          fields: ["description"],
        });
        if (!metadataController.isCurrent(owner)) return;
        if (!cleared.ok) {
          setError(
            toMessage(cleared.error, t("toast.aiContentClearFailed"), locale),
          );
          return;
        }
        metadataController.invalidate(owner, [assetId]);
        if (selectedAssetIdRef.current !== assetId) return;
        setAiContent((current) => {
          if (!metadataController.isCurrent(owner) || selectedAssetIdRef.current !== assetId) return current;
          if (!current || current.assetId !== selectedAsset.assetId) {
            return current;
          }
          const rest = {
            assetId: current.assetId,
            ...(current.tags ? { tags: current.tags } : {}),
            ...(current.rating != null ? { rating: current.rating } : {}),
          };
          const stillHas =
            Boolean(rest.tags && rest.tags.length > 0) || rest.rating != null;
          return stillHas ? rest : null;
        });
        setDescriptionIsAi((current) => metadataController.isCurrent(owner) && selectedAssetIdRef.current === assetId ? false : current);
        setNotice(t("toast.aiContentPromoted"));
      } catch (caught) {
        if (metadataController.isCurrent(owner)) setError(toMessage(caught, t("toast.aiContentPromoteFailed"), locale));
      }
    },
    [
      aiContent,
      api,
      library,
      metadataController,
      metadataSession,
      locale,
      saveMetadata,
      selectedAsset,
      selectedAssetIdRef,
      setAiContent,
      setDescriptionIsAi,
      setError,
      setNotice,
      t,
    ],
  );

  const handleMetadataDescriptionInput = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      setEditDescription((event.target as HTMLTextAreaElement).value);
    },
    [setEditDescription],
  );

  const handleMetadataDescriptionSave = useCallback(() => {
    const target = resolveInspectorTagTarget(
      selectedAssetIds,
      selectedAssetId ?? undefined,
    );
    if (target?.kind === "batch") {
      if (multiEdit?.description.kind !== "uniform") return;
      if (editDescription === multiEdit.description.value) return;
      void saveMetadataForSelection(target.assetIds, {
        description: editDescription,
      });
      return;
    }
    if (descriptionIsAi) {
      void handlePromoteAiDescription(editDescription);
      return;
    }
    if (!assetMetadata || editDescription === (assetMetadata.description ?? "")) {
      return;
    }
    void saveMetadata({ description: editDescription });
  }, [
    assetMetadata,
    descriptionIsAi,
    editDescription,
    handlePromoteAiDescription,
    multiEdit,
    saveMetadata,
    saveMetadataForSelection,
    selectedAssetId,
    selectedAssetIds,
  ]);

  const handleRatingClick = useCallback(
    (rating: number) => {
      const target = resolveInspectorTagTarget(
        selectedAssetIds,
        selectedAssetId ?? undefined,
      );
      if (target?.kind === "batch") {
        if (multiEdit?.rating.kind !== "uniform") return;
        setEditRating(rating);
        void batchSetRatingForSelection(rating, target.assetIds);
        return;
      }
      if (!assetMetadata) return;
      setEditRating(rating);
      void saveMetadata({ rating });
    },
    [
      assetMetadata,
      batchSetRatingForSelection,
      multiEdit,
      saveMetadata,
      selectedAssetId,
      selectedAssetIds,
      setEditRating,
    ],
  );

  const handleFavoriteToggle = useCallback(() => {
    const target = resolveInspectorTagTarget(
      selectedAssetIds,
      selectedAssetId ?? undefined,
    );
    if (target?.kind === "batch") {
      if (multiEdit?.favorite.kind !== "uniform") return;
      const next = !editFavorite;
      setEditFavorite(next);
      void saveMetadataForSelection(target.assetIds, { favorite: next });
      return;
    }
    if (!assetMetadata) return;
    const next = !editFavorite;
    setEditFavorite(next);
    void saveMetadata({ favorite: next });
  }, [
    assetMetadata,
    editFavorite,
    multiEdit,
    saveMetadata,
    saveMetadataForSelection,
    selectedAssetId,
    selectedAssetIds,
    setEditFavorite,
  ]);

  const handleSourceUrlInput = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      setEditSourceUrl((event.target as HTMLInputElement).value);
    },
    [setEditSourceUrl],
  );

  const handleSourceUrlSave = useCallback(() => {
    const target = resolveInspectorTagTarget(
      selectedAssetIds,
      selectedAssetId ?? undefined,
    );
    if (!isValidInspectorSourceUrl(editSourceUrl)) {
      setError(t("toast.sourceUrlSaveFailed"));
      return;
    }
    if (target?.kind === "batch") {
      if (multiEdit?.sourceUrl.kind !== "uniform") return;
      if (editSourceUrl === multiEdit.sourceUrl.value) return;
      void saveMetadataForSelection(target.assetIds, {
        sourcePageUrl: editSourceUrl,
      });
      return;
    }
    if (!assetMetadata || editSourceUrl === (assetMetadata.sourcePageUrl ?? "")) {
      return;
    }
    void saveMetadata({ sourcePageUrl: editSourceUrl });
  }, [
    assetMetadata,
    editSourceUrl,
    multiEdit,
    saveMetadata,
    saveMetadataForSelection,
    selectedAssetId,
    selectedAssetIds,
    setError,
    t,
  ]);

  const handleAuthorInput = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      setEditAuthor((event.target as HTMLInputElement).value);
    },
    [setEditAuthor],
  );

  const handleAuthorSave = useCallback(() => {
    const target = resolveInspectorTagTarget(
      selectedAssetIds,
      selectedAssetId ?? undefined,
    );
    if (target?.kind === "batch") {
      if (multiEdit?.author.kind !== "uniform") return;
      if (editAuthor === multiEdit.author.value) return;
      void saveMetadataForSelection(target.assetIds, { author: editAuthor });
      return;
    }
    if (!assetMetadata || editAuthor === (assetMetadata.author ?? "")) return;
    void saveMetadata({ author: editAuthor });
  }, [
    assetMetadata,
    editAuthor,
    multiEdit,
    saveMetadata,
    saveMetadataForSelection,
    selectedAssetId,
    selectedAssetIds,
  ]);

  const handleOpenSourceUrl = useCallback(() => {
    const url = toOpenableExternalUrl(editSourceUrl);
    if (!url || !shellApi) return;
    void shellApi.openExternalUrl(url).then((result) => {
      if (result.ok) return;
      const toastKey =
        result.code === "rejected_url" || result.code === "malformed_request"
          ? "toast.sourceUrlOpenFailed"
          : result.code === "unauthorized_sender"
            ? "toast.sourceUrlOpenUnauthorized"
            : "toast.sourceUrlOpenShellFailed";
      setError(t(toastKey));
    });
  }, [editSourceUrl, setError, shellApi, t]);

  return {
    handleMetadataDescriptionInput,
    handleMetadataDescriptionSave,
    handleRatingClick,
    handleFavoriteToggle,
    handleSourceUrlInput,
    handleSourceUrlSave,
    handleAuthorInput,
    handleAuthorSave,
    handleOpenSourceUrl,
    handlePromoteAiDescription,
  };
}
