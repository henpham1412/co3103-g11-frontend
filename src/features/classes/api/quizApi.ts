import { lmsClient } from "../../../api/lmsClient";
import type {
  AssessmentHistoryResponse,
  QuizAttempt,
  QuizSettings,
  QuizSubmitResult,
} from "../quiz-types";

export async function getQuizSettings(activityId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<QuizSettings>(`/activities/${activityId}/quiz`, { signal });
  return response.data;
}

export async function startOrResumeQuiz(quizId: string) {
  const response = await lmsClient.post<QuizAttempt>(`/quizzes/${quizId}/attempts`);
  return response.data;
}

export async function getQuizAttempt(attemptId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<QuizAttempt>(`/quiz-attempts/${attemptId}`, { signal });
  return response.data;
}

export async function saveQuizAnswer(
  attemptId: string,
  questionId: string,
  selectedOptionIds: string[],
) {
  await lmsClient.put(`/quiz-attempts/${attemptId}/answers/${questionId}`, {
    selected_option_ids: selectedOptionIds,
  });
}

export async function clearQuizAnswer(attemptId: string, questionId: string) {
  await lmsClient.delete(`/quiz-attempts/${attemptId}/answers/${questionId}`);
}

export async function submitQuizAttempt(attemptId: string) {
  const response = await lmsClient.post<QuizSubmitResult>(`/quiz-attempts/${attemptId}/submit`);
  return response.data;
}

export async function getAssessmentHistory(signal?: AbortSignal) {
  const response = await lmsClient.get<AssessmentHistoryResponse>("/me/assessment-history", { signal });
  return response.data;
}
