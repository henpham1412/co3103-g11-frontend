import type { EnrollmentPolicy, MembershipStatus } from "../classes/types";

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
