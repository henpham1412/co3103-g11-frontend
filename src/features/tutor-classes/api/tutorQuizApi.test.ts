import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, patch, deleteRequest } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), deleteRequest: vi.fn(),
}));
vi.mock("../../../api/lmsClient", () => ({ lmsClient: { get, post, patch, delete: deleteRequest } }));

import {
  createTutorQuestion,
  createTutorQuiz,
  getTutorAttempts,
  getTutorQuiz,
  updateTutorQuestion,
  updateTutorQuizActivity,
} from "./tutorQuizApi";

describe("tutor quiz API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: { items: [] } });
    post.mockResolvedValue({ data: { activity_id: "activity-1" } });
    patch.mockResolvedValue({ data: {} });
  });

  it("merges activity metadata and tutor quiz configuration including real questions", async () => {
    get
      .mockResolvedValueOnce({
        data: {
          activity_id: "activity-1",
          lesson_id: "lesson-1",
          title: "Week 1 Quiz",
          description: "Fundamentals",
          activity_type: "QUIZ",
          sequence_order: 2,
          status: "HIDDEN",
        },
      })
      .mockResolvedValueOnce({
        data: {
          quiz_id: "quiz-1",
          activity_id: "activity-1",
          time_limit_minutes: 20,
          attempts_allowed: 2,
          grading_method: "HIGHEST",
          opening_time: null,
          deadline: "2099-12-01T00:00:00Z",
          required_score: 70,
          questions: [
            {
              question_id: "q-1",
              question_type: "MCQ_SINGLE",
              content: "What is O(1)?",
              points_awarded: 10,
              points_deducted: 0,
              order_index: 0,
              options: [
                { option_id: "o-1", content: "Constant", is_correct: true, order_index: 0 },
                { option_id: "o-2", content: "Linear", is_correct: false, order_index: 1 },
              ],
            },
          ],
        },
      });

    const details = await getTutorQuiz("activity-1");
    expect(get).toHaveBeenNthCalledWith(1, "/activities/activity-1", { signal: undefined });
    expect(get).toHaveBeenNthCalledWith(2, "/activities/activity-1/quiz", { signal: undefined });
    expect(details.title).toBe("Week 1 Quiz");
    expect(details.status).toBe("HIDDEN");
    expect(details.sequence_order).toBe(2);
    expect(details.questions).toHaveLength(1);
    expect(details.questions[0].options[0].is_correct).toBe(true);
  });

  it("rejects instead of fabricating empty questions when backend omits questions array", async () => {
    get
      .mockResolvedValueOnce({
        data: {
          activity_id: "activity-1",
          lesson_id: "lesson-1",
          title: "Week 1 Quiz",
          description: null,
          activity_type: "QUIZ",
          sequence_order: 0,
          status: "HIDDEN",
        },
      })
      .mockResolvedValueOnce({
        data: {
          quiz_id: "quiz-1",
          time_limit_minutes: 20,
          attempts_allowed: 1,
          grading_method: "HIGHEST",
          opening_time: null,
          deadline: "2099-12-01T00:00:00Z",
          required_score: null,
        },
      });

    await expect(getTutorQuiz("activity-1")).rejects.toThrow("question list");
  });

  it("creates an atomic hidden quiz activity with embedded settings", async () => {
    await createTutorQuiz("lesson-1", {
      title: "Quiz",
      sequence_order: 2,
      status: "HIDDEN",
      quiz: {
        time_limit_minutes: 20,
        attempts_allowed: 1,
        grading_method: "HIGHEST",
        opening_time: null,
        deadline: "2099-12-01T00:00:00Z",
        required_score: 70,
      },
    });
    expect(post).toHaveBeenCalledWith(
      "/lessons/lesson-1/activities",
      expect.objectContaining({
        activity_type: "QUIZ",
        status: "HIDDEN",
        quiz: expect.objectContaining({ time_limit_minutes: 20 }),
      }),
    );
  });

  it("sanitizes option_id on question create and update payloads", async () => {
    await updateTutorQuizActivity("activity-1", { status: "HIDDEN" });
    await createTutorQuestion("activity-1", {
      question_type: "MCQ_SINGLE",
      content: "Q",
      points_awarded: 1,
      points_deducted: 0,
      order_index: 0,
      options: [{ content: "A", is_correct: true, order_index: 0 }],
    });
    await updateTutorQuestion("q-1", {
      content: "Updated Q",
      options: [
        { option_id: "opt-1", content: "A", is_correct: true, order_index: 0 },
        { option_id: "", content: "New Option", is_correct: false, order_index: 1 },
      ],
    });
    await getTutorAttempts("quiz-1");

    expect(patch).toHaveBeenNthCalledWith(1, "/activities/activity-1", { status: "HIDDEN" });
    expect(post).toHaveBeenCalledWith("/activities/activity-1/questions", {
      question_type: "MCQ_SINGLE",
      content: "Q",
      points_awarded: 1,
      points_deducted: 0,
      order_index: 0,
      options: [{ content: "A", is_correct: true, order_index: 0 }],
    });
    expect(patch).toHaveBeenNthCalledWith(2, "/questions/q-1", {
      content: "Updated Q",
      options: [
        { option_id: "opt-1", content: "A", is_correct: true, order_index: 0 },
        { content: "New Option", is_correct: false, order_index: 1 },
      ],
    });
    expect(get).toHaveBeenCalledWith("/quizzes/quiz-1/attempts", { signal: undefined });
  });
});
