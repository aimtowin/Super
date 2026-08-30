import { useMemo, useState } from "react";

import type { AiSearchPlan, SmartCollectionSummary } from "../shared/asset-types";
import { Icon } from "./Icons";
import { iconActionAttrs } from "./icon-action-attrs";
import { useT } from "./i18n";
import { DialogShell } from "./ui/patterns";

export function AiSmartCollectionDialog({
  open,
  planning,
  plan,
  temporaryCollection,
  onClose,
  onSubmit,
  onKeepTemporary,
  onDiscardTemporary,
}: {
  open: boolean;
  planning: boolean;
  plan: AiSearchPlan | null;
  temporaryCollection: SmartCollectionSummary | null;
  onClose: () => void;
  onSubmit: (request: string) => void;
  onKeepTemporary: () => void;
  onDiscardTemporary: () => void;
}) {
  const t = useT();
  const [request, setRequest] = useState("");
  const planSummary = useMemo(() => {
    if (!plan) return null;
    const terms = [...plan.keywords, ...plan.synonyms].join("、");
    const excluded = plan.exclusions.length ? `；排除：${plan.exclusions.join("、")}` : "";
    return `将从已分析素材中查找${terms ? `：${terms}` : "匹配条件"}${excluded}。`;
  }, [plan]);

  if (!open) return null;

  const showExample = !planning && !planSummary && !temporaryCollection;
  const close = () => {
    setRequest("");
    onClose();
  };
  const discardTemporary = () => {
    setRequest("");
    onDiscardTemporary();
  };
  const keepTemporary = () => {
    setRequest("");
    onKeepTemporary();
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <DialogShell
        className="create-dialog ai-smart-collection-dialog"
        dialogId="ai-smart-collection-dialog"
        headerActions={
          <button
            className="dialog-close"
            onClick={close}
            type="button"
            {...iconActionAttrs(t("common.close"))}
          >
            <Icon name="close" size={16} />
          </button>
        }
        title="AI 素材查找"
      >
        <p className="field-help ai-smart-collection-disclaimer">
          仅根据已分析素材的名称、标签和描述生成受限检索条件；不会访问或修改源文件。
        </p>
        {showExample ? (
          <div className="ai-smart-collection-example">
            例如：帮我找动漫角色立绘、带有火焰效果的横版视频，或某个已有标签。
          </div>
        ) : null}
        {planning ? (
          <div className="ai-smart-collection-planning" aria-live="polite">
            正在理解检索条件并生成临时合集…
          </div>
        ) : null}
        {temporaryCollection ? (
          <div className="ai-smart-collection-result" aria-live="polite">
            <section className="ai-smart-collection-result-panel">
              <span>检索条件</span>
              <strong>{planSummary ?? "已生成受限检索条件。"}</strong>
            </section>
            <section className="ai-smart-collection-result-panel is-collection">
              <span>临时智能合集</span>
              <strong>{temporaryCollection.name}</strong>
              <small>命中 {temporaryCollection.assetCount} 项已分析素材</small>
            </section>
          </div>
        ) : null}
        {!temporaryCollection ? (
          <form
            className="ai-smart-collection-composer"
            onSubmit={(event) => {
              event.preventDefault();
              const value = request.trim();
              if (value) onSubmit(value);
            }}
          >
            <textarea
              autoFocus
              className="text-field"
              disabled={planning}
              maxLength={1_000}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="描述你想找的素材…"
              rows={3}
              value={request}
            />
            <div className="dialog-actions">
              <button className="secondary-button" onClick={close} type="button">
                {t("common.cancel")}
              </button>
              <button className="primary-button" disabled={planning || !request.trim()} type="submit">
                {planning ? "正在理解并创建…" : "查找并创建临时合集"}
              </button>
            </div>
          </form>
        ) : (
          <div className="dialog-actions">
            <button className="secondary-button" onClick={discardTemporary} type="button">
              丢弃临时合集
            </button>
            <button className="primary-button" onClick={keepTemporary} type="button">
              保留合集
            </button>
          </div>
        )}
      </DialogShell>
    </div>
  );
}
