export type QuizQuestionType = "MCQ_SINGLE" | "MCQ_MULTIPLE" | "TRUE_FALSE";
export type QuizAttemptStatus = "IN_PROGRESS" | "SUBMITTED";

export interface QuizOption {
  option_id: string;
  content: string;
}

export interface QuizQuestion {
  question_id: string;
  question_type: QuizQuestionType;
  content: string;
  points_awarded: number;
  order_index: number;
  options: QuizOption[];
  selected_option_ids?: string[];
}

export interface QuizSettings {
  quiz_id: string;
  activity_id: string;
  time_limit_minutes: number;
  attempts_allowed: number;
  grading_method: "HIGHEST" | "AVERAGE" | "LAST";
  opening_time: string | null;
  deadline: string;
  required_score: number | null;
  title?: string;
  description?: string | null;
  attempts_used?: number;
  current_score?: number | null;
  current_attempt?: QuizAttempt | null;
  attempts?: QuizAttemptSummary[];
}

export interface QuizAttemptSummary {
  attempt_id: string;
  attempt_number: number;
  status: QuizAttemptStatus;
  score: number | null;
  submitted_at: string | null;
  started_at: string;
  auto_submitted: boolean;
  passed: boolean | null;
}

export interface QuizAttempt {
  attempt_id: string;
  quiz_id: string;
  attempt_number: number;
  status: QuizAttemptStatus;
  started_at: string;
  end_at: string;
  remaining_seconds: number;
  questions: QuizQuestion[];
  score?: number | null;
  required_score?: number | null;
  passed?: boolean | null;
  submitted_at?: string | null;
  auto_submitted?: boolean;
}

export interface QuizSubmitResult {
  attempt_id: string;
  status: "SUBMITTED";
  auto_submitted: boolean;
  score: number;
  required_score: number | null;
  passed: boolean | null;
  submitted_at: string;
}

export interface AssessmentHistoryItem {
  attempt_id: string;
  class_id: string;
  activity_id: string;
  activity_title: string;
  attempt_number: number;
  type: "QUIZ" | "ASSIGNMENT";
  status: QuizAttemptStatus;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  feedback: string | null;
}

export interface AssessmentHistoryResponse {
  items: AssessmentHistoryItem[];
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
}
