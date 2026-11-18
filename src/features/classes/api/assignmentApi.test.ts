import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, put, defaults } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  defaults: { baseURL: "http://localhost:8081/api/v1" },
}));

vi.mock("../../../api/lmsClient", () => ({
  lmsClient: { get, put, defaults },
}));

import {
  downloadAssignmentAttachment,
  getAssignmentConfig,
  getMySubmission,
  submitAssignmentFile,
} from "./assignmentApi";

describe("assignment API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: {} });
    put.mockResolvedValue({ data: {} });
  });

  it("fetches assignment configuration for an activity", async () => {
    const signal = new AbortController().signal;
    await getAssignmentConfig("activity-1", signal);
    expect(get).toHaveBeenCalledWith("/activities/activity-1/assignment", { signal });
  });

  it("fetches the current student submission", async () => {
    const signal = new AbortController().signal;
    await getMySubmission("assignment-1", signal);
    expect(get).toHaveBeenCalledWith("/assignments/assignment-1/submissions/me", { signal });
  });

  it("submits or replaces an assignment file using multipart/form-data", async () => {
    const file = new File(["dummy content"], "test.pdf", { type: "application/pdf" });
    await submitAssignmentFile("assignment-1", file);
    expect(put).toHaveBeenCalledWith(
      "/assignments/assignment-1/submission",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  });

  it("downloads an assignment attachment and extracts filename from header", async () => {
    get.mockResolvedValueOnce({
      data: new Blob(["attachment data"]),
      headers: { "content-disposition": 'attachment; filename="spec.pdf"' },
    });
    const result = await downloadAssignmentAttachment("att-1");
    expect(get).toHaveBeenCalledWith(
      "/assignment-attachments/att-1/download",
      expect.objectContaining({ responseType: "blob" }),
    );
    expect(result.filename).toBe("spec.pdf");
  });
});
