import appIcon from "../../assets/icons/app.png";

import { Icon } from "./Icons";
import { iconActionAttrs } from "./icon-action-attrs";
import { useT } from "./i18n";
import { Progress } from "./ui/primitives";
import type {
  AppUpdateCheckResult,
  AppUpdateProgress,
} from "../shared/app-update";
import { type ReactNode } from "react";

export type AboutDialogProps = {
  readonly open: boolean;
  readonly version: string;
  readonly onClose: () => void;
  readonly updateResult?: AppUpdateCheckResult | null;
  readonly updateProgress?: AppUpdateProgress | null;
  readonly checkingForUpdates?: boolean;
  readonly downloadingUpdate?: boolean;
  readonly onCheckForUpdates?: () => void;
  readonly onDownloadAndInstall?: () => void;
  readonly onCancelDownload?: () => void;
};

function updateStatus(
  result: AppUpdateCheckResult | null | undefined,
  t: ReturnType<typeof useT>,
): string {
  if (result === null || result === undefined) return t("dialog.about.updateNotChecked");
  if (!result.ok) return t("dialog.about.updateError");
  if (result.status === "unsupported") return t("dialog.about.updateUnsupported");
  if (result.status === "up-to-date") {
    return t("dialog.about.updateUpToDate", { version: result.latestVersion });
  }
  return t("dialog.about.updateAvailable", { version: result.latestVersion });
}

export function AboutDialog({
  open,
  version,
  onClose,
  updateResult = null,
  updateProgress = null,
  checkingForUpdates = false,
  downloadingUpdate = false,
  onCheckForUpdates,
  onDownloadAndInstall,
  onCancelDownload,
}: AboutDialogProps): ReactNode {
  const t = useT();
  if (!open) return null;
  const updateAvailable = updateResult?.ok === true && updateResult.status === "available";
  const progressMaximum = updateProgress?.totalBytes;
  const progressValue = updateProgress?.downloadedBytes;

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        aria-labelledby="about-dialog-title"
        aria-modal="true"
        className="create-dialog about-dialog"
        role="dialog"
      >
        <button
          className="about-dialog-close"
          onClick={onClose}
          type="button"
          {...iconActionAttrs(t("dialog.about.closeAria"))}
        >
          <Icon name="close" size={16} />
        </button>
        <div className="about-dialog-brand">
          <img alt={t("dialog.about.logoAlt")} src={appIcon} />
          <h2 id="about-dialog-title">{t("dialog.about.productName")}</h2>
          <div className="about-dialog-version-row">
            <span className="about-dialog-version">{t("dialog.about.version", { version })}</span>
            <button
              className="about-dialog-version-action"
              data-checking={checkingForUpdates ? "true" : undefined}
              disabled={checkingForUpdates || downloadingUpdate || onCheckForUpdates === undefined}
              onClick={onCheckForUpdates}
              type="button"
              {...iconActionAttrs(t("dialog.about.checkForUpdates"))}
            >
              <Icon name="refresh" size={14} />
            </button>
          </div>
          {updateAvailable && !downloadingUpdate ? (
            <div className="about-dialog-update-available">
              <span>{t("dialog.about.updateAvailable", { version: updateResult.latestVersion })}</span>
              <button
                className="about-dialog-version-action about-dialog-download-action"
                disabled={onDownloadAndInstall === undefined}
                onClick={onDownloadAndInstall}
                type="button"
                {...iconActionAttrs(t("dialog.about.downloadAndInstall"))}
              >
                <Icon name="download" size={14} />
              </button>
            </div>
          ) : null}
          <span className="about-dialog-update-status">
            {checkingForUpdates ? t("dialog.about.updateChecking") : updateStatus(updateResult, t)}
          </span>
          {downloadingUpdate ? (
            <div className="about-dialog-update-progress">
              <Progress
                aria-label={t("dialog.about.updateDownloading")}
                className="about-dialog-update-progress-bar"
                indeterminate={progressMaximum === undefined || progressValue === undefined}
                max={progressMaximum}
                showValue={progressMaximum !== undefined && progressValue !== undefined}
                value={progressValue}
              />
              <button
                className="about-dialog-update-stop"
                disabled={onCancelDownload === undefined}
                onClick={onCancelDownload}
                type="button"
                {...iconActionAttrs(t("dialog.about.cancelDownload"))}
              >
                <Icon name="stop" size={14} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
