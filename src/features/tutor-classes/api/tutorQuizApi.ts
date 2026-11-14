import { lmsClient } from "../../../api/lmsClient";
import type { TutorAttempt, TutorQuestion, TutorQuizDetails } from "../quiz-types";

export async function getTutorQuiz(activityId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<TutorQuizDetails>(`/activities/${activityId}/quiz`, { signal });
  return response.data;
}

export async function createTutorQuiz(
  lessonId: string,
  payload: {
    title: string;
    description?: string;
    sequence_order: number;
    status: "PUBLISHED" | "HIDDEN";
    quiz: {
      time_limit_minutes: number;
      attempts_allowed: number;
      grading_method: "HIGHEST" | "AVERAGE" | "LAST";
      opening_time: string | null;
      deadline: string;
      required_score: number | null;
    };
  },
) {
  const response = await lmsClient.post<TutorQuizDetails>(`/lessons/${lessonId}/activities`, {
    activity_type: "QUIZ",
    ...payload,
  });
  return response.data;
}

export async function updateTutorQuizSettings(activityId: string, payload: Partial<Pick<TutorQuizDetails, "time_limit_minutes" | "attempts_allowed" | "grading_method" | "opening_time" | "deadline" | "required_score">>) {
  await lmsClient.patch(`/activities/${activityId}/quiz`, payload);
}

export async function updateTutorQuizActivity(activityId: string, payload: { title?: string; description?: string; sequence_order?: number; status?: "PUBLISHED" | "HIDDEN" }) {
  await lmsClient.patch(`/activities/${activityId}`, payload);
}

export async function createTutorQuestion(activityId: string, payload: Omit<TutorQuestion, "question_id">) {
  const response = await lmsClient.post<TutorQuestion>(`/activities/${activityId}/questions`, payload);
  return response.data;
}

export async function updateTutorQuestion(questionId: string, payload: Partial<Omit<TutorQuestion, "question_id">>) {
  await lmsClient.patch(`/questions/${questionId}`, payload);
}

export async function deleteTutorQuestion(questionId: string) {
  await lmsClient.delete(`/questions/${questionId}`);
}

export async function getTutorAttempts(quizId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<{ items: TutorAttempt[] } | TutorAttempt[]>(`/quizzes/${quizId}/attempts`, { signal });
  return Array.isArray(response.data) ? response.data : response.data.items;
}
