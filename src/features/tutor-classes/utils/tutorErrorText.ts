import { normalizeApiError } from "@/api/apiError";

// Server codes returned by the class-management API, mapped to what the tutor can actually do
// about them. The backend stays the authority; this table only translates its answers.
const codeMessages: Record<string, string> = {
  FORBIDDEN: "Your account cannot manage this class.",
  UNAUTHORIZED: "Your session expired. Sign in again to continue.",
  CLASS_CODE_ALREADY_EXISTS: "That class code is already taken by another class.",
  CLASS_FULL: "This class has no free seats, so the request cannot be approved.",
  CLASS_ARCHIVED: "Archived classes no longer accept membership changes.",
  INVALID_MEMBERSHIP_STATE: "That request was already handled, so it cannot be approved or rejected again.",
  CLASS_OR_MEMBERSHIP_NOT_FOUND: "This student is no longer in the class roster.",
  ENROLLMENT_POLICY_CHANGED: "The enrollment policy changed. Reload the class before retrying.",
  CAPACITY_BELOW_ACTIVE_MEMBERS: "Capacity cannot be lower than the number of active students.",
  VALIDATION_ERROR: "The server rejected some fields. Check the form and try again.",
  INVALID_QUERY_PARAMETER: "The search or sort options are not supported by the roster API.",
  FILE_TOO_LARGE: "The thumbnail is larger than the 5 MB the server accepts.",
  UNSUPPORTED_MEDIA_TYPE: "Thumbnails must be JPEG, PNG or WebP images.",
  INVALID_FILE: "The selected file is not a readable image.",
};

// These mean the page is showing a state the server has already moved past, so the
// recovery is the same in every case: reload the class and its roster.
const staleCodes = new Set([
  "CLASS_OR_MEMBERSHIP_NOT_FOUND",
  "INVALID_MEMBERSHIP_STATE",
  "CLASS_ARCHIVED",
  "ENROLLMENT_POLICY_CHANGED",
  "CLASS_FULL",
  "CAPACITY_BELOW_ACTIVE_MEMBERS",
]);

export function tutorErrorText(error: unknown): string {
  const apiError = normalizeApiError(error);
  const code = apiError.code && codeMessages[apiError.code] ? apiError.code : undefined;
  if (code) return codeMessages[code];
  if (apiError.status === 403) return codeMessages.FORBIDDEN;
  if (apiError.status === 401) return codeMessages.UNAUTHORIZED;
  return apiError.message;
}

// FILE_TOO_LARGE and UNSUPPORTED_MEDIA_TYPE are shared with class thumbnails, whose copy
// stays above. Material uploads use the storage rules for documents and videos instead.
const contentCodeMessages: Record<string, string> = {
  FILE_TOO_LARGE: "The file is larger than the limit for this material kind.",
  UNSUPPORTED_MEDIA_TYPE: "That file type is not supported for this material kind.",
  EMPTY_FILE: "Choose a file that is not empty.",
  INVALID_MATERIAL_TYPE_FOR_UPLOAD: "Documents and videos are uploaded as files. Text and links use the form fields.",
  FILE_STORAGE_FAILED: "The file could not be stored. Try the upload again.",
  FILE_NOT_FOUND: "The stored file is no longer available.",
  CONTENT_HAS_DEPENDENT_LEARNING_DATA: "Learning records already depend on this content, so the server keeps it. Hide it from students instead of deleting it.",
  CHAPTER_NOT_FOUND: "That chapter no longer exists. The outline has been reloaded.",
  LESSON_NOT_FOUND: "That lesson no longer exists. The outline has been reloaded.",
  MATERIAL_NOT_FOUND: "That material no longer exists. The outline has been reloaded.",
  CLASS_NOT_FOUND: "This class no longer exists.",
};

export function contentErrorText(error: unknown): string {
  const code = normalizeApiError(error).code;
  if (code && contentCodeMessages[code]) return contentCodeMessages[code];
  return tutorErrorText(error);
}

export function isStaleTutorState(error: unknown): boolean {
  const code = normalizeApiError(error).code;
  return Boolean(code && staleCodes.has(code));
}

// A content write can also land on an item another tab already deleted. The recovery is the
// same as for a stale roster: re-read the outline instead of leaving the row on screen.
const staleContentCodes = new Set([
  "CHAPTER_NOT_FOUND",
  "LESSON_NOT_FOUND",
  "MATERIAL_NOT_FOUND",
  "CLASS_NOT_FOUND",
]);

export function isStaleContentState(error: unknown): boolean {
  const code = normalizeApiError(error).code;
  return Boolean(code && (staleContentCodes.has(code) || staleCodes.has(code)));
}
