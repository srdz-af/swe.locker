import {
  memo,
  type ReactNode,
  useLayoutEffect,
  useRef
} from "react";
import ReactMarkdown from "react-markdown";
import { TextArea, Toggle } from "@carbon/react";

export type TextMode = "preview" | "raw";

type TextModePanelProps = {
  id: string;
  mode: TextMode;
  onModeChange: (mode: TextMode) => void;
  title?: ReactNode;
  ariaLabel?: string;
  className?: string;
  headerClassName?: string;
  actionsClassName?: string;
  tabsClassName?: string;
  tabsHelp?: ReactNode;
  tabsAriaLabel: string;
  previewLabel: string;
  rawLabel: string;
  toggleLabel?: string;
  afterHeader?: ReactNode;
  footer?: ReactNode;
  previewAriaLabel?: string;
  previewBodyClassName?: string;
  previewBefore?: ReactNode;
  previewContent?: ReactNode;
  previewEmpty?: ReactNode;
  previewMarkdown?: string;
  rawAriaLabel?: string;
  rawBodyClassName?: string;
  rawContent?: ReactNode;
  rawText?: string;
  rawTextAreaId?: string;
  rawTextAreaLabel?: string;
  rawTextAreaPlaceholder?: string;
  rawTextAreaRows?: number;
  onRawTextChange?: (value: string) => void;
  scrollKey?: string;
};

export const TextModePanel = memo(function TextModePanel({
  actionsClassName,
  afterHeader,
  ariaLabel,
  className,
  footer,
  headerClassName,
  id,
  mode,
  onModeChange,
  onRawTextChange,
  previewAriaLabel,
  previewBefore,
  previewBodyClassName,
  previewContent,
  previewEmpty,
  previewLabel,
  previewMarkdown,
  rawAriaLabel,
  rawBodyClassName,
  rawContent,
  rawLabel,
  rawText = "",
  rawTextAreaId,
  rawTextAreaLabel = "Raw text",
  rawTextAreaPlaceholder,
  rawTextAreaRows = 16,
  scrollKey,
  title,
  tabsAriaLabel,
  tabsClassName,
  tabsHelp,
  toggleLabel
}: TextModePanelProps) {
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const rawScrollRef = useRef<HTMLDivElement | null>(null);
  const rawTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const isEditableRawText = Boolean(onRawTextChange);

  function getScrollElement(targetMode: TextMode) {
    if (targetMode === "raw") {
      return rawTextAreaRef.current ?? rawScrollRef.current;
    }

    return previewScrollRef.current;
  }

  function applyScroll(targetMode: TextMode, scrollTop: number) {
    const scrollElement = getScrollElement(targetMode);

    if (scrollElement) {
      scrollElement.scrollTop = Math.min(scrollTop, Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight));
    }
  }

  function restoreScroll(targetMode: TextMode, scrollTop: number) {
    if (typeof window === "undefined") {
      return;
    }

    if (restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current);
    }

    restoreFrameRef.current = window.requestAnimationFrame(() => {
      applyScroll(targetMode, scrollTop);
      restoreFrameRef.current = null;
    });
  }

  function handleModeChange(nextMode: TextMode) {
    if (nextMode === mode) {
      return;
    }

    pendingScrollTopRef.current = getScrollElement(mode)?.scrollTop ?? 0;
    onModeChange(nextMode);
  }

  useLayoutEffect(() => {
    const scrollTop = pendingScrollTopRef.current;

    if (scrollTop === null) {
      return;
    }

    pendingScrollTopRef.current = null;
    restoreScroll(mode, scrollTop);
  }, [mode]);

  useLayoutEffect(() => {
    pendingScrollTopRef.current = 0;

    if (typeof window === "undefined") {
      return;
    }

    if (restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current);
    }

    restoreFrameRef.current = window.requestAnimationFrame(() => {
      applyScroll("preview", 0);
      applyScroll("raw", 0);
      restoreFrameRef.current = null;
    });
  }, [scrollKey]);

  useLayoutEffect(
    () => () => {
      if (restoreFrameRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(restoreFrameRef.current);
      }
    },
    []
  );

  const previewBodyClasses = [
    "text-mode-panel__body",
    "text-mode-panel__body--preview",
    previewBodyClassName
  ]
    .filter(Boolean)
    .join(" ");
  const rawBodyClasses = [
    "text-mode-panel__body",
    "text-mode-panel__body--raw",
    isEditableRawText ? "text-mode-panel__body--editable" : null,
    rawBodyClassName
  ]
    .filter(Boolean)
    .join(" ");
  const headerClasses = [
    "text-mode-panel__header",
    !title ? "text-mode-panel__header--toolbar-only" : null,
    headerClassName
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      aria-label={ariaLabel}
      className={["text-mode-panel", className].filter(Boolean).join(" ")}
      data-text-mode={mode}
    >
      <div className={headerClasses}>
        {title ? <h3>{title}</h3> : null}
        <div className={["text-mode-panel__actions", actionsClassName].filter(Boolean).join(" ")}>
          <div className={["text-mode-panel__toggle", tabsClassName].filter(Boolean).join(" ")}>
            <Toggle
              aria-label={tabsAriaLabel}
              id={`${id}-mode-toggle`}
              labelA={toggleLabel ?? previewLabel}
              labelB={toggleLabel ?? rawLabel}
              size="sm"
              toggled={mode === "raw"}
              onToggle={(checked) => handleModeChange(checked ? "raw" : "preview")}
            />
          </div>
          {tabsHelp ? <div className="text-mode-panel__tabs-help">{tabsHelp}</div> : null}
        </div>
      </div>

      {afterHeader}

      <div
        aria-hidden={mode !== "preview"}
        aria-label={previewAriaLabel}
        className={previewBodyClasses}
        hidden={mode !== "preview"}
        ref={previewScrollRef}
      >
        {previewContent ?? (
          <>
            {previewBefore}
            {previewMarkdown?.trim() ? <ReactMarkdown>{previewMarkdown}</ReactMarkdown> : previewEmpty}
          </>
        )}
      </div>

      <div
        aria-hidden={mode !== "raw"}
        aria-label={rawAriaLabel}
        className={rawBodyClasses}
        hidden={mode !== "raw"}
        ref={rawScrollRef}
      >
        {rawContent ?? (
          <TextArea
            hideLabel
            id={rawTextAreaId ?? `${id}-raw-text`}
            labelText={rawTextAreaLabel}
            placeholder={rawTextAreaPlaceholder}
            ref={rawTextAreaRef}
            rows={rawTextAreaRows}
            value={rawText}
            onChange={(event) => onRawTextChange?.(event.target.value)}
          />
        )}
      </div>

      {footer}
    </div>
  );
});
