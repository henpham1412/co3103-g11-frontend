import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";

const classApi = vi.hoisted(() => ({ getCurrentMemberships: vi.fn(), getClassDetails: vi.fn() }));
const tutorApi = vi.hoisted(() => ({ getTutorClasses: vi.fn() }));
vi.mock("../../classes/api/classApi", () => classApi);
vi.mock("../../tutor-classes/api/tutorClassApi", () => tutorApi);
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ state: { status: "authenticated", user: { userId: "student-1", fullName: "Nguyen Van A" } }, logout: vi.fn() }),
}));

import DiscussionHubPage from "./DiscussionHubPage";

function classDetail(classId: string, title: string) {
  return {
    class_id: classId, class_code: `CODE-${classId}`, title, description: null, prerequisites_description: null,
    thumbnail_url: null, enrollment_policy: "OPEN", status: "ACTIVE",
    tutor: { user_id: "tutor-1", full_name: "Alex Tutor" }, active_member_count: 1, max_capacity: null,
  };
}

function renderHub(variant: "student" | "tutor") {
  return render(
    <MemoryRouter>
      <DiscussionHubPage variant={variant} />
    </MemoryRouter>,
  );
}

describe("DiscussionHubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    classApi.getCurrentMemberships.mockResolvedValue([
      { class_id: "class-1", status: "ACTIVE" },
      { class_id: "class-2", status: "PENDING" },
    ]);
    classApi.getClassDetails.mockImplementation(async (classId: string) => classDetail(classId, `Class ${classId}`));
    tutorApi.getTutorClasses.mockResolvedValue({
      items: [{ class_id: "class-9", class_code: "CS9", title: "Tutor class", status: "ACTIVE" }],
      page: 1, size: 100, total_items: 1, total_pages: 1,
    });
  });

  it("lists only active memberships for a student", async () => {
    renderHub("student");
    expect(await screen.findByText("Class class-1")).toBeInTheDocument();
    expect(screen.queryByText("Class class-2")).not.toBeInTheDocument();
    expect(classApi.getClassDetails).toHaveBeenCalledTimes(1);
    expect(classApi.getClassDetails).toHaveBeenCalledWith("class-1", expect.anything());
    expect(screen.getByRole("link", { name: "Open discussions" })).toHaveAttribute("href", "/classes/class-1/discussions");
  });

  it("tells a student without an active membership why the list is empty", async () => {
    classApi.getCurrentMemberships.mockResolvedValue([{ class_id: "class-2", status: "PENDING" }]);
    renderHub("student");
    expect(await screen.findByText(/You have no active class membership yet/)).toBeInTheDocument();
    expect(classApi.getClassDetails).not.toHaveBeenCalled();
  });

  it("surfaces a membership read failure instead of an empty list", async () => {
    classApi.getCurrentMemberships.mockRejectedValue(new ApiError({
      status: 401, error: "Unauthorized", message: "Authentication is required.", code: "UNAUTHORIZED",
      timestamp: new Date().toISOString(), path: "/me/classes",
    }));
    renderHub("student");
    expect(await screen.findByText("Could not load your classes")).toBeInTheDocument();
    expect(screen.getByText("Your session expired. Sign in again to continue.")).toBeInTheDocument();
  });

  it("lists every tutor class across pages and links to the tutor board", async () => {
    tutorApi.getTutorClasses
      .mockResolvedValueOnce({
        items: [{ class_id: "class-9", class_code: "CS9", title: "Tutor class", status: "ACTIVE" }],
        page: 1, size: 100, total_items: 2, total_pages: 2,
      })
      .mockResolvedValueOnce({
        items: [{ class_id: "class-10", class_code: "CS10", title: "Second tutor class", status: "ARCHIVED" }],
        page: 2, size: 100, total_items: 2, total_pages: 2,
      });
    renderHub("tutor");
    expect(await screen.findByText("Second tutor class")).toBeInTheDocument();
    expect(tutorApi.getTutorClasses).toHaveBeenNthCalledWith(2, { page: 2, size: 100, sort: "created_at,desc" }, expect.anything());
    expect(screen.getAllByRole("link", { name: "Open discussions" })[0]).toHaveAttribute("href", "/tutor/classes/class-9/discussions");
  });
});