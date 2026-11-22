const ASSIGNMENT_GRADING_PATH = /^\/tutor\/classes\/([^/]+)\/content\/assignment\/[^/]+\/grade$/;

export interface ResolvedNotificationTarget {
  href: string;
  isFallback: boolean;
  fallbackNotice?: string;
}

export function isSafeInternalTargetUrl(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return false;
  // Reject control characters or backslashes that can confuse URL parsers.
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || trimmed[i] === "\\") {
      return false;
    }
  }
  return true;
}

/**
 * Resolves a backend notification target_url into a safe internal navigation target.
 * Until FE-7 mounts the tutor assignment grading route, falls back to the class content page
 * only when `isRouteAvailable` reports the grading route is not mounted. Once FE-7 merges,
 * `isRouteAvailable(path)` returns true and the exact backend target_url is used directly.
 */
export function resolveNotificationTarget(
  targetUrl: string | null | undefined,
  isRouteAvailable?: (path: string) => boolean,
): ResolvedNotificationTarget | null {
  if (!isSafeInternalTargetUrl(targetUrl)) {
    return null;
  }
  const normalized = targetUrl.trim();
  const gradingMatch = ASSIGNMENT_GRADING_PATH.exec(normalized);
  if (gradingMatch) {
    const gradingAvailable = isRouteAvailable ? isRouteAvailable(normalized) : false;
    if (!gradingAvailable) {
      return {
        href: `/tutor/classes/${gradingMatch[1]}/content`,
        isFallback: true,
        fallbackNotice: "Direct assignment grading navigation is not yet available; opening class content instead.",
      };
    }
  }
  return {
    href: normalized,
    isFallback: false,
  };
}
