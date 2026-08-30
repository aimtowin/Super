import { Icon } from "./Icons";
import { iconActionAttrs } from "./icon-action-attrs";
import { useT } from "./i18n";
import { DialogShell } from "./ui/patterns";

export interface AiBatchReviewItem {
  assetId: string;
  assetName: string;
  detail?: string | null;
}

export interface AiBatchReview {
  folderName: string;
  succeeded: AiBatchReviewItem[];
  failed: AiBatchReviewItem[];
  skipped: AiBatchReviewItem[];
  cancelled: AiBatchReviewItem[];
}

export function AiBatchReviewDialog({
  review,
  onClose,
}: {
  review: AiBatchReview | null;
  onClose: () => void;
}) {
  const t = useT();
  if (!review) return null;

  const sections: Array<{
    key: "succeeded" | "failed" | "skipped" | "cancelled";
    title: string;
    items: AiBatchReviewItem[];
    empty: string;
  }> = [
    { key: "succeeded", title: "已完成", items: review.succeeded, empty: "没有成功完成的素材。" },
    { key: "failed", title: "失败", items: review.failed, empty: "没有失败的素材。" },
    { key: "skipped", title: "已跳过", items: review.skipped, empty: "没有跳过的素材。" },
    { key: "cancelled", title: "已取消", items: review.cancelled, empty: "没有取消的素材。" },
  ];

  return (
    <div className="dialog-backdrop" role="presentation">
      <DialogShell
        className="create-dialog ai-batch-review-dialog"
        dialogId="ai-batch-review-dialog"
        headerActions={
          <button
            className="dialog-close"
            onClick={onClose}
            type="button"
            {...iconActionAttrs(t("common.close"))}
          >
            <Icon name="close" size={16} />
          </button>
        }
        title={`AI 分析结果：${review.folderName}`}
      >
        <p className="field-help ai-batch-review-summary">
          已完成 {review.succeeded.length} 项，失败 {review.failed.length} 项，
          跳过 {review.skipped.length} 项。
        </p>
        <div className="ai-batch-review-sections">
          {sections.map((section) => (
            <section className={`ai-batch-review-section is-${section.key}`} key={section.key}>
              <h3>{section.title}（{section.items.length}）</h3>
              {section.items.length === 0 ? (
                <p className="field-help">{section.empty}</p>
              ) : (
                <ul>
                  {section.items.map((item) => (
                    <li key={`${section.key}-${item.assetId}`} title={item.detail ?? item.assetName}>
                      <span>{item.assetName}</span>
                      {item.detail ? <small>{item.detail}</small> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="primary-button" onClick={onClose} type="button">
            {t("common.close")}
          </button>
        </div>
      </DialogShell>
    </div>
  );
}
