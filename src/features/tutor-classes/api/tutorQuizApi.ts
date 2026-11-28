import { ApiError } from "@/api/apiError";
import { lmsClient } from "../../../api/lmsClient";
import { getTutorActivity, type TutorActivityMetadata } from "./tutorAssignmentApi";
import type {
  TutorAttempt,
  TutorQuestion,
  TutorQuestionCreatePayload,
  TutorQuestionUpdatePayload,
  TutorQuizDetails,
} from "../quiz-types";

interface TutorQuizConfigurationResponse {
  quiz_id: string;
  activity_id?: string;
  time_limit_minutes: number;
  attempts_allowed: number;
  grading_method: "HIGHEST" | "AVERAGE" | "LAST";
  opening_time: string | null;
  deadline: string;
  required_score: number | null;
  questions?: TutorQuestion[];
}

export async function getTutorQuiz(activityId: string, signal?: AbortSignal): Promise<TutorQuizDetails> {
  const [activity, quizResponse] = await Promise.all([
    getTutorActivity(activityId, signal),
    lmsClient.get<TutorQuizConfigurationResponse>(`/activities/${activityId}/quiz`, { signal }),
  ]);
  const quizConfig = quizResponse.data;
  if (!Array.isArray(quizConfig.questions)) {
    throw new ApiError({
      status: 502,
      error: "Bad Gateway",
      code: "INVALID_QUIZ_RESPONSE",
      message: "Quiz details response did not include the question list.",
      timestamp: new Date().toISOString(),
      path: `/activities/${activityId}/quiz`,
    });
  }
  return {
    quiz_id: quizConfig.quiz_id,
    activity_id: quizConfig.activity_id ?? activity.activity_id,
    title: activity.title,
    description: activity.description,
    sequence_order: activity.sequence_order,
    status: activity.status,
    time_limit_minutes: quizConfig.time_limit_minutes,
    attempts_allowed: quizConfig.attempts_allowed,
    grading_method: quizConfig.grading_method,
    opening_time: quizConfig.opening_time,
    deadline: quizConfig.deadline,
    required_score: quizConfig.required_score,
    questions: quizConfig.questions,
  };
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
      questions?: TutorQuestionCreatePayload[];
    };
  },
) {
  const response = await lmsClient.post<TutorActivityMetadata>(`/lessons/${lessonId}/activities`, {
    activity_type: "QUIZ",
    ...payload,
  });
  return response.data;
}

export async function updateTutorQuizSettings(
  activityId: string,
  payload: Partial<Pick<TutorQuizDetails, "time_limit_minutes" | "attempts_allowed" | "grading_method" | "opening_time" | "deadline" | "required_score">>,
) {
  await lmsClient.patch(`/activities/${activityId}/quiz`, payload);
}

export async function updateTutorQuizActivity(
  activityId: string,
  payload: { title?: string; description?: string; sequence_order?: number; status?: "PUBLISHED" | "HIDDEN" },
) {
  await lmsClient.patch(`/activities/${activityId}`, payload);
}

export async function createTutorQuestion(activityId: string, payload: TutorQuestionCreatePayload) {
  const sanitizedPayload: TutorQuestionCreatePayload = {
    question_type: payload.question_type,
    content: payload.content,
    points_awarded: payload.points_awarded,
    points_deducted: payload.points_deducted,
    order_index: payload.order_index,
    options: payload.options.map((option) => ({
      content: option.content,
      is_correct: option.is_correct,
      order_index: option.order_index,
    })),
    ...(payload.skill_topic_ids ? { skill_topic_ids: payload.skill_topic_ids } : {}),
  };
  const response = await lmsClient.post<TutorQuestion>(`/activities/${activityId}/questions`, sanitizedPayload);
  return response.data;
}

export async function updateTutorQuestion(questionId: string, payload: TutorQuestionUpdatePayload) {
  const sanitizedPayload: TutorQuestionUpdatePayload = {
    ...payload,
    ...(payload.options
      ? {
          options: payload.options.map((option) => ({
            ...(option.option_id ? { option_id: option.option_id } : {}),
            content: option.content,
            is_correct: option.is_correct,
            order_index: option.order_index,
          })),
        }
      : {}),
  };
  const response = await lmsClient.patch<TutorQuestion>(`/questions/${questionId}`, sanitizedPayload);
  return response.data;
}

export async function deleteTutorQuestion(questionId: string) {
  await lmsClient.delete(`/questions/${questionId}`);
}

export async function getTutorAttempts(quizId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<{ items: TutorAttempt[] } | TutorAttempt[]>(`/quizzes/${quizId}/attempts`, { signal });
  return Array.isArray(response.data) ? response.data : response.data.items;
}
