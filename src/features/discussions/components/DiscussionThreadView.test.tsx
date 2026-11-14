import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
import type { ClassCatalogItem } from "../../classes/types";
import type { DiscussionPost } from "../types";

const api = vi.hoisted(() => ({
  getDiscussion: vi.fn(), createReply: vi.fn(), updateDiscussion: vi.fn(), deleteDiscussion: vi.fn(),
}));
vi.mock("../api/discussionApi", () => api);
vi.mock("../api/contentReportApi", () => ({ createContentReport: vi.fn() }));

import DiscussionThreadView from "./DiscussionThreadView";

const classItem: ClassCatalogItem = {
  class_id: "class-1", class_code: "CS101", title: "Programming Foundations", description: null,
  prerequisites_description: null, thumbnail_url: null, enrollment_policy: "OPEN", status: "ACTIVE",
  tutor: { user_id: "tutor-1", full_name: "Alex Tutor" }, active_member_count: 3, max_capacity: 20,
};

const rootPost: DiscussionPost = {
  discussion_id: "discussion-1", class_id: "class-1", lesson_id: null, author_id: "student-1",
  parent_id: null, title: "Week 1 questions", content: "How do I start?",
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
};

function renderThread(currentUserId = "student-1", item = classItem) {
  return render(
    <App>
      <MemoryRouter initialEntries={["/classes/class-1/discussions/discussion-1"]}>
        <Routes>
          <Route
            path="/classes/class-1/discussions/discussion-1"
            element={(
              <DiscussionThreadView
                classItem={item}
                discussionId="discussion-1"
                currentUserId={currentUserId}
                currentUserName="Nguyen Van A"
                basePath="/classes/class-1/discussions"
              />
            )}
          />
          <Route path="/classes/class-1/discussions" element={<p>Back at the board</p>} />
        </Routes>
      </MemoryRouter>
    </App>,
  );
}

function failure(status: number, code: string) {
  return new ApiError({
    status, error: "Request Failed", message: "The server refused the request.", code,
    timestamp: new Date().toISOString(), path: "/discussions/discussion-1",
  });
}

describe("DiscussionThreadView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDiscussion.mockResolvedValue(rootPost);
    api.createReply.mockResolvedValue({ ...rootPost, discussion_id: "reply-1", parent_id: "discussion-1", title: null, content: "Start with chapter 1." });
    api.updateDiscussion.mockResolvedValue({ ...rootPost, content: "Edited body" });
    api.deleteDiscussion.mockResolvedValue(undefined);
  });

  it("reads the post and states that stored replies cannot be loaded", async () => {
    renderThread();
    expect(await screen.findByText("How do I start?")).toBeInTheDocument();
    expect(api.getDiscussion).toHaveBeenCalledWith("discussion-1", expect.anything());
    expect(screen.getByText("Replies are write-only in the current LMS build")).toBeInTheDocument();
    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
  });

  it("publishes a reply without a title and shows the returned post", async () => {
    renderThread();
    await screen.findByText("How do I start?");
    fireEvent.change(screen.getByPlaceholderText("Write your reply."), { target: { value: "Start with chapter 1." } });
    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));

    await waitFor(() => expect(api.createReply).toHaveBeenCalledWith("discussion-1", { content: "Start with chapter 1." }));
    expect(await screen.findByText("Start with chapter 1.")).toBeInTheDocument();
  });

  it("sends a trimmed reply title only when one was written", async () => {
    renderThread();
    await screen.findByText("How do I start?");
    fireEvent.change(screen.getByPlaceholderText("Leave empty to reply without a title."), { target: { value: "  Re: Week 1  " } });
    fireEvent.change(screen.getByPlaceholderText("Write your reply."), { target: { value: "Thanks" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));
    await waitFor(() => expect(api.createReply).toHaveBeenCalledWith("discussion-1", { content: "Thanks", title: "Re: Week 1" }));
  });

  it("blocks an empty reply before calling the API", async () => {
    renderThread();
    await screen.findByText("How do I start?");
    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));
    expect(await screen.findByText("Write a message before posting.")).toBeInTheDocument();
    expect(api.createReply).not.toHaveBeenCalled();
  });

  it("lets the author edit and delete, and returns to the board after deletion", async () => {
    renderThread();
    await screen.findByText("How do I start?");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmations = await screen.findAllByRole("button", { name: "Delete" });
    fireEvent.click(confirmations[confirmations.length - 1]);
    await waitFor(() => expect(api.deleteDiscussion).toHaveBeenCalledWith("discussion-1"));
    expect(await screen.findByText("Back at the board")).toBeInTheDocument();
  });

  it("keeps the post when the server refuses deletion because replies exist", async () => {
    api.deleteDiscussion.mockRejectedValue(failure(409, "DISCUSSION_HAS_REPLIES"));
    renderThread();
    await screen.findByText("How do I start?");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmations = await screen.findAllByRole("button", { name: "Delete" });
    fireEvent.click(confirmations[confirmations.length - 1]);
    expect(await screen.findByText("This post still has replies, so the server keeps it.")).toBeInTheDocument();
    expect(screen.getByText("How do I start?")).toBeInTheDocument();
  });

  it("hides moderation from a student who did not write the post", async () => {
    renderThread("student-9");
    await screen.findByText("How do I start?");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Report/ })).toBeInTheDocument();
  });

  it("lets the class tutor moderate a student post", async () => {
    renderThread("tutor-1");
    await screen.findByText("How do I start?");
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("explains a missing post instead of rendering an empty thread", async () => {
    api.getDiscussion.mockRejectedValue(failure(404, "DISCUSSION_NOT_FOUND"));
    renderThread();
    expect(await screen.findByText("Post is unavailable")).toBeInTheDocument();
  });

  it("stops replies in an archived class but keeps the post readable", async () => {
    renderThread("student-1", { ...classItem, status: "ARCHIVED" });
    expect(await screen.findByText("How do I start?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish reply" })).not.toBeInTheDocument();
    expect(screen.getByText("This class is archived")).toBeInTheDocument();
  });
});