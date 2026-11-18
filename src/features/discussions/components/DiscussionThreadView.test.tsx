import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
import type { ClassCatalogItem } from "../../classes/types";
import type { DiscussionPost } from "../types";

const api = vi.hoisted(() => ({
  createContentReport: vi.fn(), getDiscussion: vi.fn(), createReply: vi.fn(), updateDiscussion: vi.fn(), deleteDiscussion: vi.fn(),
}));
vi.mock("../api/discussionApi", () => api);
vi.mock("../api/contentReportApi", () => ({ createContentReport: api.createContentReport }));

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

const savedReply: DiscussionPost = { ...rootPost, discussion_id: "reply-1", parent_id: "discussion-1", title: "Stored reply", content: "Start with chapter 1." };
function detail(items: DiscussionPost[] = [], page = 1, total = items.length) {
  return { ...rootPost, replies: { items, page, size: 20, total_items: total, total_pages: Math.ceil(total / 20) } };
}
function replies(count: number): DiscussionPost[] {
  return Array.from({ length: count }, (_, index) => ({
    ...savedReply, author_id: "student-2", discussion_id: `old-reply-${index}`, title: `Old reply ${index}`, content: `Old body ${index}`,
  }));
}
function pageFrom(items: DiscussionPost[], page: number) {
  return detail(items.slice((page - 1) * 20, page * 20), page, items.length);
}

function replyCard() {
  return within(screen.getByText("Stored reply").closest(".ant-card") as HTMLElement);
}

