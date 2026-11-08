import { describe, expect, it } from "vitest";
import { validateTutorQuestion } from "../quizValidation";
import type { TutorQuestion } from "../quiz-types";

const question = (overrides: Partial<TutorQuestion> = {}): TutorQuestion => ({
  question_id: "q1",
  question_type: "MCQ_SINGLE",
  content: "Choose one",
  points_awarded: 1,
  points_deducted: 0,
  order_index: 0,
  options: [
    { option_id: "o1", content: "A", is_correct: true, order_index: 0 },
    { option_id: "o2", content: "B", is_correct: false, order_index: 1 },
  ],
  ...overrides,
});

describe("tutor quiz validation", () => {
  it("requires two options for single-choice questions", () => {
    expect(validateTutorQuestion(question({ options: [question().options[0]] }))).toContain("two options");
  });

  it("requires exactly one correct option for single-choice questions", () => {
    expect(validateTutorQuestion(question({ options: question().options.map((option) => ({ ...option, is_correct: true })) }))).toContain("correct");
  });

  it("requires at least one correct option for multiple-choice questions", () => {
    expect(validateTutorQuestion(question({ question_type: "MCQ_MULTIPLE", options: question().options.map((option) => ({ ...option, is_correct: false })) }))).toContain("correct");
  });
});
