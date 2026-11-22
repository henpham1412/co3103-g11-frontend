import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("../../../api/lmsClient", () => ({
  lmsClient: { get, post, patch },
}));

import {
  createTutorAssignment,
  downloadSubmission,
  getSubmission,
  getTutorActivity,
  getTutorAssignment,
  gradeSubmission,
  listSubmissions,
  updateTutorAssignmentActivity,
  updateTutorAssignmentSettings,
  uploadAssignmentAttachment,
} from "./tutorAssignmentApi";

describe("tutor assignment API client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    get.mockResolvedValue({ data: { content: [], number: 0, size: 20, totalElements: 0, totalPages: 0 } });
    post.mockResolvedValue({ data: { activity_id: "act-1" } });
    patch.mockResolvedValue({ data: {} });
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

  it("uploads a reference attachment and returns updated AssignmentConfiguration", async () => {
    const updatedConfig = {
      assignment_id: "asg-1",
      activity_id: "act-1",
      opening_time: null,
      deadline: "2026-12-01T23:59:00Z",
      allow_late: true,
      allowed_file_types: ["PDF"],
      max_file_size_mb: 10,
      attachments: [
        {
          attachment_id: "att-1",
          file_name: "sample.pdf",
          mime_type: "application/pdf",
          size_bytes: 6,
        },
      ],
    };
    post.mockResolvedValueOnce({ data: updatedConfig });

    const file = new File(["sample"], "sample.pdf", { type: "application/pdf" });
    const result = await uploadAssignmentAttachment("asg-1", file);
    expect(post).toHaveBeenCalledWith(
      "/assignments/asg-1/attachments",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    expect(result).toEqual(updatedConfig);
  });

  it("maps Spring Data Page responses when listing submissions and calls real submission endpoints", async () => {
    get.mockResolvedValueOnce({
      data: {
        content: [
          {
            submission_id: "sub-1",
            class_member_id: "mem-1",
            student_id: "stu-1",
            student_name: "Alex Morgan",
            file_name: "student.pdf",
            submitted_at: "2026-10-15T10:00:00Z",
            is_late: false,
            status: "SUBMITTED",
            score: null,
          },
        ],
        number: 1,
        size: 20,
        totalElements: 25,
        totalPages: 2,
      },
    });

    const pageResult = await listSubmissions("asg-1", { page: 2, size: 20 });
    expect(get).toHaveBeenCalledWith("/assignments/asg-1/submissions", {
      params: { page: 2, size: 20 },
      signal: undefined,
    });
    expect(pageResult).toEqual({
      items: [
        expect.objectContaining({
          submission_id: "sub-1",
          student_name: "Alex Morgan",
        }),
      ],
      page: 2,
      size: 20,
      total_items: 25,
      total_pages: 2,
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
      "/submissions/sub-1/file",
      expect.objectContaining({ responseType: "blob" }),
    );
    expect(download.filename).toBe("student.pdf");
  });

  it("retrieves tutor activity metadata and assignment configuration separately", async () => {
    await getTutorActivity("act-1");
    expect(get).toHaveBeenCalledWith("/activities/act-1", { signal: undefined });

    await getTutorAssignment("act-1");
    expect(get).toHaveBeenCalledWith("/activities/act-1/assignment", { signal: undefined });
  });
});
