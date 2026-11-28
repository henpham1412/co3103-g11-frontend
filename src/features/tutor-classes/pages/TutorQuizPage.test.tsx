import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorQuizDetails } from "../quiz-types";

const api = vi.hoisted(() => ({
  createTutorQuestion: vi.fn(),
  createTutorQuiz: vi.fn(),
  deleteTutorQuestion: vi.fn(),
  getTutorAttempts: vi.fn(),
  getTutorQuiz: vi.fn(),
  updateTutorQuestion: vi.fn(),
  updateTutorQuizActivity: vi.fn(),
  updateTutorQuizSettings: vi.fn(),
}));

vi.mock("../api/tutorQuizApi", () => api);
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { fullName: "Dr. Alex Morgan", role: "TUTOR" } },
    logout: vi.fn(),
  }),
}));

import TutorQuizPage from "./TutorQuizPage";

function sampleQuiz(overrides: Partial<TutorQuizDetails> = {}): TutorQuizDetails {
  return {
    quiz_id: "quiz-1",
    activity_id: "act-1",
    title: "Week 1 Diagnostic",
    description: "Check understanding",
    sequence_order: 1,
    status: "HIDDEN",
    time_limit_minutes: 20,
    attempts_allowed: 2,
    grading_method: "HIGHEST",
    opening_time: null,
    deadline: "2099-12-31T23:59:59.000Z",
    required_score: 70,
    questions: [
      {
        question_id: "q-1",
        question_type: "MCQ_SINGLE",
        content: "What is O(1)?",
        points_awarded: 10,
        points_deducted: 0,
        order_index: 2,
        options: [
          { option_id: "opt-1", content: "Constant time", is_correct: true, order_index: 0 },
          { option_id: "opt-2", content: "Linear time", is_correct: false, order_index: 1 },
        ],
      },
    ],
    ...overrides,
  };
}

function renderEdit() {
  return render(
    <App>
      <MemoryRouter initialEntries={["/tutor/classes/c-1/content/quiz/act-1"]}>
        <Routes>
          <Route path="/tutor/classes/:classId/content/quiz/:activityId" element={<TutorQuizPage />} />
        </Routes>
      </MemoryRouter>
    </App>,
  );
}

