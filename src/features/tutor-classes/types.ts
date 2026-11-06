import type { ContentVisibility, EnrollmentPolicy, MaterialKind, MembershipStatus } from "../classes/types";

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
