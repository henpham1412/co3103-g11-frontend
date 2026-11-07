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
export interface ClassOutlineResponse {
  class_id: string;
  chapters: ClassOutlineChapter[];
}

export interface ClassOutlineChapter {
  chapter_id: string;
  title: string;
  sequence_order: number;
  lessons: ClassOutlineLesson[];
}

export type ActivityType = "QUIZ" | "ASSIGNMENT";

export interface ClassOutlineActivity {
  activity_id: string;
  title: string;
  description?: string | null;
  activity_type: ActivityType;
  sequence_order: number;
}

export interface ClassOutlineLesson {
  lesson_id: string;
  title: string;
  sequence_order: number;
  estimated_duration?: number | null;
  activities?: ClassOutlineActivity[];
}
