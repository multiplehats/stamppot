"use client";

import { type ReactNode, useCallback, useState } from "react";
import type { InstallOption } from "./install-targets";
import { useInstallPicker } from "./use-install-picker";

/**
 * The two surfaces the card is dropped onto: white on the landing hero, felt in
 * a tool page's sidebar. Tailwind reads these statically, so every class is a
 * full string — a tone assembled by interpolation would emit nothing.
 */
const TONES = {
  card: {
    caret: "text-graphite",
    eyebrow:
      "font-display font-extrabold text-[12px] text-graphite uppercase tracking-[0.08em]",
    iconChip: "bg-lemon text-felt",
    listbox: "bg-card shadow-[0_0_0_2px_var(--color-felt)]",
    optionActive: "bg-lemon",
    optionLabel: "text-felt",
    optionLocation: "text-graphite",
    panel: "bg-felt",
    panelCode: "text-card",
    panelCopy:
      "text-card shadow-[inset_0_0_0_2px_var(--color-hairline)] hover:bg-card hover:text-felt",
    panelLabel: "text-ash",
    panelRule: "border-hairline",
    surface: "bg-card",
    trigger:
      "bg-card text-felt shadow-[inset_0_0_0_2px_var(--color-felt)] hover:bg-felt hover:text-card",
  },
  felt: {
    caret: "text-ash",
    eyebrow:
      "font-display font-extrabold text-[12px] text-ash uppercase tracking-[0.08em]",
    iconChip: "bg-card text-felt",
    listbox: "bg-felt shadow-[0_0_0_2px_var(--color-hairline)]",
    optionActive: "bg-card/10",
    optionLabel: "text-card",
    optionLocation: "text-smoke",
    panel: "bg-card",
    panelCode: "text-felt",
    panelCopy:
      "text-felt shadow-[inset_0_0_0_2px_var(--color-felt)] hover:bg-felt hover:text-card",
    panelLabel: "text-graphite",
    panelRule: "border-[#ececec]",
    surface: "bg-felt",
    trigger:
      "bg-felt text-card shadow-[inset_0_0_0_2px_var(--color-hairline)] hover:bg-card hover:text-felt",
  },
} as const;

const MICRO_LABEL =
  "font-display font-extrabold text-[11px] uppercase leading-[18px] tracking-[0.08em]";

export type InstallTone = keyof typeof TONES;

interface InstallCardProps {
  /** Rotation, width and margin belong to the page, not to the card. */
  readonly className?: string;
  readonly eyebrow: string;
  readonly options: readonly InstallOption[];
  readonly tone: InstallTone;
}

/**
 * A card that shows one install snippet at a time, with a picker for choosing
 * which client it is written for. All behaviour comes from `useInstallPicker`;
 * everything here is presentation.
 */
export function InstallCard({
  className = "",
  eyebrow,
  options,
  tone,
}: InstallCardProps): ReactNode {
  const picker = useInstallPicker(options);
  const skin = TONES[tone];
  const { selected } = picker;

  if (selected === undefined) {
    return null;
  }

  return (
    <div
      className={`rounded-card-lg p-6 text-left max-sm:p-5 ${skin.surface} ${className}`}
      data-code-block
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={skin.eyebrow}>{eyebrow}</span>
        <div className="relative" {...picker.getContainerProps()}>
          <button
            className={`flex h-11 items-center gap-[10px] rounded-pill py-1 pr-3 pl-[6px] font-display font-extrabold text-[15px] leading-[20px] ${skin.trigger}`}
            {...picker.getTriggerProps()}
          >
            <BrandIcon option={selected} skin={skin} />
            <span className="whitespace-nowrap">{selected.label}</span>
            <Caret className={`shrink-0 ${skin.caret}`} />
          </button>

          {picker.isOpen ? (
            <div
              className={`absolute right-0 z-10 mt-2 flex max-h-[320px] w-[286px] flex-col gap-1 overflow-y-auto rounded-card p-2 max-sm:right-auto max-sm:left-0 ${skin.listbox}`}
              {...picker.getListboxProps()}
            >
              {options.map((option, index) => (
                <button
                  className={`flex w-full items-center gap-3 rounded-card px-2 py-2 text-left ${
                    index === picker.highlightedIndex ? skin.optionActive : ""
                  }`}
                  key={option.id}
                  {...picker.getOptionProps(index)}
                >
                  <BrandIcon option={option} skin={skin} />
                  <span className="flex min-w-0 flex-col">
                    <span
                      className={`font-display font-extrabold text-[15px] leading-[20px] ${skin.optionLabel}`}
                    >
                      {option.label}
                    </span>
                    <span
                      className={`truncate text-[12px] leading-[18px] ${skin.optionLocation}`}
                    >
                      {option.location}
                    </span>
                  </span>
                  {index === picker.selectedIndex ? (
                    <Tick className={`ml-auto shrink-0 ${skin.optionLabel}`} />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mt-5 overflow-hidden rounded-card ${skin.panel}`}>
        <div
          className={`flex items-center justify-between gap-3 border-b px-5 py-[10px] ${skin.panelRule}`}
        >
          <span className={`truncate ${MICRO_LABEL} ${skin.panelLabel}`}>
            {selected.location}
          </span>
          <button
            className={`shrink-0 cursor-pointer rounded-pill px-[14px] py-[5px] font-display font-extrabold text-[11px] uppercase tracking-[0.08em] ${skin.panelCopy}`}
            {...picker.getCopyButtonProps()}
          >
            {picker.copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="m-0 whitespace-pre-wrap break-words px-5 py-[18px]">
          <code
            className={`font-mono text-[13.5px] leading-[24px] max-sm:text-[12.5px] ${skin.panelCode}`}
          >
            {selected.snippet}
          </code>
        </pre>
      </div>
    </div>
  );
}

/**
 * The brand icon, or the first letter of the label when Parsew has no key
 * configured or the request fails. A missing icon costs a logo, never a hole.
 */
function BrandIcon({
  option,
  skin,
}: {
  readonly option: InstallOption;
  readonly skin: (typeof TONES)[InstallTone];
}): ReactNode {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const chip = `grid size-8 shrink-0 place-items-center overflow-hidden rounded-full ${skin.iconChip}`;

  if (option.iconUrl === undefined || failed) {
    return (
      <span aria-hidden="true" className={chip}>
        <span className="font-display font-extrabold text-[14px] leading-none">
          {option.monogram}
        </span>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={chip}>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a resource event, not a user interaction */}
      <img
        alt=""
        className="size-5 object-contain"
        height={20}
        loading="lazy"
        onError={onError}
        src={option.iconUrl}
        width={20}
      />
    </span>
  );
}

function Caret({ className }: { readonly className: string }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 6.5L8 10.5L12 6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function Tick({ className }: { readonly className: string }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
