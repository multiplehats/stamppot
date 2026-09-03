"use client";

import { Modal } from "@heroui/react";
import { buttonVariants, cardVariants } from "@heroui/styles";
import { type ReactNode, useCallback, useEffect, useState } from "react";

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
 * Each tool inside the dialog is an ordinary link to its own page. Those pages
 * are server-rendered and indexable, and a click leaves for one rather than
 * opening a second overlay — one layer of overlay is enough.
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
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>{title}</Modal.Heading>
                <Modal.CloseTrigger />
              </Modal.Header>
              <Modal.Body>
                <p className="text-muted leading-relaxed">{description}</p>
                <p className="mt-6 font-mono text-muted text-xs">{endpoint}</p>
                <h3 className="mt-8 font-semibold text-base">
                  {toolLabel} in deze MCP
                </h3>
                <ul className="mt-3 list-none divide-y divide-separator p-0">
                  {tools.map((tool) => (
                    <li key={tool.name}>
                      <a
                        className="-mx-2 block rounded-lg px-2 py-4 no-underline hover:bg-default"
                        href={tool.href}
                      >
                        <span className="block font-mono text-muted text-xs">
                          {tool.name}
                        </span>
                        <span className="mt-1 block font-medium text-sm">
                          {tool.title}
                        </span>
                        <span className="mt-1 block text-muted text-sm">
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
