"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { InstallOption } from "./install-targets";

const COPY_RESET_MS = 1600;
const OPTION_INDEX_ATTRIBUTE = "data-install-index";

/**
 * Headless state for an install picker: which target is selected, whether the
 * list is open, where keyboard focus sits, and whether the snippet was just
 * copied. It renders nothing and carries no styling, so the landing hero and a
 * tool page's sidebar can wear completely different faces over the same
 * behaviour.
 *
 * The returned prop getters carry the ARIA listbox wiring. Spread them rather
 * than reimplementing the attributes, because `aria-activedescendant` and the
 * option ids have to agree for a screen reader to announce the highlighted row.
 */
export function useInstallPicker(options: readonly InstallOption[]) {
  const baseId = useId();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const copyResetRef = useRef<number | undefined>(undefined);

  const selected = options[selectedIndex] ?? options[0];
  const optionId = useCallback(
    (index: number) => `${baseId}-option-${index}`,
    [baseId]
  );

  const close = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const open = useCallback(() => {
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  }, [selectedIndex]);

  const select = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      setCopied(false);
      close(true);
    },
    [close]
  );

  // Moving focus onto the highlighted row is what makes Arrow keys audible to a
  // screen reader; `aria-activedescendant` alone leaves the announcement stale.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const row = listboxRef.current?.querySelector<HTMLElement>(
      `[${OPTION_INDEX_ATTRIBUTE}="${activeIndex}"]`
    );
    row?.focus();
  }, [activeIndex, isOpen]);

  // A dropdown that survives a click on the page behind it reads as stuck.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      // Only an explicit "outside" closes it; an unmounted container does not.
      if (containerRef.current?.contains(event.target as Node) === false) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  useEffect(
    () => () => {
      if (copyResetRef.current !== undefined) {
        window.clearTimeout(copyResetRef.current);
      }
    },
    []
  );

  const copy = useCallback(async () => {
    if (selected === undefined) {
      return;
    }
    await navigator.clipboard.writeText(selected.snippet);
    setCopied(true);

    if (copyResetRef.current !== undefined) {
      window.clearTimeout(copyResetRef.current);
    }
    copyResetRef.current = window.setTimeout(() => {
      setCopied(false);
    }, COPY_RESET_MS);
  }, [selected]);

  const onTriggerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        open();
      }
    },
    [open]
  );

  const onListboxKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const last = options.length - 1;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((index) => (index >= last ? 0 : index + 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((index) => (index <= 0 ? last : index - 1));
          break;
        case "Home":
          event.preventDefault();
          setActiveIndex(0);
          break;
        case "End":
          event.preventDefault();
          setActiveIndex(last);
          break;
        case "Escape":
          event.preventDefault();
          close(true);
          break;
        case "Tab":
          close(false);
          break;
        default:
          break;
      }
    },
    [close, options.length]
  );

  // One handler for every row, reading its index off the DOM node. Binding a
  // fresh closure per row would allocate on each render for no gain.
  const onOptionClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const raw = event.currentTarget.getAttribute(OPTION_INDEX_ATTRIBUTE);
      if (raw !== null) {
        select(Number(raw));
      }
    },
    [select]
  );

  return {
    /** True for the seconds after the snippet reaches the clipboard. */
    copied,
    getContainerProps: () => ({ ref: containerRef }),
    getCopyButtonProps: () => ({
      "aria-label": copied
        ? "Copied to clipboard"
        : `Copy the ${selected?.label ?? ""} install snippet`,
      onClick: copy,
      type: "button" as const,
    }),
    getListboxProps: () => ({
      "aria-activedescendant": optionId(activeIndex),
      "aria-label": "Install method",
      id: `${baseId}-listbox`,
      onKeyDown: onListboxKeyDown,
      ref: listboxRef,
      role: "listbox" as const,
    }),
    getOptionProps: (index: number) => ({
      "aria-selected": index === selectedIndex,
      [OPTION_INDEX_ATTRIBUTE]: index,
      id: optionId(index),
      onClick: onOptionClick,
      role: "option" as const,
      tabIndex: -1,
      type: "button" as const,
    }),
    getTriggerProps: () => ({
      "aria-controls": `${baseId}-listbox`,
      "aria-expanded": isOpen,
      "aria-haspopup": "listbox" as const,
      onClick: () => (isOpen ? close(false) : open()),
      onKeyDown: onTriggerKeyDown,
      ref: triggerRef,
      type: "button" as const,
    }),
    /** The row the keyboard is currently on, which may not be the selected one. */
    highlightedIndex: activeIndex,
    isOpen,
    selected,
    selectedIndex,
  };
}
