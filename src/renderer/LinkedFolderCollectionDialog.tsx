import type { CollectionSummary } from "../shared/asset-types";
import { Icon } from "./Icons";
import { iconActionAttrs } from "./icon-action-attrs";
import { useT } from "./i18n";
import { DialogShell } from "./ui/patterns";

export interface LinkedFolderCollectionDialogProps {
  folderName: string;
  collections: CollectionSummary[];
  collectionId: string;
  recursive: boolean;
  submitting: boolean;
  onCancel: () => void;
  onCollectionChange: (collectionId: string) => void;
  onRecursiveChange: (recursive: boolean) => void;
  onConfirm: () => void;
}

/**
 * Chooses the target for a static collection-membership snapshot. The source
 * remains a linked directory; no file-copy or future membership sync occurs.
 */
export function LinkedFolderCollectionDialog({
  folderName,
  collections,
  collectionId,
  recursive,
  submitting,
  onCancel,
  onCollectionChange,
  onRecursiveChange,
  onConfirm,
}: LinkedFolderCollectionDialogProps) {
  const t = useT();
  return (
    <div className="dialog-backdrop" role="presentation">
      <DialogShell
        className="create-dialog"
        dialogId="linked-folder-collection-dialog"
        headerActions={
          <button
            className="dialog-close"
            onClick={onCancel}
            type="button"
            {...iconActionAttrs(t("dialog.linkedFolderCollection.cancelAria"))}
          >
            <Icon name="close" size={16} />
          </button>
        }
        style={{ padding: 0 }}
        title={t("dialog.linkedFolderCollection.title", { name: folderName })}
      >
        <p className="field-help">{t("dialog.linkedFolderCollection.help")}</p>
        <label className="field-label field-label-spaced" htmlFor="linked-folder-collection-target">
          {t("dialog.linkedFolderCollection.target")}
        </label>
        <select
          className="text-field"
          id="linked-folder-collection-target"
          onChange={(event) => onCollectionChange(event.target.value)}
          value={collectionId}
        >
          <option value="">{t("dialog.linkedFolderCollection.targetPlaceholder")}</option>
          {collections.map((collection) => (
            <option key={collection.collectionId} value={collection.collectionId}>
              {collection.name}
            </option>
          ))}
        </select>
        <label className="dialog-checkbox-row is-centered">
          <input
            checked={recursive}
            onChange={(event) => onRecursiveChange(event.target.checked)}
            type="checkbox"
          />
          <span>{t("dialog.linkedFolderCollection.includeSubfolders")}</span>
        </label>
        <p className="field-help">{t("dialog.linkedFolderCollection.snapshotNotice")}</p>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            {t("common.cancel")}
          </button>
          <button
            className="primary-button"
            disabled={!collectionId || submitting}
            onClick={() => void onConfirm()}
            type="button"
          >
            {t("dialog.linkedFolderCollection.submit")}
          </button>
        </div>
      </DialogShell>
    </div>
  );
}
