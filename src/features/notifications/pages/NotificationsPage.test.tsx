import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
import type { NotificationItem } from "../types";

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));
vi.mock("../api/notificationApi", () => api);
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { userId: "u1", fullName: "Nguyen Van A" } },
    logout: vi.fn(),
  }),
}));

import NotificationsPage from "./NotificationsPage";

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    notification_id: "notif-1",
    notification_type: "CONTENT_RELEASED",
    title: "New learning content",
    message: "Now available: Lesson 1",
    target_url: "/classes/c1/lessons/l1",
    is_read: false,
    created_at: "2026-11-22T05:00:00Z",
    read_at: null,
    ...overrides,
  };
}

function renderPage(
  variant: "student" | "tutor" = "student",
  isRouteAvailable?: (path: string) => boolean,
) {
  return render(
    <MemoryRouter initialEntries={[variant === "tutor" ? "/tutor/notifications" : "/notifications"]}>
      <Routes>
        <Route
          path={variant === "tutor" ? "/tutor/notifications" : "/notifications"}
          element={<NotificationsPage variant={variant} isRouteAvailable={isRouteAvailable} />}
        />
        <Route path="/classes/:classId/lessons/:lessonId" element={<div>Lesson destination</div>} />
        <Route path="/tutor/classes/:classId/content" element={<div>Tutor content fallback</div>} />
        <Route path="/tutor/classes/:classId/content/assignment/:activityId/grade" element={<div>Tutor grading destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state and renders persisted notifications with unread badge", async () => {
    let resolveList!: (value: unknown) => void;
    api.listNotifications.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));

    renderPage("student");
    expect(screen.getByRole("status", { name: "Loading notifications" })).toBeInTheDocument();

    resolveList({
      items: [
        makeNotification(),
        makeNotification({
          notification_id: "notif-2",
          notification_type: "ASSESSMENT_RESULT",
          title: "Your quiz was graded",
          message: "Your quiz result is available.",
          target_url: "/assessment-history",
          is_read: true,
          read_at: "2026-11-22T05:10:00Z",
        }),
      ],
      page: 1,
      size: 20,
      total_items: 2,
      total_pages: 1,
    });

    expect(await screen.findByText("New learning content")).toBeInTheDocument();
    expect(screen.getByText("Your quiz was graded")).toBeInTheDocument();
    expect(screen.getAllByText("Unread")).toHaveLength(2); // Segmented label + item badge
    expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(1);
  });

  it("marks unread notification as read without sending duplicate requests", async () => {
    const item = makeNotification();
    api.listNotifications.mockResolvedValue({
      items: [item],
      page: 1,
      size: 20,
      total_items: 1,
      total_pages: 1,
    });
    let resolvePatch!: (value: NotificationItem) => void;
    api.markNotificationRead.mockReturnValue(new Promise<NotificationItem>((resolve) => { resolvePatch = resolve; }));

    renderPage("student");
    const button = await screen.findByRole("button", { name: "Mark as read" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
    expect(api.markNotificationRead).toHaveBeenCalledWith("notif-1");

    resolvePatch({ ...item, is_read: true, read_at: "2026-11-22T05:12:00Z" });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Mark as read" })).not.toBeInTheDocument();
    });
  });

  it("marks unread item read and navigates to authorized target_url when opened", async () => {
    const item = makeNotification();
    api.listNotifications.mockResolvedValue({
      items: [item],
      page: 1,
      size: 20,
      total_items: 1,
      total_pages: 1,
    });
    api.markNotificationRead.mockResolvedValue({ ...item, is_read: true, read_at: "2026-11-22T05:12:00Z" });

    renderPage("student");
    const openBtn = await screen.findByRole("button", { name: "Open resource" });
    fireEvent.click(openBtn);

    expect(await screen.findByText("Lesson destination")).toBeInTheDocument();
    expect(api.markNotificationRead).toHaveBeenCalledWith("notif-1");
  });

  it("communicates fallback and opens tutor class content when FE-7 grading route is not mounted (D3)", async () => {
    const item = makeNotification({
      notification_id: "notif-sub",
      notification_type: "ASSIGNMENT_SUBMISSION",
      title: "New assignment submission",
      message: "A student submitted work for an assignment.",
      target_url: "/tutor/classes/c9/content/assignment/a7/grade",
      is_read: true,
      read_at: "2026-11-22T05:10:00Z",
    });
    api.listNotifications.mockResolvedValue({
      items: [item],
      page: 1,
      size: 20,
      total_items: 1,
      total_pages: 1,
    });

    renderPage("tutor", () => false);
    expect(
      await screen.findByText("Direct assignment grading navigation is not yet available; opening class content instead."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open class content" }));
    expect(await screen.findByText("Tutor content fallback")).toBeInTheDocument();
  });

  it("switches filters (Unread/Read) and shows empty state when no notifications match", async () => {
    api.listNotifications
      .mockResolvedValueOnce({
        items: [makeNotification()],
        page: 1,
        size: 20,
        total_items: 1,
        total_pages: 1,
      })
      .mockResolvedValueOnce({
        items: [],
        page: 1,
        size: 20,
        total_items: 0,
        total_pages: 0,
      });

    renderPage("student");
    expect(await screen.findByText("New learning content")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Read"));
    expect(await screen.findByText("You have no read notifications.")).toBeInTheDocument();
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      { page: 1, size: 20, is_read: true },
      expect.any(AbortSignal),
    );
  });

  it("handles 401/403 list errors with retry and 404 mark-read errors cleanly", async () => {
    api.listNotifications
      .mockRejectedValueOnce(new ApiError({
        status: 403,
        error: "Forbidden",
        message: "Access denied",
        code: "FORBIDDEN",
        timestamp: "2026-11-22T05:00:00Z",
        path: "/notifications",
      }))
      .mockResolvedValueOnce({
        items: [makeNotification()],
        page: 1,
        size: 20,
        total_items: 1,
        total_pages: 1,
      });
    api.markNotificationRead.mockRejectedValueOnce(new ApiError({
      status: 404,
      error: "Not Found",
      message: "Notification not found",
      code: "NOTIFICATION_NOT_FOUND",
      timestamp: "2026-11-22T05:01:00Z",
      path: "/notifications/notif-1",
    }));

    renderPage("student");
    expect(await screen.findByText("You do not have permission to access this notification.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const markBtn = await screen.findByRole("button", { name: "Mark as read" });
    fireEvent.click(markBtn);
    expect(await screen.findByText("This notification is no longer available or has expired.")).toBeInTheDocument();
  });
});
