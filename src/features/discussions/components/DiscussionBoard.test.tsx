import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
import type { ClassCatalogItem } from "../../classes/types";
import type { DiscussionPost } from "../types";

const api = vi.hoisted(() => ({ listClassDiscussions: vi.fn(), createDiscussion: vi.fn() }));
vi.mock("../api/discussionApi", () => api);
vi.mock("../api/contentReportApi", () => ({ createContentReport: vi.fn() }));

import DiscussionBoard from "./DiscussionBoard";

const classItem: ClassCatalogItem = {
  class_id: "class-1", class_code: "CS101", title: "Programming Foundations", description: null,
  prerequisites_description: null, thumbnail_url: null, enrollment_policy: "OPEN", status: "ACTIVE",
  tutor: { user_id: "tutor-1", full_name: "Alex Tutor" }, active_member_count: 3, max_capacity: 20,
};

function post(overrides: Partial<DiscussionPost> = {}): DiscussionPost {
  return {
    discussion_id: "discussion-1", class_id: "class-1", lesson_id: null, author_id: "student-2",
    parent_id: null, title: "Week 1 questions", content: "How do I start?",
    created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...overrides,
  };
}

function pageOf(items: DiscussionPost[], total_pages = 1) {
  return { items, page: 1, size: 20, total_items: items.length, total_pages };
}

function renderBoard(currentUserId = "student-1", item = classItem) {
  return render(
    <App>
      <MemoryRouter>
        <DiscussionBoard
          classItem={item}
          currentUserId={currentUserId}
          currentUserName="Nguyen Van A"
          basePath="/classes/class-1/discussions"
        />
      </MemoryRouter>
    </App>,
  );
}

function failure(status: number, code: string) {
  return new ApiError({
    status, error: "Request Failed", message: "The server refused the request.", code,
    timestamp: new Date().toISOString(), path: "/classes/class-1/discussions",
  });
}

describe("DiscussionBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listClassDiscussions.mockResolvedValue(pageOf([post()]));
    api.createDiscussion.mockResolvedValue(post({ discussion_id: "discussion-2" }));
  });

  it("reads the first page of threads and names authors without exposing UUIDs", async () => {
    api.listClassDiscussions.mockResolvedValue(pageOf([
      post({ discussion_id: "mine", author_id: "student-1", title: "My question" }),
      post({ discussion_id: "tutor", author_id: "tutor-1", title: "Tutor note" }),
      post({ discussion_id: "other", author_id: "student-9", title: "Other question" }),
    ]));
    renderBoard();

    expect(await screen.findByText("My question")).toBeInTheDocument();
    expect(api.listClassDiscussions).toHaveBeenCalledWith("class-1", { page: 1, size: 20 }, expect.anything());
    expect(screen.getByText("Alex Tutor")).toBeInTheDocument();
    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getAllByText("Class member")).toHaveLength(1);
    expect(screen.queryByText(/student-9/)).not.toBeInTheDocument();
  });

  it("shows the reader their own profile name on their own post", async () => {
    api.listClassDiscussions.mockResolvedValue(pageOf([post({ author_id: "student-1" })]));
    renderBoard();
    expect(await screen.findByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.queryByText("Class member")).not.toBeInTheDocument();
  });

  it("explains a 403 instead of rendering an empty board", async () => {
    api.listClassDiscussions.mockRejectedValue(failure(403, "FORBIDDEN"));
    renderBoard();
    expect(await screen.findByText("You cannot read this class discussion")).toBeInTheDocument();
    expect(screen.queryByText("No discussions in this class yet. Start the first one.")).not.toBeInTheDocument();
  });

  it("offers a retry when the server fails for another reason", async () => {
    api.listClassDiscussions.mockRejectedValueOnce(failure(500, "INTERNAL_ERROR"));
    renderBoard();
    expect(await screen.findByText("Could not load the discussions")).toBeInTheDocument();
    api.listClassDiscussions.mockResolvedValue(pageOf([post()]));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Week 1 questions")).toBeInTheDocument();
  });

  it("publishes a trimmed post and re-reads the list", async () => {
    renderBoard();
    await screen.findByText("Week 1 questions");
    fireEvent.click(screen.getByRole("button", { name: /New post/ }));
    fireEvent.change(screen.getByPlaceholderText("What is this discussion about?"), { target: { value: "  Week 2  " } });
    fireEvent.change(screen.getByPlaceholderText("Write your question or explanation."), { target: { value: "My question" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish post" }));

    await waitFor(() => expect(api.createDiscussion).toHaveBeenCalledWith("class-1", { title: "Week 2", content: "My question" }));
    await waitFor(() => expect(api.listClassDiscussions).toHaveBeenCalledTimes(2));
  });

  it("blocks an empty body before calling the API", async () => {
    renderBoard();
    await screen.findByText("Week 1 questions");
    fireEvent.click(screen.getByRole("button", { name: /New post/ }));
    fireEvent.change(screen.getByPlaceholderText("What is this discussion about?"), { target: { value: "Week 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
    expect(await screen.findByText("Write a message before posting.")).toBeInTheDocument();
    expect(api.createDiscussion).not.toHaveBeenCalled();
  });

  it("opens the report form for the selected post", async () => {
    renderBoard();
    await screen.findByText("Week 1 questions");
    fireEvent.click(screen.getByRole("button", { name: /Report/ }));
    expect(await screen.findByText(/Reporting post “Week 1 questions”/)).toBeInTheDocument();
  });

  it("keeps an archived class readable but stops new posts", async () => {
    renderBoard("student-1", { ...classItem, status: "ARCHIVED" });
    await screen.findByText("Week 1 questions");
    expect(screen.getByRole("button", { name: /New post/ })).toBeDisabled();
    expect(screen.getByText("This class is archived")).toBeInTheDocument();
  });

  it("links each thread to its own route", async () => {
    renderBoard();
    await screen.findByText("Week 1 questions");
    expect(screen.getByRole("link", { name: "Open thread" })).toHaveAttribute("href", "/classes/class-1/discussions/discussion-1");
  });
});