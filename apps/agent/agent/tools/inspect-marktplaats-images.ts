import {
  defineTool,
  type ToolModelOutputPart,
  toolOutput,
  toolOutputPart,
} from "eve/tools";
import { z } from "zod";

const ALLOWED_IMAGE_HOSTS = new Set([
  "images.marktplaats.com",
  "www.marktplaats.nl",
]);
const ALLOWED_MEDIA_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

interface DownloadedImage {
  base64: string;
  mediaType: string;
  url: string;
}

type DownloadResult =
  | { image: DownloadedImage; ok: true }
  | { error: string; ok: false; url: string };

const readBoundedBody = async (response: Response): Promise<string> => {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("The image exceeded the 2 MiB limit.");
  }
  return Buffer.from(bytes).toString("base64");
};

const downloadImage = async (
  value: string,
  turnSignal: AbortSignal
): Promise<DownloadResult> => {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(url.hostname)) {
    return {
      error: "Only HTTPS images returned by the Marktplaats MCP are allowed.",
      ok: false,
      url: value,
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: "image/webp,image/png,image/jpeg,image/gif",
        "user-agent": "stamppot (+https://stamppot.dev)",
      },
      redirect: "error",
      signal: AbortSignal.any([
        turnSignal,
        AbortSignal.timeout(FETCH_TIMEOUT_MS),
      ]),
    });
    if (!response.ok) {
      throw new Error(`The image host returned HTTP ${response.status}.`);
    }

    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!(mediaType && ALLOWED_MEDIA_TYPES.has(mediaType))) {
      throw new Error("The response was not a supported image type.");
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw new Error("The image exceeded the 2 MiB limit.");
    }

    return {
      image: {
        base64: await readBoundedBody(response),
        mediaType,
        url: value,
      },
      ok: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The image fetch failed.",
      ok: false,
      url: value,
    };
  }
};

export default defineTool({
  description:
    "Inspect up to four listing photos returned by get_marktplaats_listing. Pass URLs only from that tool's images array. The photos are sent to your vision model so you can assess visible scratches, cracks, dents, discoloration, missing parts, and other damage.",
  async execute({ imageUrls }, ctx) {
    const results = await Promise.all(
      imageUrls.map((url) => downloadImage(url, ctx.abortSignal))
    );
    return {
      failures: results
        .filter((result) => !result.ok)
        .map(({ error, url }) => ({ error, url })),
      images: results.filter((result) => result.ok).map(({ image }) => image),
    };
  },
  inputSchema: z.object({
    imageUrls: z
      .array(z.url())
      .min(1)
      .max(MAX_IMAGE_COUNT)
      .describe("Image URLs copied from a Marktplaats listing's images array."),
  }),
  toModelOutput(output) {
    if (output.images.length === 0) {
      return toolOutput.text(
        `No listing photos could be loaded. ${output.failures.map(({ error }) => error).join(" ")}`
      );
    }

    const parts: ToolModelOutputPart[] = [];
    for (const [index, image] of output.images.entries()) {
      parts.push(
        toolOutputPart.text(`Marktplaats listing photo ${index + 1}:`),
        toolOutputPart.file(image.base64, { mediaType: image.mediaType })
      );
    }
    if (output.failures.length > 0) {
      parts.push(
        toolOutputPart.text(
          `${output.failures.length} additional photo(s) could not be loaded.`
        )
      );
    }
    return toolOutput.content(parts);
  },
});
