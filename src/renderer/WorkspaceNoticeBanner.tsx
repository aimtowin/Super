import { Icon } from "./Icons";
import { IconActionButton } from "./icon-action-button";
import { useT } from "./i18n";
import type { ToastMessage } from './toast-notifications';
import { Notice } from './ui/patterns';

export interface WorkspaceNoticeBannerProps {
  readonly message: ToastMessage;
  readonly toastId: number;
  readonly closing: boolean;
  readonly undoLabel?: string;
  readonly onUndo?: () => void;
  readonly onDismiss: () => void;
  readonly onTransitionEnd: (event: React.TransitionEvent) => void;
}

/**
 * Unified top-center shell notice for info/warning/error (Super-ss1k / nlji).
 */
export function WorkspaceNoticeBanner({
  message,
  toastId,
  closing,
  undoLabel,
  onUndo,
  onDismiss,
  onTransitionEnd,
}: WorkspaceNoticeBannerProps) {
  const t = useT();
  const isProgress = message.kind === "progress";
  const iconName =
    message.kind === "error" || message.kind === "warning" ? "warning" : "info";
  const tone: "info" | "warning" | "error" =
    message.kind === "warning" || message.kind === "error"
      ? message.kind
      : "info";
  return (
    <Notice
      actions={(
        <span className="workspace-notice-actions">
          {undoLabel && onUndo ? (
            <IconActionButton
              className="workspace-notice-undo"
              icon="undo"
              label={undoLabel}
              onClick={onUndo}
              size={14}
            />
          ) : null}
        </span>
      )}
      className={`workspace-notice-item${closing ? ' is-closing' : ''}`}
      data-toast-id={toastId}
      dismissLabel={isProgress ? undefined : t('common.closeHint')}
      dismissible={!isProgress}
      liveRegion={false}
      leading={(
        <span className="workspace-notice-icon" aria-hidden>
          {isProgress ? (
            <span className="workspace-notice-spinner" />
          ) : (
            <Icon name={iconName} size={15} />
          )}
        </span>
      )}
      message={message.text}
      onTransitionEnd={onTransitionEnd}
      onDismiss={onDismiss}
      tone={tone}
    >
    </Notice>
  );
}
