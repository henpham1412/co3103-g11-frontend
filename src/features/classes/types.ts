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
  completed_lessons?: number;
  eligible_lessons?: number;
  progress_percentage?: number;
  progress_status?: LearningProgressStatus;
  resume_target?: ResumeTarget;
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
  completed_lessons?: number;
  eligible_lessons?: number;
  progress_percentage?: number;
  progress_status?: LearningProgressStatus;
  resume_target?: ResumeTarget;
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
export type ResumeTargetType = "LESSON" | "QUIZ_ATTEMPT" | "CLASS_OUTLINE";

export interface ProgressActivity extends ClassOutlineActivity {
  outcome?: string | null;
  score?: number | null;
}

export interface ProgressLesson extends ClassOutlineLesson {
  completed: boolean;
  completed_at?: string | null;
  activities?: ProgressActivity[];
}

export interface ProgressChapter {
  chapter_id: string;
  title: string;
  sequence_order: number;
  completed_lessons: number;
  eligible_lessons: number;
  lessons: ProgressLesson[];
}

export interface ClassProgressResponse {
  class_id: string;
  completed_lessons: number;
  eligible_lessons: number;
  progress_percentage: number;
  status: LearningProgressStatus;
  chapters: ProgressChapter[];
  resume_target?: ResumeTarget;
}

export interface ResumeTarget {
  target_type: ResumeTargetType;
  target_id: string;
  activity_id?: string;
  lesson_id?: string;
  reason?: string;
}
