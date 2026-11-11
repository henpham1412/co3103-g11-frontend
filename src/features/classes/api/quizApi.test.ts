import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, put, deleteRequest, defaults } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), deleteRequest: vi.fn(),
  defaults: { baseURL: "http://localhost:8081/api/v1" },
}));

vi.mock("../../../api/lmsClient", () => ({ lmsClient: { get, post, put, delete: deleteRequest, defaults } }));

import { clearQuizAnswer, getQuizAttempt, getQuizSettings, saveQuizAnswer, startOrResumeQuiz, submitQuizAttempt } from "./quizApi";

describe("quiz API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: {} });
    post.mockResolvedValue({ data: {} });
    put.mockResolvedValue({ data: {} });
    deleteRequest.mockResolvedValue({});
  });

  it("uses the documented overview and attempt endpoints", async () => {
    const signal = new AbortController().signal;
    await getQuizSettings("activity-1", signal);
    await startOrResumeQuiz("quiz-1");
    await getQuizAttempt("attempt-1", signal);
    expect(get).toHaveBeenNthCalledWith(1, "/activities/activity-1/quiz", { signal });
    expect(post).toHaveBeenCalledWith("/quizzes/quiz-1/attempts");
    expect(get).toHaveBeenNthCalledWith(2, "/quiz-attempts/attempt-1", { signal });
  });

  it("saves, clears, and submits without sending answer keys", async () => {
    await saveQuizAnswer("attempt-1", "question-1", ["option-1"]);
    await clearQuizAnswer("attempt-1", "question-1");
    await submitQuizAttempt("attempt-1");
    expect(put).toHaveBeenCalledWith("/quiz-attempts/attempt-1/answers/question-1", { selected_option_ids: ["option-1"] });
    expect(deleteRequest).toHaveBeenCalledWith("/quiz-attempts/attempt-1/answers/question-1");
    expect(post).toHaveBeenCalledWith("/quiz-attempts/attempt-1/submit");
  });
});
