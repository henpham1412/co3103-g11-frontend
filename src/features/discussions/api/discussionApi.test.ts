import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, patch, deleteRequest } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), deleteRequest: vi.fn(),
}));

vi.mock("../../../api/lmsClient", () => ({ lmsClient: { get, post, patch, delete: deleteRequest } }));

import {
  createDiscussion,
  createReply,
  deleteDiscussion,
  getDiscussion,
  listClassDiscussions,
  updateDiscussion,
} from "./discussionApi";

const post1 = {
  discussion_id: "d-1",
  class_id: "c-1",
  lesson_id: null,
  author_id: "u-1",
  parent_id: null,
  title: "Week 1",
  content: "Question",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

describe("discussion API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: { items: [post1], page: 1, size: 20, total_items: 1, total_pages: 1 } });
    post.mockResolvedValue({ data: post1 });
    patch.mockResolvedValue({ data: post1 });
    deleteRequest.mockResolvedValue({});
  });

  it("reads the class thread list with the documented query and abort signal", async () => {
    const signal = new AbortController().signal;
    const page = await listClassDiscussions("c-1", { lesson_id: "l-1", page: 2, size: 10 }, signal);
    expect(get).toHaveBeenCalledWith("/classes/c-1/discussions", {
      params: { lesson_id: "l-1", page: 2, size: 10 },
      signal,
    });
    expect(page.items).toEqual([post1]);
  });

  it("omits query parameters the caller did not set", async () => {
    await listClassDiscussions("c-1");
    expect(get).toHaveBeenCalledWith("/classes/c-1/discussions", { params: {}, signal: undefined });
  });

  it("reads a single post and creates threads and replies on their own endpoints", async () => {
    const signal = new AbortController().signal;
    await getDiscussion("d-1", signal);
    await createDiscussion("c-1", { title: "Week 1", content: "Question", lesson_id: "l-1" });
    await createReply("d-1", { content: "Answer" });
    expect(get).toHaveBeenCalledWith("/discussions/d-1", { signal });
    expect(post).toHaveBeenNthCalledWith(1, "/classes/c-1/discussions", {
      title: "Week 1", content: "Question", lesson_id: "l-1",
    });
    expect(post).toHaveBeenNthCalledWith(2, "/discussions/d-1/replies", { content: "Answer" });
  });

  it("patches only the allowlisted fields and deletes without a body", async () => {
    await updateDiscussion("d-1", { content: "Edited" });
    await deleteDiscussion("d-1");
    expect(patch).toHaveBeenCalledWith("/discussions/d-1", { content: "Edited" });
    expect(deleteRequest).toHaveBeenCalledWith("/discussions/d-1");
  });

  it("returns the created post so the caller can render the server-assigned identifiers", async () => {
    await expect(createReply("d-1", { content: "Answer" })).resolves.toEqual(post1);
  });
});