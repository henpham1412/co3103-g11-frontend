import { normalizeApiError } from "@/api/apiError";

// Codes the discussion and content-report endpoints actually return, translated into what the
// reader can do next. The backend stays the authority; this table only phrases its answers.
const codeMessages: Record<string, string> = {
  FORBIDDEN: "You need an active membership in this class to read or post here.",
  UNAUTHORIZED: "Your session expired. Sign in again to continue.",
  CLASS_NOT_FOUND: "This class no longer exists.",
  CLASS_ARCHIVED: "This class is archived, so it no longer accepts new posts.",
  DISCUSSION_NOT_FOUND: "That post no longer exists. The discussion has been reloaded.",
  DISCUSSION_HAS_REPLIES: "This post still has replies, so the server keeps it.",
  DISCUSSION_HAS_UNRESOLVED_REPORT: "This post has an open content report, so it cannot be deleted yet.",
  REPORTED_CONTENT_NOT_FOUND: "That content no longer exists, so it cannot be reported.",
  DUPLICATE_CONTENT_REPORT: "You have already reported this content.",
  VALIDATION_ERROR: "The server rejected some fields. Check the form and try again.",
};

// The page is showing a post the server has already moved past, so the recovery is to re-read.
const staleCodes = new Set([
  "DISCUSSION_NOT_FOUND",
  "CLASS_NOT_FOUND",
  "CLASS_ARCHIVED",
  "DISCUSSION_HAS_REPLIES",
  "DISCUSSION_HAS_UNRESOLVED_REPORT",
  "REPORTED_CONTENT_NOT_FOUND",
]);

export function discussionErrorText(error: unknown): string {
  const apiError = normalizeApiError(error);
  const code = apiError.code && codeMessages[apiError.code] ? apiError.code : undefined;
  if (code) return codeMessages[code];
  if (apiError.status === 403) return codeMessages.FORBIDDEN;
  if (apiError.status === 401) return codeMessages.UNAUTHORIZED;
  return apiError.message;
}

export function isStaleDiscussionState(error: unknown): boolean {
  const code = normalizeApiError(error).code;
  return Boolean(code && staleCodes.has(code));
}