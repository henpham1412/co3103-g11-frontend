export type EnrollmentPolicy = "OPEN" | "APPROVAL_REQUIRED";
export type MembershipStatus = "PENDING" | "ACTIVE" | "REJECTED" | "INACTIVE";

export interface ClassCatalogItem {
  class_id: string;
  class_code: string;
  title: string;
  description: string | null;
  prerequisites_description: string | null;
  thumbnail_url: string | null;
  enrollment_policy: EnrollmentPolicy;
  status: "ACTIVE" | "ARCHIVED";
  tutor: {
    user_id: string;
    full_name: string;
  };
  active_member_count: number;
  max_capacity: number | null;
}

export interface ClassCatalogResponse {
  items: ClassCatalogItem[];
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
}

export interface MembershipActionResponse {
  class_member_id: string;
  class_id: string;
  status: MembershipStatus;
  requested_at?: string;
  joined_at?: string;
}

export interface CurrentMembership {
  class_id: string;
  status: MembershipStatus;
}

// /me/classes returns class summaries, not the membership mutation response.
// Only ACTIVE and PENDING memberships are included by this endpoint.
export interface CurrentMembershipPage {
  items: { class_id: string; membership_status: "ACTIVE" | "PENDING" }[];
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
}
export interface ClassOutlineResponse {
  class_id: string;
  chapters: ClassOutlineChapter[];
}

export interface ClassOutlineChapter {
  chapter_id: string;
  title: string;
  description?: string | null;
  sequence_order: number;
  status: ContentVisibility;
  lessons: ClassOutlineLesson[];
}

export type ContentVisibility = "PUBLISHED" | "HIDDEN";

export type ActivityType = "QUIZ" | "ASSIGNMENT";

export interface ClassOutlineActivity {
  activity_id: string;
  title: string;
  description?: string | null;
  activity_type: ActivityType;
  sequence_order: number;
  status?: ContentVisibility;
}

export type MaterialKind = "DOCUMENT" | "VIDEO" | "TEXT" | "URL";

export interface ClassOutlineMaterial {
  material_id: string;
  title: string;
  material_type: MaterialKind;
  file_url: string | null;
  content: string | null;
  sequence_order: number;
  status: ContentVisibility;
}

export interface ClassOutlineLesson {
  lesson_id: string;
  title: string;
  description?: string | null;
  sequence_order: number;
  status?: ContentVisibility;
  estimated_duration?: number | null;
  materials?: ClassOutlineMaterial[];
  activities?: ClassOutlineActivity[];
}

export type LearningProgressStatus = "IN_PROGRESS" | "COMPLETED";
export interface ProgressAttempt {
  attempt_id: string;
  attempt_number: number;
  status: "IN_PROGRESS" | "SUBMITTED";
  started_at: string;
  submitted_at: string | null;
  score: number | null;
}
export interface AssessmentStatus {
  activity_id: string;
  title: string;
  activity_type: ActivityType;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
  attempts: ProgressAttempt[];
}
export interface ProgressLesson {
  lesson_id: string;
  title: string;
  sequence_order: number;
  completed: boolean;
  marked_at: string | null;
  assessment_statuses: AssessmentStatus[];
}
export interface ProgressChapter {
  chapter_id: string;
  title: string;
  completed_lessons: number;
  eligible_lessons: number;
  progress_percentage: number;
  lessons: ProgressLesson[];
}
export interface ResumeTarget {
  target_type: "LESSON" | "QUIZ_ATTEMPT" | "CLASS_OUTLINE";
  target_id: string;
  reason: string;
}
export interface ClassProgressResponse {
  class_id: string;
  completed_lessons: number;
  eligible_lessons: number;
  progress_percentage: number;
  status: LearningProgressStatus;
  chapters: ProgressChapter[];
  resume_target: ResumeTarget;
}
