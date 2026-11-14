import type { ClassProgressResponse, ResumeTarget } from "./types";

export function resumePath(classId: string, progress: ClassProgressResponse, target: ResumeTarget): string | undefined {
  if (progress.class_id !== classId) return undefined;
  if (target.target_type === "CLASS_OUTLINE") return `/classes/${classId}`;
  if (target.target_type === "LESSON") return `/classes/${classId}/lessons/${target.target_id}`;
  for (const chapter of progress.chapters) {
    for (const lesson of chapter.lessons) {
      const assessment = lesson.assessment_statuses.find(item => item.activity_type === "QUIZ"
        && item.attempts.some(attempt => attempt.attempt_id === target.target_id && attempt.status === "IN_PROGRESS"));
      if (assessment) return `/classes/${classId}/lessons/${lesson.lesson_id}/activities/${assessment.activity_id}`;
    }
  }
  return undefined;
}
