import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import appIcon from "../../assets/icons/app.png";
import { useT } from "./i18n";
import { DialogShell } from "./ui/patterns";
import "./quick-start.css";

type Props = {
  open: boolean;
  step: number;
  onSkip: () => void;
  onNext: () => void;
  onBack: () => void;
  onCreate: () => void;
  onOpen: () => void;
  onImport: () => void;
  onLink: () => void;
  onSettings: (category: "appearance" | "ai") => void;
  onHelp: (kind: "manual" | "feedback") => void;
};

const areas = [".navigation-pane", ".workspace-canvas-host", ".inspector-pane", ".toolbar-workspace-search"];
const areaKeys = ["navigation", "browse", "inspector", "search"] as const;

export function QuickStartGuide(props: Props) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [area, setArea] = useState(0);
  const [placement, setPlacement] = useState<{ highlight?: CSSProperties; card?: CSSProperties }>({});
  // Import conflicts, fatal messages and settings always take precedence.
  useEffect(() => {
    if (!props.open) return;
    const check = () => setBlocked(Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
      .some(node => !hostRef.current?.contains(node) && node.getClientRects().length > 0));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-hidden"] });
    return () => observer.disconnect();
  }, [props.open]);

  const visible = props.open && !blocked;
  const tour = props.step === 2;
  useLayoutEffect(() => {
    if (!visible) return;
    const host = hostRef.current;
    const card = host?.querySelector<HTMLElement>('[role="dialog"]');
    if (!card) return;
    const target = tour ? document.querySelector<HTMLElement>(areas[area]!) : null;
    const update = () => {
      if (!target || target.getClientRects().length === 0) { setPlacement({}); return; }
      const rect = target.getBoundingClientRect();
      const w = window.innerWidth, h = window.innerHeight, gap = 20;
      if (rect.width < 24 || rect.height < 24) { setPlacement({}); return; }
      const width = card.offsetWidth, height = card.offsetHeight;
      const left = Math.max(12, rect.left), top = Math.max(12, rect.top);
      const right = Math.min(w - 12, rect.right), bottom = Math.min(h - 12, rect.bottom);
      // Prefer beside a side panel, then below/above; small windows fall back to center.
      let x = (w - width) / 2, y = (h - height) / 2;
      if (w - right >= width + gap + 12) { x = right + gap; y = top + 24; }
      else if (left >= width + gap + 12) { x = left - width - gap; y = top + 24; }
      else if (h - bottom >= height + gap + 12) { y = bottom + gap; }
      else if (top >= height + gap + 12) { y = top - height - gap; }
      setPlacement({
        highlight: { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
        card: { position: "fixed", left: Math.max(12, Math.min(x, w - width - 12)), top: Math.max(12, Math.min(y, h - height - 12)), margin: 0 },
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    if (target) observer.observe(target);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [visible, tour, area, props.step]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement;
    const host = hostRef.current;
    const card = host?.querySelector<HTMLElement>('[role="dialog"]');
    card?.focus({ preventScroll: true });
    // App shortcuts must not act on assets while the guide owns keyboard focus.
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault(); event.stopImmediatePropagation(); props.onSkip(); return;
      }
      if (event.key === "Tab") {
        const buttons = Array.from(card?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []);
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === card)) {
          event.preventDefault(); first?.focus();
        }
      }
      // Keep native button activation, but prevent document-level workspace shortcuts.
      event.stopPropagation();
    };
    host?.addEventListener("keydown", trap);
    return () => {
      host?.removeEventListener("keydown", trap);
      // Settings/import dialogs may replace the guide while App's shared
      // modal flag stays true, so explicitly hand focus to the replacement.
      const replacement = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'))
        .filter(node => !host?.contains(node) && node.getClientRects().length > 0).at(-1);
      if (replacement) replacement.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')?.focus({ preventScroll: true });
      else if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
    // Callbacks belong to the current visible step; unrelated App renders must not steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, props.step]);

  const stepKeys = ["welcome", "import", "tour", "personalize"] as const;
  const key = stepKeys[props.step] ?? "welcome";
  const next = () => { if (tour && area < 3) setArea(area + 1); else { setArea(0); props.onNext(); } };
  return createPortal(
    <div ref={hostRef} className={`quick-start-layer${tour ? " is-tour" : ""}`} hidden={!visible}>
      {visible && <>
        {tour && placement.highlight && <div className="quick-start-highlight" style={placement.highlight} aria-hidden="true" />}
        <DialogShell
          dialogId="quick-start-guide" className="create-dialog quick-start-dialog" tabIndex={-1}
          style={tour ? placement.card : undefined}
          title={t("quickStart.title")}
          headerActions={<div className="quick-start-header-actions"><span>{props.step + 1} / 4</span><button type="button" className="quick-start-text-button" onClick={props.onSkip}>{t("quickStart.skip")}</button></div>}
          onRequestClose={props.onSkip}
          footer={<>
            <div className="quick-start-footer-actions">
              {props.step > 1 ? <button type="button" className="secondary-button" onClick={() => { if (tour && area > 0) setArea(area - 1); else { setArea(0); props.onBack(); } }}>{t("quickStart.back")}</button> : <span />}
              {props.step === 1 && <button type="button" className="primary-button" onClick={next}>{t("quickStart.continue")}</button>}
              {tour && <button type="button" className="primary-button" onClick={next}>{t("quickStart.next")}</button>}
              {props.step === 3 && <button type="button" className="primary-button" onClick={props.onSkip}>{t("quickStart.finish")}</button>}
            </div>
            <div className="quick-start-progress" aria-hidden="true">{stepKeys.map((item, i) => <span key={item} className={i <= props.step ? "is-complete" : undefined} />)}</div>
          </>}
        >
          <div className="quick-start-intro">
            {props.step === 0 && <img className="quick-start-logo" src={appIcon} alt="Super Lib" />}
            <span className="quick-start-eyebrow">{tour ? `${area + 1} / 4 · ${t("quickStart.workspace")}` : "SUPER LIB"}</span>
            <h3>{t(tour ? `quickStart.${areaKeys[area]}.title` : `quickStart.${key}.title`)}</h3>
            <p>{t(tour ? `quickStart.${areaKeys[area]}.body` : `quickStart.${key}.body`)}</p>
          </div>
          {props.step === 0 && <div className="quick-start-choices">
            <button type="button" className="primary-button" onClick={props.onCreate}>{t("quickStart.create")}</button>
            <button type="button" className="secondary-button" onClick={props.onOpen}>{t("quickStart.open")}</button>
          </div>}
          {props.step === 1 && <div className="quick-start-choices">
            <button type="button" className="quick-start-choice" onClick={props.onImport}><strong>{t("quickStart.importAction")}</strong><span>{t("quickStart.importHint")}</span></button>
            <button type="button" className="quick-start-choice" onClick={props.onLink}><strong>{t("quickStart.link")}</strong><span>{t("quickStart.linkHint")}</span></button>
          </div>}
          {props.step === 3 && <>
            <div className="quick-start-choices">
              <button type="button" className="quick-start-choice" onClick={() => props.onSettings("appearance")}><strong>{t("quickStart.appearance")}</strong><span>{t("quickStart.appearanceHint")}</span></button>
              <button type="button" className="quick-start-choice" onClick={() => props.onSettings("ai")}><strong>{t("quickStart.ai")}</strong><span>{t("quickStart.aiHint")}</span></button>
            </div>
            <p className="quick-start-note">{t("quickStart.optional")}</p>
            <div className="quick-start-links"><button type="button" className="quick-start-text-button" onClick={() => props.onHelp("manual")}>{t("quickStart.manual")}</button><button type="button" className="quick-start-text-button" onClick={() => props.onHelp("feedback")}>{t("quickStart.feedback")}</button></div>
          </>}
        </DialogShell>
      </>}
    </div>, document.body,
  );
}
