import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getTutorAssignment: vi.fn(),
  listSubmissions: vi.fn(),
  getSubmission: vi.fn(),
  gradeSubmission: vi.fn(),
  downloadSubmission: vi.fn(),
}));

const classApi = vi.hoisted(() => ({
  triggerBlobDownload: vi.fn(),
}));

vi.mock("../api/tutorAssignmentApi", () => api);
vi.mock("../../classes/api/assignmentApi", () => classApi);
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { fullName: "Dr. Alex Morgan", role: "TUTOR" } },
    logout: vi.fn(),
  }),
}));

import TutorAssignmentGradingPage from "./TutorAssignmentGradingPage";

function renderGradingPage() {
  return render(
    <App>
      <MemoryRouter initialEntries={["/tutor/classes/c-1/content/assignment/act-1/grade"]}>
        <Routes>
          <Route
            path="/tutor/classes/:classId/content/assignment/:activityId/grade"
            element={<TutorAssignmentGradingPage />}
          />
        </Routes>
      </MemoryRouter>
    </App>,
  );
}

const baseAssignmentConfig = {
  assignment_id: "asg-1",
  activity_id: "act-1",
  opening_time: null,
  deadline: "2099-12-31T23:59:59Z",
  allow_late: true,
  allowed_file_types: ["PDF"],
  max_file_size_mb: 20,
  attachments: [],
};

