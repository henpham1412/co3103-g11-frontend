import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/apiError";

const api = vi.hoisted(() => ({ getClassDetails: vi.fn(), getClassOutline: vi.fn(), getStudentLesson: vi.fn() }));
const discussions = vi.hoisted(() => ({ listClassDiscussions: vi.fn(), createDiscussion: vi.fn() }));
vi.mock("../../classes/api/classApi", () => api);
vi.mock("../api/discussionApi", () => discussions);
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ state: { status: "authenticated", user: { userId: "student-1" } } }) }));
vi.mock("../../../components/layout/StudentWorkspaceLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
import DiscussionBoardPage from "./DiscussionBoardPage";

function openBoard() {
  return render(<App><MemoryRouter initialEntries={["/classes/class-1/discussions?lesson_id=lesson-1"]}>
    <Link to="/classes/class-1/discussions">Class context</Link>
    <Link to="/classes/class-1/discussions?lesson_id=lesson-1">Lesson context</Link>
    <Routes><Route path="/classes/:classId/discussions" element={<DiscussionBoardPage variant="student" />} /></Routes>
  </MemoryRouter></App>);
}

describe("lesson discussion context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getClassDetails.mockResolvedValue({ class_id: "class-1", title: "Programming", class_code: "CS101", status: "ACTIVE", tutor: { user_id: "tutor-1", full_name: "Tutor" } });
    api.getClassOutline.mockResolvedValue({ class_id: "class-1", chapters: [{ lessons: [{ lesson_id: "lesson-1", title: "Introduction" }] }] });
    api.getStudentLesson.mockResolvedValue({ lesson_id: "lesson-1", title: "Introduction" });
    discussions.listClassDiscussions.mockResolvedValue({ items: [], page: 1, size: 20, total_items: 0, total_pages: 0 });
  });

  it("switches between verified lesson and class contexts without leaking the filter or draft", async () => {
    openBoard();
    await screen.findByText("Lesson: Introduction");
    expect(api.getStudentLesson).toHaveBeenCalledWith("lesson-1", expect.anything());
    expect(discussions.listClassDiscussions).toHaveBeenLastCalledWith("class-1", { page: 1, size: 20, lesson_id: "lesson-1" }, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: /New post/ }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Lesson draft" } });
    fireEvent.click(screen.getByRole("link", { name: "Class context" }));
    await screen.findByText("All class discussions");
    await waitFor(() => expect(discussions.listClassDiscussions).toHaveBeenLastCalledWith("class-1", { page: 1, size: 20 }, expect.anything()));
    expect(screen.queryByDisplayValue("Lesson draft")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Lesson context" }));
    expect(await screen.findByText("Lesson: Introduction")).toBeInTheDocument();
  });

  it.each([403, 404])("does not open or create in an inaccessible lesson (%s)", async (status) => {
    api.getStudentLesson.mockRejectedValue(new ApiError({ status, code: "FORBIDDEN", message: "Inaccessible lesson", error: "Request failed", timestamp: "", path: "/lessons/lesson-1" }));
    openBoard();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(discussions.listClassDiscussions).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /New post/ })).not.toBeInTheDocument();
  });

  it("rejects a lesson not belonging to the accessible class outline", async () => {
    api.getClassOutline.mockResolvedValue({ class_id: "class-1", chapters: [] });
    openBoard();
    expect(await screen.findByText("This lesson is not in the accessible class outline.")).toBeInTheDocument();
    expect(discussions.listClassDiscussions).not.toHaveBeenCalled();
  });
});
