import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
import type {
  AssignmentConfiguration,
  AssignmentSubmission,
} from "../api/assignmentApi";

function notFoundError() {
  return new ApiError({
    status: 404,
    error: "Not Found",
    message: "No submission yet.",
    code: "NOT_FOUND",
    timestamp: new Date().toISOString(),
    path: "/assignments/asg-1/submissions/me",
  });
}

const api = vi.hoisted(() => ({
  getAssignmentConfig: vi.fn(),
  getMySubmission: vi.fn(),
  submitAssignmentFile: vi.fn(),
  downloadAssignmentAttachment: vi.fn(),
  triggerBlobDownload: vi.fn(),
}));

vi.mock("../api/assignmentApi", () => api);
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { fullName: "Alex Morgan" } },
    logout: vi.fn(),
  }),
}));

import AssignmentActivityPage from "./AssignmentActivityPage";

const baseConfig: AssignmentConfiguration = {
  assignment_id: "asg-1",
  activity_id: "act-1",
  opening_time: null,
  deadline: "2099-12-31T23:59:59Z",
  allow_late: true,
  allowed_file_types: ["PDF", "DOCX"],
  max_file_size_mb: 20,
  attachments: [
    {
      attachment_id: "att-1",
      file_name: "instructions.pdf",
      mime_type: "application/pdf",
      size_bytes: 10240,
    },
  ],
};

function renderPage() {
  return render(
    <App>
      <MemoryRouter initialEntries={["/classes/c-1/lessons/l-1/activities/act-1"]}>
        <Routes>
          <Route
            path="/classes/:classId/lessons/:lessonId/activities/:activityId"
            element={
              <AssignmentActivityPage
                activityTitle="Assignment: Use Cases"
                activityDescription="Implement the queue and stack use cases."
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </App>,
  );
}

describe("AssignmentActivityPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders not-submitted view with instructions and upload controls", async () => {
    api.getAssignmentConfig.mockResolvedValue(baseConfig);
    api.getMySubmission.mockRejectedValue(notFoundError());

    renderPage();

    expect(await screen.findByText("Assignment: Use Cases")).toBeInTheDocument();
    expect(screen.getByText("Instructions")).toBeInTheDocument();
    expect(screen.getAllByText("Implement the queue and stack use cases.")).toHaveLength(2);
    expect(screen.getByText("Not submitted")).toBeInTheDocument();
    expect(screen.getByText("Drop a file here or choose one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit assignment" })).toBeDisabled();
    expect(screen.getByText("instructions.pdf")).toBeInTheDocument();
  });

  it("downloads reference attachments using assignmentId and attachmentId", async () => {
    const blob = new Blob(["pdf-content"]);
    api.getAssignmentConfig.mockResolvedValue(baseConfig);
    api.getMySubmission.mockRejectedValue(notFoundError());
    api.downloadAssignmentAttachment.mockResolvedValue({ blob, filename: "instructions.pdf" });

    renderPage();

    expect(await screen.findByText("instructions.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Download/i }));

    await waitFor(() => {
      expect(api.downloadAssignmentAttachment).toHaveBeenCalledWith("asg-1", "att-1");
      expect(api.triggerBlobDownload).toHaveBeenCalledWith(blob, "instructions.pdf");
    });
  });

  it("shows visible validation errors for disallowed file types and oversized files", async () => {
    api.getAssignmentConfig.mockResolvedValue(baseConfig);
    api.getMySubmission.mockRejectedValue(notFoundError());

    renderPage();

    await screen.findByText("Not submitted");

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const disallowedFile = new File(["binary"], "malware.exe", { type: "application/octet-stream" });
    fireEvent.change(fileInput, { target: { files: [disallowedFile] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/Unsupported file type/i);
    expect(screen.getByRole("button", { name: "Submit assignment" })).toBeDisabled();

    const oversizedFile = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(oversizedFile, "size", { value: 21 * 1024 * 1024 });
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/exceeds the maximum allowed size of 20 MB/i);
    expect(screen.getByRole("button", { name: "Submit assignment" })).toBeDisabled();
  });

  it("renders submitted view when work has already been submitted", async () => {
    const submission: AssignmentSubmission = {
      submission_id: "sub-1",
      assignment_id: "asg-1",
      class_member_id: "mem-1",
      student_id: "stu-1",
      file_name: "my-solution.pdf",
      mime_type: "application/pdf",
      size_bytes: 20480,
      submitted_at: "2026-10-15T10:00:00Z",
      is_late: false,
      status: "SUBMITTED",
      score: null,
      feedback: null,
      graded_by: null,
      graded_at: null,
      version: 0,
    };

    api.getAssignmentConfig.mockResolvedValue(baseConfig);
    api.getMySubmission.mockResolvedValue(submission);

    renderPage();

    expect(await screen.findByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("my-solution.pdf")).toBeInTheDocument();
    expect(screen.getByText("Awaiting grading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Return to class/i })).toBeInTheDocument();
  });

  it("renders graded view with score and feedback", async () => {
    const submission: AssignmentSubmission = {
      submission_id: "sub-1",
      assignment_id: "asg-1",
      class_member_id: "mem-1",
      student_id: "stu-1",
      file_name: "my-solution.pdf",
      mime_type: "application/pdf",
      size_bytes: 20480,
      submitted_at: "2026-10-15T10:00:00Z",
      is_late: true,
      status: "GRADED",
      score: 92,
      feedback: "Great structure and detailed use cases.",
      graded_by: "tutor-1",
      graded_at: "2026-10-16T10:00:00Z",
      version: 1,
    };

    api.getAssignmentConfig.mockResolvedValue(baseConfig);
    api.getMySubmission.mockResolvedValue(submission);

    renderPage();

    expect(await screen.findByText("Graded")).toBeInTheDocument();
    expect(screen.getByText("92 / 100")).toBeInTheDocument();
    expect(screen.getByText("Great structure and detailed use cases.")).toBeInTheDocument();
    expect(screen.getByText("Late submission")).toBeInTheDocument();
  });

  it("submits a file successfully", async () => {
    api.getAssignmentConfig.mockResolvedValue(baseConfig);
    api.getMySubmission.mockRejectedValue(notFoundError());
    api.submitAssignmentFile.mockResolvedValue({
      submission_id: "sub-new",
      assignment_id: "asg-1",
      class_member_id: "mem-1",
      student_id: "stu-1",
      file_name: "my-solution.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      submitted_at: "2026-10-15T10:00:00Z",
      is_late: false,
      status: "SUBMITTED",
      score: null,
      feedback: null,
      graded_by: null,
      graded_at: null,
      version: 0,
    });

    renderPage();

    await screen.findByText("Not submitted");

    const file = new File(["dummy content"], "my-solution.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    fireEvent.change(fileInput, { target: { files: [file] } });

    const submitBtn = screen.getByRole("button", { name: "Submit assignment" });
    expect(submitBtn).toBeEnabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.submitAssignmentFile).toHaveBeenCalledWith("asg-1", file);
    });

    expect(await screen.findByText("Submitted")).toBeInTheDocument();
  });
});
