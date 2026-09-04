"use client";

import { Modal } from "@heroui/react";
import { buttonVariants, cardVariants } from "@heroui/styles";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { type SourceAvatar, SourceAvatars } from "./source-avatars";

const card = cardVariants();

export interface McpDialogTool {
  readonly description: string;
  readonly href: string;
  readonly name: string;
  readonly title: string;
}

export interface McpDialogCardProps {
  /** A whole static class string — Tailwind cannot see an interpolated one. */
  readonly accent: string;
  readonly description: string;
  readonly endpoint: string;
  readonly id: string;
  /** The upstreams behind this MCP, resolved to icon URLs on the server. */
  readonly sources: readonly SourceAvatar[];
  readonly tagline: string;
  readonly title: string;
  readonly tools: readonly McpDialogTool[];
}

/**
 * An MCP as a card that opens into a dialog.
 *
 * The card is the trigger and carries only the written tagline, so the grid
 * stays readable however many tools an MCP grows. The dialog is where the
 * registry description finally belongs: it is written for the agent reading
 * the protocol, and it is the right length for a panel a reader opened on
 * purpose but far too long for a card.
 *
 * Each tool inside the dialog is a card, and each card is an ordinary link to
 * that tool's own page. Those pages are server-rendered and indexable, and a
 * click leaves for one rather than opening a second overlay — one layer of
 * overlay is enough. The cards sit in a two-column grid on a dialog widened
 * past HeroUI's largest size, so a whole MCP is scannable without scrolling,
 * and each description is clamped to a preview: the full text lives on the
 * page the card links to.
 *
 * The open card is a history entry (`#mcp/<id>`), so back closes it. The hash
 * is deliberate: `/mcp/<id>` is the live JSON-RPC endpoint, not a page, and
 * pushing that would hand the reader a URL that does not render.
 */
export function McpDialogCard({
  accent,
  description,
  endpoint,
  id,
  sources,
  tagline,
  title,
  tools,
}: McpDialogCardProps): ReactNode {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      setOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        window.history.pushState(null, "", `#mcp/${id}`);
        setOpen(true);
        return;
      }
      setOpen(false);
      if (window.location.hash === `#mcp/${id}`) {
        window.history.back();
      }
    },
    [id]
  );

  const openDialog = useCallback(() => {
    onOpenChange(true);
  }, [onOpenChange]);

  const toolLabel = tools.length === 1 ? "1 tool" : `${tools.length} tools`;

  return (
    <>
      <button
        className={`${card.base()} h-full cursor-pointer overflow-hidden text-left transition-shadow hover:shadow-md`}
        onClick={openDialog}
        type="button"
      >
        <span className={`${accent} block px-5 py-6`}>
          <SourceAvatars avatars={sources} className="mb-4" />
          <span className="block font-semibold text-lg tracking-tight">
            {title}
          </span>
          <span className="mt-2 block text-sm opacity-80">{tagline}</span>
        </span>
        <span className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="font-mono text-muted text-xs">/mcp/{id}</span>
          <span className="text-muted text-sm">{toolLabel} →</span>
        </span>
      </button>
      <Modal isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Backdrop>
          <Modal.Container scroll="inside" size="lg">
            {/* HeroUI stops at `lg` (32rem), which is too narrow for a grid.
                The utilities layer wins over the component class, so a plain
                `max-w-*` widens the dialog without a theme override. */}
            <Modal.Dialog className="max-w-3xl">
              <Modal.Header>
                <SourceAvatars avatars={sources} />
                <Modal.Heading>{title}</Modal.Heading>
                <Modal.CloseTrigger />
              </Modal.Header>
              <Modal.Body>
                <p className="leading-6">{description}</p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-default px-3 py-2">
                  <span className="truncate font-mono text-foreground text-xs">
                    {endpoint}
                  </span>
                  <span className="shrink-0 text-xs">{toolLabel}</span>
                </div>
                <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
                  {tools.map((tool) => (
                    <li className="min-w-0" key={tool.name}>
                      <a
                        className="flex h-full flex-col rounded-2xl border border-separator p-4 no-underline transition-colors hover:bg-default"
                        href={tool.href}
                      >
                        <span className="truncate font-mono text-muted text-xs">
                          {tool.name}
                        </span>
                        <span className="mt-1 flex items-baseline gap-2 font-medium text-foreground text-sm">
                          <span className="min-w-0 flex-1">{tool.title}</span>
                          <span aria-hidden="true" className="text-muted">
                            →
                          </span>
                        </span>
                        <span className="mt-2 line-clamp-3 text-muted text-sm leading-snug">
                          {tool.description}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Modal.Body>
              <Modal.Footer>
                <a
                  className={buttonVariants({
                    size: "sm",
                    variant: "secondary",
                  })}
                  href="/v1/tools"
                >
                  Bekijk de schema's
                </a>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