describe("TutorQuizPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.updateTutorQuizSettings.mockResolvedValue(undefined);
    api.updateTutorQuizActivity.mockResolvedValue(undefined);
    api.createTutorQuestion.mockResolvedValue({});
    api.updateTutorQuestion.mockResolvedValue({});
    api.deleteTutorQuestion.mockResolvedValue(undefined);
  });

  it("loads activity metadata and persisted questions and preserves unchanged deadline on publish", async () => {
    api.getTutorQuiz.mockResolvedValue(sampleQuiz());
    api.getTutorAttempts.mockResolvedValue([]);

    renderEdit();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Week 1 Diagnostic")).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: "Questions (1)" })).toBeInTheDocument();

    // Open Questions tab and verify persisted question renders
    fireEvent.click(screen.getByRole("tab", { name: "Questions (1)" }));
    expect(await screen.findByText("What is O(1)?")).toBeInTheDocument();

    // Publish valid quiz on Settings tab without changing deadline
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() => {
      expect(api.updateTutorQuizSettings).toHaveBeenCalledWith(
        "act-1",
        expect.not.objectContaining({ deadline: expect.anything() }),
      );
      expect(api.updateTutorQuizActivity).toHaveBeenCalledWith(
        "act-1",
        expect.objectContaining({ title: "Week 1 Diagnostic", status: "PUBLISHED" }),
      );
    });
  });

  it("surfaces contract error instead of rendering fabricated empty questions", async () => {
    const { ApiError } = await import("@/api/apiError");
    api.getTutorQuiz.mockRejectedValue(
      new ApiError({
        status: 502,
        error: "Bad Gateway",
        code: "INVALID_QUIZ_RESPONSE",
        message: "Quiz details response did not include the question list.",
        timestamp: new Date().toISOString(),
        path: "/activities/act-1/quiz",
      }),
    );

    renderEdit();

    await waitFor(() => {
      expect(screen.getByText(/did not include the question list/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("tab", { name: /questions/i })).not.toBeInTheDocument();
  });

  it("enforces post-attempt lock banner, disables adding questions, and hides quiz on lock action", async () => {
    api.getTutorQuiz.mockResolvedValue(sampleQuiz({ status: "PUBLISHED" }));
    api.getTutorAttempts.mockResolvedValue([
      {
        attempt_id: "att-1",
        student_id: "stu-1",
        status: "SUBMITTED",
        attempt_number: 1,
        started_at: "2026-11-01T10:00:00Z",
        submitted_at: "2026-11-01T10:05:00Z",
        score: 100,
        passed: true,
        auto_submitted: false,
      },
    ]);

    renderEdit();

    await waitFor(() => {
      expect(screen.getByText(/locked for restricted edits/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Questions (1)" }));
    const addBtn = await screen.findByRole("button", { name: /add question/i });
    expect(addBtn).toBeDisabled();

    fireEvent.click(screen.getAllByRole("button", { name: /hide quiz/i })[0]);
    await waitFor(() => {
      expect(api.updateTutorQuizActivity).toHaveBeenCalledWith("act-1", { status: "HIDDEN" });
    });
  });

  it("clears previous quiz editor, form, and open question modal when navigating to another quiz that fails to load", async () => {
    const { ApiError } = await import("@/api/apiError");
    api.getTutorQuiz.mockImplementation((id: string) => {
      if (id === "act-a") {
        return Promise.resolve(
          sampleQuiz({
            quiz_id: "quiz-a",
            activity_id: "act-a",
            title: "Quiz A Title",
            questions: [
              {
                question_id: "q-a",
                question_type: "MCQ_SINGLE",
                content: "Quiz A Question?",
                points_awarded: 10,
                points_deducted: 0,
                order_index: 0,
                options: [
                  { option_id: "opt-a1", content: "Alpha", is_correct: true, order_index: 0 },
                  { option_id: "opt-a2", content: "Beta", is_correct: false, order_index: 1 },
                ],
              },
            ],
          }),
        );
      }
      return Promise.reject(
        new ApiError({
          status: 404,
          error: "Not Found",
          code: "QUIZ_NOT_FOUND",
          message: "Quiz B not found.",
          timestamp: new Date().toISOString(),
          path: "/activities/act-b/quiz",
        }),
      );
    });
    api.getTutorAttempts.mockResolvedValue([]);

    render(
      <App>
        <MemoryRouter initialEntries={["/tutor/classes/c-1/content/quiz/act-a"]}>
          <Link to="/tutor/classes/c-1/content/quiz/act-b">Open Quiz B</Link>
          <Routes>
            <Route path="/tutor/classes/:classId/content/quiz/:activityId" element={<TutorQuizPage />} />
          </Routes>
        </MemoryRouter>
      </App>,
    );

    // 1. Quiz A loads with its form, questions, and an open Edit Question modal.
    await waitFor(() => {
      expect(screen.getByDisplayValue("Quiz A Title")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "Questions (1)" }));
    expect(await screen.findByText("Quiz A Question?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(await screen.findByText("Edit Question")).toBeInTheDocument();

    // 2. Navigate to Quiz B whose load fails.
    fireEvent.click(screen.getByRole("link", { name: "Open Quiz B" }));

    // 3. Quiz B error is shown and none of Quiz A's editor, form, or modal state survives.
    await waitFor(() => {
      expect(screen.getByText("Quiz B not found.")).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue("Quiz A Title")).not.toBeInTheDocument();
    expect(screen.queryByText("Quiz A Question?")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /questions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Question" })).not.toBeInTheDocument();
    expect(api.updateTutorQuizSettings).not.toHaveBeenCalled();
    expect(api.updateTutorQuizActivity).not.toHaveBeenCalled();
    expect(api.updateTutorQuestion).not.toHaveBeenCalled();
  });
});
