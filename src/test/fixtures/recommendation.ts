import type { RecommendedActivitiesResponse } from "../../features/classes/recommendation-types";
import { classProgress } from "./progress";

export function recommendation(classId = "class-123"): RecommendedActivitiesResponse {
  return { class_id: classId, recommendation: {
    activity_id: "activity-1", activity_type: "QUIZ", title: "Practice: Java Variables", reason: "ADDITIONAL_PRACTICE",
    skill_topics: [{ skill_topic_id: "topic-1", name: "Java Syntax", mastery_level: "DEVELOPING" },
      { skill_topic_id: "topic-2", name: "Collections", mastery_level: null }],
  } };
}

/** Completed Lessons can still contain unattempted Quizzes; completion does not imply mastery. */
export function outlineProgress(classId = "class-123") {
  const data = classProgress(classId);
  data.status = "COMPLETED"; data.completed_lessons = data.eligible_lessons; data.progress_percentage = 100;
  data.resume_target = { target_type: "CLASS_OUTLINE", target_id: classId, reason: "NO_UNFINISHED_TARGET" };
  for (const chapter of data.chapters) {
    chapter.completed_lessons = chapter.eligible_lessons; chapter.progress_percentage = 100;
    for (const lesson of chapter.lessons) {
      lesson.completed = true; lesson.marked_at = "2026-11-01T01:00:00Z";
      for (const item of lesson.assessment_statuses) { item.status = "NOT_STARTED"; item.attempts = []; }
    }
  }
  return data;
}
