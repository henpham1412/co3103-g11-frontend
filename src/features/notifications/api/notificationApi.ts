import { ApiError } from "@/api/apiError";
import { lmsClient } from "@/api/lmsClient";
import { isNonEmptyString, isRecord } from "@/utils/typeGuards";

import type { NotificationItem, NotificationListQuery, NotificationPage } from "../types";

function parseNotificationItem(raw: unknown, endpoint: string): NotificationItem {
  if (
    !isRecord(raw) ||
    !isNonEmptyString(raw.notification_id) ||
    !isNonEmptyString(raw.notification_type) ||
    !isNonEmptyString(raw.title) ||
    typeof raw.message !== "string" ||
    (raw.target_url !== null && raw.target_url !== undefined && typeof raw.target_url !== "string") ||
    typeof raw.is_read !== "boolean" ||
    !isNonEmptyString(raw.created_at) ||
    (raw.read_at !== null && raw.read_at !== undefined && typeof raw.read_at !== "string")
  ) {
    throw new ApiError({
      status: 500,
      error: "Invalid Response",
      message: "Received an unexpected notification payload from the server.",
      timestamp: new Date().toISOString(),
      path: endpoint,
    });
  }
  return {
    notification_id: raw.notification_id,
    notification_type: raw.notification_type,
    title: raw.title,
    message: raw.message,
    target_url: raw.target_url ?? null,
    is_read: raw.is_read,
    created_at: raw.created_at,
    read_at: raw.read_at ?? null,
  };
}

function parseNotificationPage(raw: unknown, endpoint: string): NotificationPage {
  if (
    !isRecord(raw) ||
    !Array.isArray(raw.items) ||
    typeof raw.page !== "number" ||
    typeof raw.size !== "number" ||
    typeof raw.total_items !== "number" ||
    typeof raw.total_pages !== "number"
  ) {
    throw new ApiError({
      status: 500,
      error: "Invalid Response",
      message: "Received an unexpected notification list response from the server.",
      timestamp: new Date().toISOString(),
      path: endpoint,
    });
  }
  return {
    items: raw.items.map((item) => parseNotificationItem(item, endpoint)),
    page: raw.page,
    size: raw.size,
    total_items: raw.total_items,
    total_pages: raw.total_pages,
  };
}

export async function listNotifications(
  query: NotificationListQuery = {},
  signal?: AbortSignal,
): Promise<NotificationPage> {
  const params: Record<string, string | number> = {};
  if (query.is_read !== undefined) {
    params.is_read = String(query.is_read);
  }
  if (query.page !== undefined) {
    params.page = query.page;
  }
  if (query.size !== undefined) {
    params.size = query.size;
  }
  const response = await lmsClient.get<unknown>("/notifications", { params, signal });
  return parseNotificationPage(response.data, "/notifications");
}

export async function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  const endpoint = `/notifications/${encodeURIComponent(notificationId)}`;
  const response = await lmsClient.patch<unknown>(endpoint, { is_read: true });
  return parseNotificationItem(response.data, endpoint);
}
