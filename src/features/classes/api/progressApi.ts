import { lmsClient } from "../../../api/lmsClient";
import type { ClassProgressResponse, ResumeTarget } from "../types";

export async function getClassProgress(classId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<ClassProgressResponse>(`/classes/${classId}/progress`, { signal });
  return response.data;
}

export async function markLessonComplete(classId: string, lessonId: string) {
  await lmsClient.put(`/classes/${classId}/lessons/${lessonId}/completion`);
}

export async function unmarkLessonComplete(classId: string, lessonId: string) {
  await lmsClient.delete(`/classes/${classId}/lessons/${lessonId}/completion`);
}

export async function recordLastVisit(classId: string, lessonId: string) {
  await lmsClient.put(`/classes/${classId}/last-visit`, { lesson_id: lessonId });
}

export async function getResumeTarget(classId: string, signal?: AbortSignal): Promise<ResumeTarget> {
  const response = await lmsClient.get<ResumeTarget>(`/classes/${classId}/resume-target`, { signal });
  return response.data;
}
