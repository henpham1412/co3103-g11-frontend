import { expect, it } from "vitest";
import { outlineProgress } from "@/test/fixtures/recommendation";
import { classProgress } from "@/test/fixtures/progress";
import { recommendedActivityPath, resumePath } from "./progressModel";

it("maps the exact Quiz Activity to its actual Lesson without requiring any attempt", () => {
  const data = outlineProgress();
  expect(data.chapters[0].lessons[0].assessment_statuses[0].attempts).toEqual([]);
  expect(recommendedActivityPath("class-123", data, "activity-1")).toBe("/classes/class-123/lessons/lesson-1/activities/activity-1");
});
it("does not guess relationships from title, order, another class or non-Quiz activity", () => {
  const data = outlineProgress();
  expect(recommendedActivityPath("other", data, "activity-1")).toBeUndefined();
  expect(recommendedActivityPath("class-123", data, "Practice quiz")).toBeUndefined();
  data.chapters[0].lessons[0].assessment_statuses[0].activity_type = "ASSIGNMENT";
  expect(recommendedActivityPath("class-123", data, "activity-1")).toBeUndefined();
});
it("preserves the three existing canonical resume navigation cases", () => {
  const data = classProgress();
  expect(resumePath("class-123", data, data.resume_target)).toContain("/lesson-1/activities/activity-1");
  expect(resumePath("class-123", data, { target_type: "LESSON", target_id: "lesson-2", reason: "FIRST_INCOMPLETE_LESSON" })).toBe("/classes/class-123/lessons/lesson-2");
  expect(resumePath("class-123", data, { target_type: "CLASS_OUTLINE", target_id: "class-123", reason: "NO_UNFINISHED_TARGET" })).toBe("/classes/class-123");
});
