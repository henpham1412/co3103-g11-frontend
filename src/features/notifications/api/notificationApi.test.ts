import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@/api/lmsClient", () => ({ lmsClient: client }));

import { ApiError } from "@/api/apiError";
import { listNotifications, markNotificationRead } from "./notificationApi";

const validItem = {
  notification_id: "notif-1",
  notification_type: "CONTENT_RELEASED",
  title: "New learning content",
  message: "Now available: Lesson 1",
  target_url: "/classes/c1/lessons/l1",
  is_read: false,
  created_at: "2026-11-22T05:00:00Z",
  read_at: null,
};

describe("notificationApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps query params and validates persisted notification pages", async () => {
    const controller = new AbortController();
    client.get.mockResolvedValue({
      data: {
        items: [validItem],
        page: 2,
        size: 20,
        total_items: 21,
        total_pages: 2,
      },
    });

    const page = await listNotifications({ is_read: false, page: 2, size: 20 }, controller.signal);

    expect(client.get).toHaveBeenCalledWith("/notifications", {
      params: { is_read: "false", page: 2, size: 20 },
      signal: controller.signal,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].notification_id).toBe("notif-1");
    expect(page.total_items).toBe(21);
  });

  it("omits is_read param when listing all notifications", async () => {
    client.get.mockResolvedValue({
      data: { items: [], page: 1, size: 20, total_items: 0, total_pages: 0 },
    });

    await listNotifications({ page: 1, size: 20 });

    expect(client.get).toHaveBeenCalledWith("/notifications", {
      params: { page: 1, size: 20 },
      signal: undefined,
    });
  });

  it("sends exact { is_read: true } body when marking a notification read", async () => {
    client.patch.mockResolvedValue({
      data: { ...validItem, is_read: true, read_at: "2026-11-22T05:05:00Z" },
    });

    const updated = await markNotificationRead("notif-1");

    expect(client.patch).toHaveBeenCalledWith("/notifications/notif-1", { is_read: true });
    expect(updated.is_read).toBe(true);
    expect(updated.read_at).toBe("2026-11-22T05:05:00Z");
  });

  it("rejects malformed server payloads with ApiError", async () => {
    client.get.mockResolvedValue({ data: { items: [{ notification_id: 123 }], page: 1, size: 20, total_items: 1, total_pages: 1 } });
    await expect(listNotifications()).rejects.toBeInstanceOf(ApiError);
  });
});
