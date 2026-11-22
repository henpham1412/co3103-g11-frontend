import { normalizeApiError } from "@/api/apiError";

export function notificationErrorMessage(error: unknown, fallback = "Could not load notifications. Please try again."): string {
  const apiError = normalizeApiError(error);
  if (apiError.status === 401) {
    return "Your session expired. Sign in again to view your notifications.";
  }
  if (apiError.status === 403) {
    return "You do not have permission to access this notification.";
  }
  if (apiError.status === 404 || apiError.code === "NOTIFICATION_NOT_FOUND") {
    return "This notification is no longer available or has expired.";
  }
  if (apiError.status === 400 || apiError.code === "VALIDATION_ERROR") {
    return "The notification request could not be processed.";
  }
  if (apiError.status === 0) {
    return apiError.message || fallback;
  }
  return apiError.message || fallback;
}