function renderThread(currentUserId = "student-1", item = classItem, lessonId?: string) {
  return render(
    <App>
      <MemoryRouter initialEntries={["/classes/class-1/discussions/discussion-1"]}>
        <Routes>
          <Route
            path="/classes/class-1/discussions/discussion-1"
            element={(
              <DiscussionThreadView
                key="discussion-1"
                classItem={item}
                lessonId={lessonId}
                discussionId="discussion-1"
                currentUserId={currentUserId}
                currentUserName="Nguyen Van A"
                basePath="/classes/class-1/discussions"
              />
            )}
          />
          <Route path="/classes/class-1/discussions/reply-1" element={(
            <DiscussionThreadView key="reply-1" classItem={item} discussionId="reply-1"
              currentUserId={currentUserId} basePath="/classes/class-1/discussions" lessonId={lessonId} />
          )} />
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
    api.getDiscussion.mockResolvedValue(detail());
    api.createReply.mockResolvedValue({ ...rootPost, discussion_id: "reply-1", parent_id: "discussion-1", title: null, content: "Start with chapter 1." });
    api.updateDiscussion.mockResolvedValue({ ...rootPost, content: "Edited body" });
    api.deleteDiscussion.mockResolvedValue(undefined);
  });

  it("reads flat post fields and an empty canonical replies page", async () => {
    renderThread();
    expect(await screen.findByText("How do I start?")).toBeInTheDocument();
    expect(api.getDiscussion).toHaveBeenCalledWith("discussion-1", { page: 1, size: 20 }, expect.anything());
    expect(screen.getByText("No replies yet.")).toBeInTheDocument();
    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
  });

  it("publishes a reply, fetches it canonically and never duplicates it", async () => {
    api.getDiscussion.mockResolvedValueOnce(detail()).mockResolvedValue(detail([savedReply]));
    renderThread();
    await screen.findByText("How do I start?");
    fireEvent.change(screen.getByPlaceholderText("Write your reply."), { target: { value: "Start with chapter 1." } });
    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));

    await waitFor(() => expect(api.createReply).toHaveBeenCalledWith("discussion-1", { content: "Start with chapter 1." }));
    await waitFor(() => expect(screen.getAllByText("Start with chapter 1.", { selector: "div.ant-typography" })).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Refresh replies" }));
    await waitFor(() => expect(api.getDiscussion).toHaveBeenCalledTimes(3));
    expect(await screen.findAllByText("Start with chapter 1.", { selector: "div.ant-typography" })).toHaveLength(1);
  });

  it("sends a trimmed reply title only when one was written", async () => {
    api.getDiscussion.mockResolvedValueOnce(detail()).mockResolvedValue(detail([savedReply]));
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
  it("opens persisted replies again after remounting and preserves parent navigation", async () => {
    api.getDiscussion.mockResolvedValue(detail([savedReply, { ...savedReply, discussion_id: "nested", parent_id: "reply-1", title: "Nested reply", content: "Nested body" }]));
    const view = renderThread();
    expect(await screen.findByText("Nested body")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View parent post" })[1]).toHaveAttribute("href", "/classes/class-1/discussions/reply-1");
    view.unmount();
    renderThread();
    expect(await screen.findByText("Start with chapter 1.")).toBeInTheDocument();
  });

  it("paginates descendants independently of the root board and refreshes the current page", async () => {
    api.getDiscussion.mockImplementation((_id, query) => Promise.resolve(detail(
      query.page === 2 ? [{ ...savedReply, content: "Page two body" }] : [savedReply], query.page, 21,
    )));
    renderThread();
    await screen.findByText("Stored reply");
    fireEvent.click(screen.getByTitle("2"));
    expect(await screen.findByText("Page two body")).toBeInTheDocument();
    expect(screen.queryByText("Start with chapter 1.")).not.toBeInTheDocument();
    expect(api.getDiscussion).toHaveBeenLastCalledWith("discussion-1", { page: 2, size: 20 }, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Refresh replies" }));
    expect(await screen.findByText("Page two body")).toBeInTheDocument();
  });

  it("retries a failed canonical detail read", async () => {
    api.getDiscussion.mockRejectedValueOnce(failure(500, "INTERNAL_SERVER_ERROR")).mockResolvedValue(detail([savedReply]));
    renderThread();
    await screen.findByText("Could not load this post");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Stored reply")).toBeInTheDocument();
  });

  it.each(["student-1", "tutor-1"])("edits a reply as %s using its ID and refreshes the canonical page", async (actor) => {
    api.getDiscussion.mockResolvedValue(detail([savedReply]));
    api.updateDiscussion.mockImplementation(async () => {
      api.getDiscussion.mockResolvedValue(detail([{ ...savedReply, content: "Corrected reply" }]));
      return { ...savedReply, content: "Corrected reply" };
    });
    renderThread(actor);
    await screen.findByText("Stored reply");
    fireEvent.click(replyCard().getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Corrected reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateDiscussion).toHaveBeenCalledWith("reply-1", { title: "Stored reply", content: "Corrected reply" }));
    expect(await screen.findByText("Corrected reply")).toBeInTheDocument();
    expect(screen.getByText("How do I start?")).toBeInTheDocument();
  });

  it("deletes an eligible reply and refreshes without navigating away from the thread", async () => {
    api.getDiscussion.mockResolvedValue(detail([savedReply]));
    api.deleteDiscussion.mockImplementation(async () => { api.getDiscussion.mockResolvedValue(detail()); });
    renderThread();
    await screen.findByText("Stored reply");
    fireEvent.click(replyCard().getByRole("button", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteDiscussion).toHaveBeenCalledWith("reply-1"));
    expect(await screen.findByText("No replies yet.")).toBeInTheDocument();
    expect(screen.getByText("How do I start?")).toBeInTheDocument();
  });

  it.each([
    [409, "DISCUSSION_HAS_REPLIES", "This post still has replies, so the server keeps it."],
    [409, "DISCUSSION_HAS_UNRESOLVED_REPORT", "This post has an open content report, so it cannot be deleted yet."],
    [403, "FORBIDDEN", "You need an active membership in this class to read or post here."],
    [404, "DISCUSSION_NOT_FOUND", "That post no longer exists. The discussion has been reloaded."],
  ])("keeps reply deletion failures authoritative (%s %s)", async (status, code, text) => {
    api.getDiscussion.mockResolvedValue(detail([savedReply]));
    api.deleteDiscussion.mockRejectedValue(failure(status, code));
    renderThread();
    await screen.findByText("Stored reply");
    fireEvent.click(replyCard().getByRole("button", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(await screen.findByText("Stored reply")).toBeInTheDocument();
  });

  it.each([["tutor-1", true], ["student-9", false]])("applies reply moderation hints for %s", async (actor, allowed) => {
    api.getDiscussion.mockResolvedValue(detail([savedReply]));
    renderThread(actor as string);
    await screen.findByText("Stored reply");
    expect(Boolean(replyCard().queryByRole("button", { name: "Edit" }))).toBe(allowed);
    expect(Boolean(replyCard().queryByRole("button", { name: "Delete" }))).toBe(allowed);
    expect(replyCard().getByRole("button", { name: /Report/ })).toBeInTheDocument();
  });

  it("reports the actual reply ID", async () => {
    api.getDiscussion.mockResolvedValue(detail([savedReply]));
    api.createContentReport.mockResolvedValue({ report_id: "report-1" });
    renderThread();
    await screen.findByText("Stored reply");
    fireEvent.click(replyCard().getByRole("button", { name: /Report/ }));
    fireEvent.click(screen.getByText("Spam or advertising"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(api.createContentReport).toHaveBeenCalledWith({ content_type: "DISCUSSION", content_id: "reply-1", reason: "SPAM", description: undefined }));
  });

  it("deletes the final reply on page two, refetches, and clamps to the remaining page", async () => {
    let stored = [...replies(20), savedReply];
    const events: string[] = [];
    api.getDiscussion.mockImplementation(async (_id, query) => {
      events.push(`GET ${query.page}`);
      return pageFrom(stored, query.page);
    });
    api.deleteDiscussion.mockImplementation(async (id) => {
      events.push(`DELETE ${id}`);
      stored = stored.filter((reply) => reply.discussion_id !== id);
    });
    renderThread();
    await screen.findByText("Old body 0");
    fireEvent.click(screen.getByTitle("2"));
    await screen.findByText("Stored reply");
    fireEvent.click(replyCard().getByRole("button", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("tooltip")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Old body 0")).toBeInTheDocument();
    expect(screen.queryByText("Stored reply")).not.toBeInTheDocument();
    expect(events).toEqual(["GET 1", "GET 2", "DELETE reply-1", "GET 2", "GET 1"]);
    expect(screen.queryByTitle("2")).not.toBeInTheDocument();
  });

  it("retains descendant data after editing the root's plain-post mutation response", async () => {
    api.getDiscussion.mockResolvedValue(detail([savedReply]));
    renderThread();
    await screen.findByText("Stored reply");
    const root = within(screen.getByText("How do I start?").closest(".ant-card") as HTMLElement);
    fireEvent.click(root.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Edited root" } });
    api.getDiscussion.mockResolvedValue({ ...detail([savedReply]), content: "Edited root" });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateDiscussion).toHaveBeenCalledWith("discussion-1", { title: "Week 1 questions", content: "Edited root" }));
    expect(await screen.findByText("Edited root")).toBeInTheDocument();
    expect(screen.getByText("Stored reply")).toBeInTheDocument();
  });

  it.each([19, 20])("locates the canonical reply after publishing from %s loaded replies", async (initialCount) => {
    const stored = replies(initialCount);
    api.getDiscussion.mockImplementation(async (_id, query) => pageFrom(stored, query.page));
    api.createReply.mockImplementation(async () => {
      // At 19, another participant crosses the page boundary before our POST completes.
      if (initialCount === 19) stored.push({ ...savedReply, discussion_id: "concurrent", content: "Concurrent reply" });
      stored.push(savedReply);
      return savedReply;
    });
    renderThread();
    await screen.findByText("Old body 0");
    fireEvent.change(screen.getByPlaceholderText("Write your reply."), { target: { value: savedReply.content } });
    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));
    expect(await screen.findByText("Stored reply")).toBeInTheDocument();
    expect(screen.getAllByText(savedReply.content, { selector: "div.ant-typography" })).toHaveLength(1);
    expect(screen.getByTitle("2")).toHaveClass("ant-pagination-item-active");
    expect(api.getDiscussion.mock.calls.map((call) => call[1].page)).toEqual([1, 1, 2]);
    expect(screen.getByPlaceholderText("Write your reply.")).toHaveValue("");
    fireEvent.click(screen.getByTitle("1"));
    expect(await screen.findByText("Old body 0")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("2"));
    await screen.findByText("Stored reply");
    fireEvent.click(screen.getByRole("button", { name: "Refresh replies" }));
    expect(await screen.findByText("Stored reply")).toBeInTheDocument();
    expect(api.getDiscussion).toHaveBeenLastCalledWith("discussion-1", { page: 2, size: 20 }, expect.anything());
  });

  it("uses canonical reply detail when later concurrent replies leave it off the checked pages", async () => {
    let stored = replies(20);
    api.getDiscussion.mockImplementation(async (id, query) => id === "reply-1"
      ? { ...savedReply, replies: detail().replies }
      : pageFrom(stored, query.page));
    api.createReply.mockImplementation(async () => {
      // Our reply lands on page two; later creations fill that page and open page three.
      stored = [...stored, { ...savedReply, created_at: "2026-11-02T00:00:00Z" },
        ...replies(20).map((reply, index) => ({ ...reply, discussion_id: `later-${index}`, created_at: "2026-11-03T00:00:00Z" }))];
      return savedReply;
    });
    renderThread();
    await screen.findByText("Old body 0");
    fireEvent.change(screen.getByPlaceholderText("Write your reply."), { target: { value: savedReply.content } });
    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));
    expect(await screen.findByText(savedReply.content, { selector: "div.ant-typography" })).toBeInTheDocument();
    expect(api.getDiscussion.mock.calls.map((call) => [call[0], call[1].page])).toEqual([
      ["discussion-1", 1], ["discussion-1", 1], ["discussion-1", 3], ["reply-1", 1],
    ]);
  });

  it("preserves the reply draft when publishing is rejected", async () => {
    api.createReply.mockRejectedValue(failure(403, "FORBIDDEN"));
    renderThread();
    await screen.findByText("How do I start?");
    fireEvent.change(screen.getByPlaceholderText("Write your reply."), { target: { value: "Keep my draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));
    await screen.findByText("Reply could not be published");
    expect(screen.getByPlaceholderText("Write your reply.")).toHaveValue("Keep my draft");
    expect(api.getDiscussion).toHaveBeenCalledTimes(1);
  });

  it("retries failed reconciliation without posting twice or losing the created reply identity", async () => {
    const stored = replies(19);
    let failRead = false;
    api.getDiscussion.mockImplementation(async (_id, query) => {
      if (failRead) { failRead = false; throw failure(500, "INTERNAL_SERVER_ERROR"); }
      return pageFrom(stored, query.page);
    });
    api.createReply.mockImplementation(async () => {
      stored.push({ ...savedReply, discussion_id: "concurrent" }, savedReply);
      failRead = true;
      return savedReply;
    });
    renderThread();
    await screen.findByText("Old body 0");
    fireEvent.change(screen.getByPlaceholderText("Write your reply."), { target: { value: savedReply.content } });
    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));
    await screen.findByText("Could not load this post");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Stored reply")).toBeInTheDocument();
    expect(api.createReply).toHaveBeenCalledOnce();
    expect(api.getDiscussion.mock.calls.map((call) => call[1].page)).toEqual([1, 1, 1, 2]);
  });

  it("preserves the active report target, validation and draft when a deferred reply finishes", async () => {
    let finishReply!: (reply: DiscussionPost) => void;
    api.createReply.mockReturnValue(new Promise((resolve) => { finishReply = resolve; }));
    renderThread();
    await screen.findByText("How do I start?");
    fireEvent.change(screen.getByPlaceholderText("Write your reply."), { target: { value: savedReply.content } });
    fireEvent.click(screen.getByRole("button", { name: "Publish reply" }));
    await waitFor(() => expect(api.createReply).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: /Report/ }));
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "Draft about the root" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("Choose a reason for this report.");
    const originalDetails = screen.getByLabelText("Details (optional)");
    api.getDiscussion.mockResolvedValue(detail([savedReply]));
    await act(async () => finishReply(savedReply));
    await screen.findByText("Stored reply");
    expect(screen.getByLabelText("Details (optional)")).toBe(originalDetails);
    expect(originalDetails).toHaveValue("Draft about the root");
    expect(screen.getByText("Choose a reason for this report.")).toBeInTheDocument();
    expect(screen.getByText(/Reporting post “Week 1 questions”/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Harassment or bullying"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh replies" }));
    await screen.findByText("Stored reply");
    expect(screen.getByRole("radio", { name: "Harassment or bullying" })).toBeChecked();
    expect(originalDetails).toHaveValue("Draft about the root");
    api.createContentReport.mockResolvedValue({ report_id: "report-1" });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(api.createContentReport).toHaveBeenCalledWith({
      content_type: "DISCUSSION", content_id: "discussion-1", reason: "HARASSMENT", description: "Draft about the root",
    }));
  });

  it("does not retain the report draft when navigating to a different discussion", async () => {
    api.getDiscussion.mockImplementation(async (id) => id === "reply-1"
      ? { ...savedReply, replies: detail().replies } : detail([savedReply]));
    renderThread();
    await screen.findByText("Stored reply");
    fireEvent.click(within(screen.getByText("How do I start?").closest(".ant-card") as HTMLElement).getByRole("button", { name: /Report/ }));
    fireEvent.change(await screen.findByLabelText("Details (optional)"), { target: { value: "Root-only draft" } });
    fireEvent.click(screen.getByRole("link", { name: "Open reply and conversation" }));
    await waitFor(() => expect(api.getDiscussion).toHaveBeenLastCalledWith("reply-1", { page: 1, size: 20 }, expect.anything()));
    expect(await screen.findByText(savedReply.content)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Report content" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Report/ }));
    expect(await screen.findByLabelText("Details (optional)")).toHaveValue("");
  });

  it("keeps lesson context through board, parent and lesson links", async () => {
    api.getDiscussion.mockResolvedValue({ ...detail([savedReply]), lesson_id: "lesson-1" });
    renderThread("student-1", classItem, "lesson-1");
    await screen.findByText("Stored reply");
    expect(screen.getByRole("link", { name: /Back to discussions/ })).toHaveAttribute("href", "/classes/class-1/discussions?lesson_id=lesson-1");
    expect(screen.getByRole("link", { name: "Back to lesson" })).toHaveAttribute("href", "/classes/class-1/lessons/lesson-1");
    expect(screen.getByRole("link", { name: "View parent post" })).toHaveAttribute("href", "/classes/class-1/discussions/discussion-1?lesson_id=lesson-1");
  });

  it.each([
    { class_id: "class-2", lesson_id: null },
    { class_id: "class-1", lesson_id: "other-lesson" },
  ])("does not present a post in the wrong route context: %j", async (context) => {
    api.getDiscussion.mockResolvedValue({ ...detail(), ...context });
    renderThread("student-1", classItem, "lesson-1");
    expect(await screen.findByText("Post is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("How do I start?")).not.toBeInTheDocument();
  });

});