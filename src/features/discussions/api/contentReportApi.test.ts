import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("../../../api/lmsClient", () => ({ lmsClient: { post } }));

import { createContentReport } from "./contentReportApi";

const created = {
  report_id: "r-1",
  content_type: "DISCUSSION",
  content_id: "d-1",
  reason: "SPAM",
  status: "PENDING",
  created_at: "2026-11-01T00:00:00Z",
};

describe("content report API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: created });
  });

  it("posts the DOC-05 report payload and returns the created report", async () => {
    await expect(createContentReport({
      content_type: "MATERIAL", content_id: "m-1", reason: "OTHER", description: "  Broken link  ",
    })).resolves.toEqual(created);
    expect(post).toHaveBeenCalledWith("/content-reports", {
      content_type: "MATERIAL", content_id: "m-1", reason: "OTHER", description: "Broken link",
    });
  });

  it("omits a blank description instead of sending a value the server rejects", async () => {
    await createContentReport({ content_type: "DISCUSSION", content_id: "d-1", reason: "SPAM", description: "   " });
    expect(post).toHaveBeenCalledWith("/content-reports", {
      content_type: "DISCUSSION", content_id: "d-1", reason: "SPAM",
    });
  });

  it("omits the description when the reporter left it out", async () => {
    await createContentReport({ content_type: "DISCUSSION", content_id: "d-1", reason: "HARASSMENT" });
    expect(post).toHaveBeenCalledWith("/content-reports", {
      content_type: "DISCUSSION", content_id: "d-1", reason: "HARASSMENT",
    });
  });

  it("never sends reporter, status or review fields the server refuses", async () => {
    await createContentReport({ content_type: "DISCUSSION", content_id: "d-1", reason: "SPAM" });
    const [, payload] = post.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(["content_id", "content_type", "reason"]);
  });
});