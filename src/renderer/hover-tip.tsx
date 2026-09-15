import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { isImeKeyboardEvent } from './ime-safe-dismiss';

/** Quiet delay before a hover tip appears (REQ-SHELL-013 follow-up). */
export const HOVER_TIP_SHOW_DELAY_MS = 420;

type TipState = {
  readonly id?: string;
  readonly text: string;
  readonly variant: "default" | "search-syntax";
};

function renderSearchSyntaxTip(text: string): ReactNode {
  return text.split('\n').map((line, lineIndex) => (
    <span className="search-syntax-tip-line" key={`${lineIndex}:${line}`}>
      {line.split(/(\*\*[^*]+\*\*)/u).map((part, partIndex) => {
        const isEmphasis = part.startsWith('**') && part.endsWith('**');
        return isEmphasis ? (
          <strong key={`${partIndex}:${part}`}>{part.slice(2, -2)}</strong>
        ) : (
          <Fragment key={`${partIndex}:${part}`}>{part}</Fragment>
        );
      })}
    </span>
  ));
}

/**
 * Document-level hover tip host. Mount once near the app root. Any element
 * with `data-hover-tip` or `title` participates; the tip renders into a
 * stable bottom-right reading surface so the pointer area stays unobstructed.
 */
export function HoverTipHost() {
  const [tip, setTip] = useState<TipState | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const activeElRef = useRef<Element | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const hide = () => {
      clearTimer();
      activeElRef.current = null;
      setTip(null);
    };

    const scheduleShow = (el: Element) => {
      // Most modern controls opt in with data-hover-tip, but asset names and
      // navigation rows still deliberately use the native title attribute.
      // Feed both paths into the corner bubble without replacing native tips.
      const managedText = el.getAttribute('data-hover-tip')?.trim();
      const nativeTitle = el.getAttribute('title')?.trim();
      const text = managedText || nativeTitle;
      if (!text) {
        hide();
        return;
      }
      if (activeElRef.current === el) return;
      clearTimer();
      activeElRef.current = el;
      setTip(null);
      const source = managedText ? 'managed' : 'native-title';
      const id = source === 'managed'
        ? el.getAttribute('data-hover-tip-id') ?? undefined
        : undefined;
      showTimerRef.current = window.setTimeout(() => {
        if (activeElRef.current !== el) return;
        const variant =
          source === 'managed' &&
          el.getAttribute('data-hover-tip-variant') === 'search-syntax'
            ? 'search-syntax'
            : 'default';
        setTip({ id, text, variant });
        showTimerRef.current = null;
      }, HOVER_TIP_SHOW_DELAY_MS);
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest('[data-hover-tip], [title]');
      if (!el || !(el instanceof Element)) {
        if (activeElRef.current) hide();
        return;
      }
      scheduleShow(el);
    };

    const onPointerOut = (event: PointerEvent) => {
      const related = event.relatedTarget;
      if (
        related instanceof Element &&
        activeElRef.current?.contains(related)
      ) {
        return;
      }
      const leaving = event.target;
      if (
        leaving instanceof Element &&
        activeElRef.current &&
        (leaving === activeElRef.current ||
          activeElRef.current.contains(leaving))
      ) {
        hide();
      }
    };

    const onPointerDown = () => hide();
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest('[data-hover-tip], [title]');
      if (el instanceof Element) scheduleShow(el);
    };
    const onFocusOut = (event: FocusEvent) => {
      const related = event.relatedTarget;
      if (
        related instanceof Element &&
        activeElRef.current?.contains(related)
      ) {
        return;
      }
      const leaving = event.target;
      if (
        leaving instanceof Element &&
        activeElRef.current &&
        (leaving === activeElRef.current || activeElRef.current.contains(leaving))
      ) {
        hide();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (event.key === 'Escape') hide();
    };
    const onScroll = () => hide();

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', hide);

    return () => {
      clearTimer();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!tip || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`hover-tip-corner${tip.variant === 'search-syntax' ? ' is-search-syntax' : ''}`}
      id={tip.id}
      role="tooltip"
    >
      {tip.variant === 'search-syntax'
        ? renderSearchSyntaxTip(tip.text)
        : tip.text}
    </div>,
    document.body,
  );
}
