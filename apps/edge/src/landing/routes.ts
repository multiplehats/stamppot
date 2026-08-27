const RSC_SUFFIX = "_.rsc";

export function pageUrl(url: URL): URL {
  if (!url.pathname.endsWith(RSC_SUFFIX)) {
    return url;
  }

  const normalized = new URL(url);
  normalized.pathname = normalized.pathname.slice(0, -RSC_SUFFIX.length) || "/";
  return normalized;
}

export function isRscUrl(url: URL): boolean {
  return url.pathname.endsWith(RSC_SUFFIX);
}

export function toolPath(operationName: string): string {
  return `/tools/${operationName}`;
}
