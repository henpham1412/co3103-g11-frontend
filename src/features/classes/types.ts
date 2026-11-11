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
