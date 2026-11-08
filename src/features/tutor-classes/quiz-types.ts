import type { QuizQuestionType } from "../../features/classes/quiz-types";

export interface TutorOption {
  option_id: string;
  content: string;
  is_correct: boolean;
  order_index: number;
}

export interface TutorQuestion {
  question_id: string;
  question_type: QuizQuestionType;
  content: string;
  points_awarded: number;
  points_deducted: number;
  order_index: number;
  options: TutorOption[];
}

export interface TutorQuizDetails {
  quiz_id: string;
  activity_id: string;
  title?: string;
  description?: string | null;
  status?: "PUBLISHED" | "HIDDEN";
  time_limit_minutes: number;
  attempts_allowed: number;
  grading_method: "HIGHEST" | "AVERAGE" | "LAST";
  opening_time: string | null;
  deadline: string;
  required_score: number | null;
  questions: TutorQuestion[];
  sequence_order?: number;
  attempts_exist?: boolean;
}

export interface TutorAttempt {
  attempt_id: string;
  student_name?: string;
  student_id?: string;
  status: "IN_PROGRESS" | "SUBMITTED";
  attempt_number: number;
  started_at: string;
  submitted_at?: string | null;
  score?: number | null;
  passed?: boolean | null;
  auto_submitted: boolean;
}
