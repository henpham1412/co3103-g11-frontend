import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
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

describe("TutorAssignmentGradingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists submissions and allows grading a selected submission", async () => {
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
      size: 100,
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
});
