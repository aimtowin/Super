import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { FloatingPreviewState } from "../shared/floating-preview";
import { LocaleProvider } from "./i18n";
import { PdfViewerSurface } from "./PdfViewerSurface";
import "./styles.css";
import "./floating-preview.css";

type FloatingPreviewWindow = Window & {
  superFloatingPreview?: {
    getState(): Promise<FloatingPreviewState>;
    close(): void;
  };
};

function FloatingPreviewApp() {
  const [state, setState] = useState<FloatingPreviewState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (window as FloatingPreviewWindow).superFloatingPreview
      ?.getState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      (window as FloatingPreviewWindow).superFloatingPreview?.close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const close = () =>
    (window as FloatingPreviewWindow).superFloatingPreview?.close();

  return (
    <main className="floating-preview-shell">
      <div aria-hidden="true" className="floating-preview-drag-region" />
      <div className="floating-preview-actions">
        <button aria-label="关闭悬浮预览" onClick={close} title="关闭" type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
      </div>
      {state?.mediaType === "image" ? (
        <img
          alt="悬浮图片预览"
          className="floating-preview-image"
          draggable={false}
          onError={() => setFailed(true)}
          src={state.sourceUrl}
        />
      ) : state?.mediaType === "pdf" ? (
        <div className="floating-preview-document">
          <PdfViewerSurface isFullscreen={false} sourceUrl={state.sourceUrl} />
        </div>
      ) : failed ? (
        <p className="floating-preview-status">预览暂时无法显示</p>
      ) : (
        <p aria-live="polite" className="floating-preview-status">正在打开预览…</p>
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Floating preview root is missing.");

createRoot(root).render(
  <LocaleProvider>
    <FloatingPreviewApp />
  </LocaleProvider>,
);
