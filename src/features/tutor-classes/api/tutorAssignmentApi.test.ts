import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, patch, deleteRequest } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  deleteRequest: vi.fn(),
}));

vi.mock("../../../api/lmsClient", () => ({
  lmsClient: { get, post, patch, delete: deleteRequest },
}));

import {
  createTutorAssignment,
  deleteAssignmentAttachment,
  downloadSubmission,
  getSubmission,
  getTutorAssignment,
  gradeSubmission,
  listSubmissions,
  updateTutorAssignmentActivity,
  updateTutorAssignmentSettings,
  uploadAssignmentAttachment,
} from "./tutorAssignmentApi";

describe("tutor assignment API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: { items: [] } });
    post.mockResolvedValue({ data: { activity_id: "act-1", assignment_id: "asg-1" } });
    patch.mockResolvedValue({ data: {} });
    deleteRequest.mockResolvedValue({});
  });

  it("creates an assignment activity with settings", async () => {
    await createTutorAssignment("lesson-1", {
      title: "Homework 1",
      description: "Do exercises",
      sequence_order: 1,
      status: "PUBLISHED",
      assignment: {
        opening_time: null,
        deadline: "2026-12-01T23:59:00Z",
        allow_late: true,
        allowed_file_types: ["PDF"],
        max_file_size_mb: 10,
      },
    });
    expect(post).toHaveBeenCalledWith(
      "/lessons/lesson-1/activities",
      expect.objectContaining({
        activity_type: "ASSIGNMENT",
        title: "Homework 1",
        status: "PUBLISHED",
      }),
    );
  });

  it("updates assignment activity and settings via PATCH endpoints", async () => {
    await updateTutorAssignmentActivity("act-1", { title: "Updated Title" });
    expect(patch).toHaveBeenCalledWith("/activities/act-1", { title: "Updated Title" });

    await updateTutorAssignmentSettings("act-1", { allow_late: false });
    expect(patch).toHaveBeenCalledWith("/activities/act-1/assignment", { allow_late: false });
  });

  it("manages reference attachments", async () => {
    const file = new File(["sample"], "sample.pdf", { type: "application/pdf" });
    await uploadAssignmentAttachment("asg-1", file);
    expect(post).toHaveBeenCalledWith(
      "/assignments/asg-1/attachments",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } },
    );

    await deleteAssignmentAttachment("att-1");
    expect(deleteRequest).toHaveBeenCalledWith("/assignment-attachments/att-1");
  });

  it("lists, views, grades, and downloads submissions", async () => {
    await listSubmissions("asg-1", { page: 1, size: 20 });
    expect(get).toHaveBeenCalledWith("/assignments/asg-1/submissions", {
      params: { page: 1, size: 20 },
      signal: undefined,
    });

    await getSubmission("sub-1");
    expect(get).toHaveBeenCalledWith("/submissions/sub-1", { signal: undefined });

    await gradeSubmission("sub-1", { score: 95, feedback: "Great work", version: 1 });
    expect(patch).toHaveBeenCalledWith("/submissions/sub-1/grade", {
      score: 95,
      feedback: "Great work",
      version: 1,
    });

    get.mockResolvedValueOnce({
      data: new Blob(["sub-content"]),
      headers: { "content-disposition": 'attachment; filename="student.pdf"' },
    });
    const download = await downloadSubmission("sub-1");
    expect(get).toHaveBeenCalledWith(
      "/submissions/sub-1/download",
      expect.objectContaining({ responseType: "blob" }),
    );
    expect(download.filename).toBe("student.pdf");
  });

  it("retrieves tutor assignment details", async () => {
    await getTutorAssignment("act-1");
    expect(get).toHaveBeenCalledWith("/activities/act-1/assignment", { signal: undefined });
  });
});