describe("TutorAssignmentGradingPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getTutorAssignment.mockResolvedValue(baseAssignmentConfig);
  });

  it("resolves assignmentId from activityId before listing submissions and grades a selected submission", async () => {
    api.listSubmissions.mockResolvedValue({
      items: [
        {
          submission_id: "sub-1",
          class_member_id: "mem-1",
          student_id: "stu-1",
          student_name: "Alex Morgan",
          file_name: "use-cases-solution.pdf",
          submitted_at: "2026-10-15T10:00:00Z",
          is_late: false,
          status: "SUBMITTED",
          score: null,
        },
      ],
      page: 1,
      size: 20,
      total_items: 1,
      total_pages: 1,
    });

    api.getSubmission.mockResolvedValue({
      submission_id: "sub-1",
      assignment_id: "asg-1",
      class_member_id: "mem-1",
      student_id: "stu-1",
      file_name: "use-cases-solution.pdf",
      mime_type: "application/pdf",
      size_bytes: 10240,
      submitted_at: "2026-10-15T10:00:00Z",
      is_late: false,
      status: "SUBMITTED",
      score: null,
      feedback: null,
      graded_by: null,
      graded_at: null,
      version: 0,
    });

    api.gradeSubmission.mockResolvedValue({
      submission_id: "sub-1",
      assignment_id: "asg-1",
      class_member_id: "mem-1",
      student_id: "stu-1",
      file_name: "use-cases-solution.pdf",
      mime_type: "application/pdf",
      size_bytes: 10240,
      submitted_at: "2026-10-15T10:00:00Z",
      is_late: false,
      status: "GRADED",
      score: 82,
      feedback: "Well done.",
      graded_by: "tutor-1",
      graded_at: "2026-10-16T10:00:00Z",
      version: 1,
    });

    renderGradingPage();

    expect(await screen.findByRole("heading", { level: 2, name: "Grading & Feedback" })).toBeInTheDocument();
    expect(await screen.findByText("Alex Morgan")).toBeInTheDocument();
    expect(api.getTutorAssignment).toHaveBeenCalledWith("act-1", expect.any(AbortSignal));
    expect(api.listSubmissions).toHaveBeenCalledWith(
      "asg-1",
      { page: 1, size: 20 },
      expect.any(AbortSignal),
    );
    expect(screen.getByText("Needs grading")).toBeInTheDocument();

    // Select the student
    fireEvent.click(screen.getByText("Alex Morgan"));

    expect(await screen.findByText("use-cases-solution.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText(/Score/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Written feedback/)).toBeInTheDocument();

    // Fill score and feedback
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "82" } });
    fireEvent.change(screen.getByLabelText(/Written feedback/), { target: { value: "Well done." } });

    // Submit grade
    fireEvent.click(screen.getByRole("button", { name: "Save grade" }));

    await waitFor(() => {
      expect(api.gradeSubmission).toHaveBeenCalledWith("sub-1", {
        score: 82,
        feedback: "Well done.",
        version: 0,
      });
    });

    expect(await screen.findByText(/Already graded — Score: 82 \/ 100/)).toBeInTheDocument();
  });

  it("supports server-side pagination across submission pages", async () => {
    api.listSubmissions
      .mockResolvedValueOnce({
        items: [
          {
            submission_id: "sub-1",
            class_member_id: "mem-1",
            student_id: "stu-1",
            student_name: "Page One Student",
            file_name: "page1.pdf",
            submitted_at: "2026-10-15T10:00:00Z",
            is_late: false,
            status: "SUBMITTED",
            score: null,
          },
        ],
        page: 1,
        size: 20,
        total_items: 25,
        total_pages: 2,
      })
      .mockResolvedValueOnce({
        items: [
          {
            submission_id: "sub-21",
            class_member_id: "mem-21",
            student_id: "stu-21",
            student_name: "Page Two Student",
            file_name: "page2.pdf",
            submitted_at: "2026-10-14T10:00:00Z",
            is_late: false,
            status: "GRADED",
            score: 90,
          },
        ],
        page: 2,
        size: 20,
        total_items: 25,
        total_pages: 2,
      });

    renderGradingPage();

    expect(await screen.findByText("Page One Student")).toBeInTheDocument();
    expect(screen.getByText("Submissions (25)")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("2"));

    expect(await screen.findByText("Page Two Student")).toBeInTheDocument();
    expect(api.listSubmissions).toHaveBeenNthCalledWith(
      2,
      "asg-1",
      { page: 2, size: 20 },
      expect.any(AbortSignal),
    );
  });

  it("ignores stale submission detail responses when switching selections quickly", async () => {
    api.listSubmissions.mockResolvedValue({
      items: [
        {
          submission_id: "sub-1",
          class_member_id: "mem-1",
          student_id: "stu-1",
          student_name: "First Student",
          file_name: "first.pdf",
          submitted_at: "2026-10-15T10:00:00Z",
          is_late: false,
          status: "SUBMITTED",
          score: null,
        },
        {
          submission_id: "sub-2",
          class_member_id: "mem-2",
          student_id: "stu-2",
          student_name: "Second Student",
          file_name: "second.pdf",
          submitted_at: "2026-10-15T11:00:00Z",
          is_late: false,
          status: "SUBMITTED",
          score: null,
        },
      ],
      page: 1,
      size: 20,
      total_items: 2,
      total_pages: 1,
    });

    let resolveFirst!: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    api.getSubmission
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce({
        submission_id: "sub-2",
        assignment_id: "asg-1",
        class_member_id: "mem-2",
        student_id: "stu-2",
        file_name: "second-submission.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048,
        submitted_at: "2026-10-15T11:00:00Z",
        is_late: false,
        status: "SUBMITTED",
        score: null,
        feedback: null,
        graded_by: null,
        graded_at: null,
        version: 0,
      });

    renderGradingPage();

    expect(await screen.findByText("First Student")).toBeInTheDocument();

    // Select first student (slow), then immediately switch to second student (fast)
    fireEvent.click(screen.getByText("First Student"));
    fireEvent.click(screen.getByText("Second Student"));

    expect(await screen.findByText("second-submission.pdf")).toBeInTheDocument();

    // Now resolve the stale first request and verify it does NOT overwrite the active detail
    resolveFirst({
      submission_id: "sub-1",
      assignment_id: "asg-1",
      class_member_id: "mem-1",
      student_id: "stu-1",
      file_name: "stale-first-submission.pdf",
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

    await waitFor(() => {
      expect(screen.getByText("second-submission.pdf")).toBeInTheDocument();
      expect(screen.queryByText("stale-first-submission.pdf")).not.toBeInTheDocument();
    });
  });
});
