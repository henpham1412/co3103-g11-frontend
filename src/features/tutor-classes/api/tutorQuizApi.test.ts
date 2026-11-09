import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, patch, deleteRequest } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), deleteRequest: vi.fn(),
}));
vi.mock("../../../api/lmsClient", () => ({ lmsClient: { get, post, patch, delete: deleteRequest } }));

import { createTutorQuiz, createTutorQuestion, getTutorAttempts, updateTutorQuizActivity } from "./tutorQuizApi";

describe("tutor quiz API client", () => {
  beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue({ data: { items: [] } }); post.mockResolvedValue({ data: { activity_id: "activity-1" } }); });

  it("creates an atomic hidden quiz activity with settings", async () => {
    await createTutorQuiz("lesson-1", { title: "Quiz", sequence_order: 2, status: "HIDDEN", quiz: { time_limit_minutes: 20, attempts_allowed: 1, grading_method: "HIGHEST", opening_time: null, deadline: "2026-12-01T00:00:00Z", required_score: 70 } });
    expect(post).toHaveBeenCalledWith("/lessons/lesson-1/activities", expect.objectContaining({ activity_type: "QUIZ", status: "HIDDEN" }));
  });

  it("keeps tutor writes on the documented activity/question endpoints", async () => {
    await updateTutorQuizActivity("activity-1", { status: "HIDDEN" });
    await createTutorQuestion("activity-1", { question_type: "MCQ_SINGLE", content: "Q", points_awarded: 1, points_deducted: 0, order_index: 0, options: [{ option_id: "", content: "A", is_correct: true, order_index: 0 }] });
    await getTutorAttempts("quiz-1");
    expect(patch).toHaveBeenCalledWith("/activities/activity-1", { status: "HIDDEN" });
    expect(get).toHaveBeenCalledWith("/quizzes/quiz-1/attempts", { signal: undefined });
  });
});
