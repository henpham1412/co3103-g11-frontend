import type { TutorQuestion } from "./quiz-types";

export function validateTutorQuestion(item: TutorQuestion): string | undefined {
  const correct = item.options.filter((option) => option.is_correct).length;
  if (!item.content.trim()) return "Question content cannot be blank.";
  if (item.points_awarded <= 0) return "Question points must be positive.";
  if (item.options.some((option) => !option.content.trim())) return "Option content cannot be blank.";
  if (item.question_type === "MCQ_SINGLE" && item.options.length < 2) return "Single-choice questions need at least two options.";
  if (item.question_type === "TRUE_FALSE" && item.options.length !== 2) return "True/false questions need exactly two options.";
  if (item.question_type === "MCQ_MULTIPLE" && item.options.length < 2) return "Multiple-choice questions need at least two options.";
  if (item.question_type === "MCQ_MULTIPLE" ? correct < 1 : correct !== 1) return "Select the correct answer(s) before saving.";
  return undefined;
}
