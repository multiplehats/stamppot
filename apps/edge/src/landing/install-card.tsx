"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Description,
  Label,
  ListBox,
  Select,
} from "@heroui/react";
import { cardVariants } from "@heroui/styles";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { trackInstallSnippetCopied } from "../analytics/client";
import type { InstallOption } from "./install-targets";

type SelectionValue = number | string;

const COPY_RESET_MS = 1600;

const card = cardVariants();

interface InstallCardProps {
  /** Width and margin belong to the page, not to the card. */
  readonly className?: string;
  readonly eyebrow: string;
  readonly options: readonly InstallOption[];
  /** Which page the card sits on, so copies can be told apart. */
  readonly placement: "landing" | "tool";
}

/**
 * A card that shows one install snippet at a time, with a HeroUI `Select` for
 * choosing which client it is written for. The listbox, its keyboard handling
 * and its ARIA wiring all belong to HeroUI; the only state kept here is which
 * target is selected and whether the snippet was just copied.
 */
export function InstallCard({
  className = "",
  eyebrow,
  options,
  placement,
}: InstallCardProps): ReactNode {
  const [first] = options;
  const [selectedId, setSelectedId] = useState(first?.id ?? null);
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<number | undefined>(undefined);

  const selected =
    options.find((option) => option.id === selectedId) ?? first ?? undefined;

  useEffect(
    () => () => {
      if (copyResetRef.current !== undefined) {
        window.clearTimeout(copyResetRef.current);
      }
    },
    []
  );

  // HeroUI hands back a react-aria `Key`; every option id here is a string.
  const onSelectionChange = useCallback(
    (value: SelectionValue | SelectionValue[] | null) => {
      const next = Array.isArray(value) ? value[0] : value;
      setSelectedId(next === undefined || next === null ? null : String(next));
      setCopied(false);
    },
    []
  );

  const copy = useCallback(async () => {
    if (selected === undefined) {
      return;
    }

    // A browser may refuse the clipboard outright — Firefox without
    // `dom.events.asyncClipboard.clipboardItem`, a denied permission, an
    // embedded webview. Swallowing the rejection keeps the button honest: it
    // stays on "Kopieer" rather than claiming a copy that never happened, and
    // the snippet is selectable either way.
    try {
      await navigator.clipboard.writeText(selected.snippet);
    } catch {
      return;
    }
    // Only a copy that actually happened counts.
    trackInstallSnippetCopied(selected.id, placement);
    setCopied(true);

    if (copyResetRef.current !== undefined) {
      window.clearTimeout(copyResetRef.current);
    }
    copyResetRef.current = window.setTimeout(() => {
      setCopied(false);
    }, COPY_RESET_MS);
  }, [selected, placement]);

  if (selected === undefined) {
    return null;
  }

  return (
    <div className={`${card.base()} ${className}`}>
      <div
        className={`${card.header()} flex-row flex-wrap items-center justify-between gap-3`}
      >
        <span className="font-medium text-muted text-sm">{eyebrow}</span>
        <Select
          className="w-52"
          onChange={onSelectionChange}
          value={selectedId}
        >
          <Label className="sr-only">Kies je client</Label>
          <Select.Trigger>
            <Select.Value>
              {({ defaultChildren, isPlaceholder, state }) => {
                const key = state.selectedItems[0]?.key;
                const item = options.find((option) => option.id === key);
                if (isPlaceholder || item === undefined) {
                  return defaultChildren;
                }
                return (
                  <span className="flex min-w-0 items-center gap-2">
                    <BrandIcon option={item} />
                    <span className="truncate">{item.label}</span>
                  </span>
                );
              }}
            </Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {options.map((option) => (
                <ListBox.Item
                  id={option.id}
                  key={option.id}
                  textValue={option.label}
                >
                  <BrandIcon option={option} />
                  <div className="flex min-w-0 flex-col">
                    <Label>{option.label}</Label>
                    <Description>{option.location}</Description>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <div className={card.content()}>
        <div className="overflow-hidden rounded-xl bg-default">
          <div className="flex items-center justify-between gap-3 border-separator border-b px-4 py-2">
            <span className="truncate font-mono text-muted text-xs">
              {selected.location}
            </span>
            <Button
              aria-label={
                copied
                  ? "Gekopieerd naar klembord"
                  : `Kopieer de snippet voor ${selected.label}`
              }
              onPress={copy}
              size="sm"
              variant="ghost"
            >
              {copied ? "Gekopieerd" : "Kopieer"}
            </Button>
          </div>
          {/* The card sits in a narrow sidebar on tool pages, so the snippet
              wraps rather than opening a horizontal scrollbar. */}
          <pre className="m-0 whitespace-pre-wrap break-words px-4 py-4">
            <code className="font-mono text-sm leading-6">
              {selected.snippet}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

/**
 * The brand icon, or the first letter of the label when Parsew has no key
 * configured or the request fails. `AvatarFallback` covers both cases on its
 * own, so a missing icon costs a logo and never a hole.
 */
function BrandIcon({ option }: { readonly option: InstallOption }): ReactNode {
  return (
    <Avatar className="size-6 shrink-0" size="sm">
      {option.iconUrl === undefined ? null : (
        <AvatarImage alt="" src={option.iconUrl} />
      )}
      <AvatarFallback>{option.monogram}</AvatarFallback>
    </Avatar>
  );
}
