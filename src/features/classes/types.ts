export type EnrollmentPolicy = "OPEN" | "APPROVAL_REQUIRED";

export interface ClassCatalogItem {
  class_id: string;
  class_code: string;
  title: string;
  description: string | null;
  prerequisites_description: string | null;
  thumbnail_url: string | null;
  enrollment_policy: EnrollmentPolicy;
  status: string;
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