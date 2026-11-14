import type { ClassOutlineActivity, ContentVisibility, EnrollmentPolicy, MaterialKind, MembershipStatus } from "../classes/types";

export interface TutorClass {
  class_id: string;
  tutor_id: string;
  class_code: string;
  title: string;
  description: string | null;
  prerequisites_description: string | null;
  max_capacity: number | null;
  enrollment_policy: EnrollmentPolicy;
  status: "ACTIVE" | "ARCHIVED";
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TutorClassPage {
  items: TutorClass[];
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
}

export interface TutorMember {
  class_member_id: string;
  class_id: string;
  student_id: string;
  // Absent on the current ClassMemberResponse. When LMS adds them, use the same
  // names as the class-detail tutor object and lms_user_access: full_name, email.
  full_name?: string | null;
  email?: string | null;
  status: MembershipStatus;
  requested_at: string | null;
  joined_at: string | null;
}

export interface TutorMemberPage {
  items: TutorMember[];
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
}

export interface CreateTutorClass {
  title: string;
  class_code: string;
  description?: string;
  prerequisites_description?: string;
  max_capacity?: number | null;
  enrollment_policy: EnrollmentPolicy;
}

export type { ContentVisibility, MaterialKind };

export interface TutorOutline {
  class_id: string;
  chapters: TutorChapter[];
}

export interface TutorChapter {
  chapter_id: string;
  class_id?: string;
  title: string;
  description: string | null;
  sequence_order: number;
  status: ContentVisibility;
  created_at?: string;
  lessons: TutorLesson[];
}

export interface TutorLesson {
  lesson_id: string;
  chapter_id?: string;
  title: string;
  description: string | null;
  estimated_duration: number | null;
  sequence_order: number;
  status: ContentVisibility;
  materials: TutorMaterial[];
  activities?: ClassOutlineActivity[];
}

export interface TutorMaterial {
  material_id: string;
  lesson_id?: string;
  title: string;
  material_type: MaterialKind;
  file_url: string | null;
  content: string | null;
  sequence_order: number;
  status: ContentVisibility;
}

export interface TutorProgressMember {
  class_member_id: string;
  student_id: string;
  student_name: string | null;
  completed_lessons: number;
  eligible_lessons: number;
  progress_percentage: number;
  status: import("../classes/types").LearningProgressStatus;
}
export interface TutorProgressResponse { class_id: string; members: TutorProgressMember[] }
export type MasteryLevel = "WEAK" | "DEVELOPING" | "SUFFICIENT";
export interface TutorMemberProgressResponse {
  class_id: string;
  class_member_id: string;
  student_id: string;
  membership_status: "ACTIVE";
  completed_lessons: number;
  eligible_lessons: number;
  progress_percentage: number;
  status: import("../classes/types").LearningProgressStatus;
  chapters: import("../classes/types").ProgressChapter[];
  assessment_outcomes: import("../classes/quiz-types").AssessmentHistoryItem[];
  skill_mastery: { skill_topic_id: string; name: string; level: MasteryLevel | null }[];
}
