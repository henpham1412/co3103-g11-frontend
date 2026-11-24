import type { LmsRole } from '@/types/auth'

export type LocalAccessStatus = 'ACTIVE' | 'SUSPENDED'
export interface AdminUser {
  user_id: string
  lms_role: LmsRole
  access_status: LocalAccessStatus
  full_name: string
  email: string
  last_login_at: string | null
  created_at: string
  updated_at: string
}
export interface AdminPage<T> {
  items: T[]
  page: number
  size: number
  total_items: number
  total_pages: number
}
export interface AdminUserPage extends AdminPage<AdminUser> { last: boolean }
export interface UserAccessPatch { lms_role?: LmsRole; access_status?: LocalAccessStatus }
export type UserSortField = 'user_id' | 'full_name' | 'email' | 'lms_role' | 'access_status'
  | 'last_login_at' | 'created_at' | 'updated_at'
export interface UserListQuery {
  q?: string
  lms_role?: LmsRole
  access_status?: LocalAccessStatus
  page?: number
  size?: number
  sort?: `${UserSortField},${'asc' | 'desc'}`
}

export type ReportStatus = 'PENDING' | 'REVIEWED' | 'RESOLVED' | 'DISMISSED'
export type ReviewOutcome = Exclude<ReportStatus, 'PENDING'>
export type ContentType = 'DISCUSSION' | 'MATERIAL'
export interface ModerationTarget {
  content_id: string
  class_id: string | null
  lesson_id: string | null
  author_id: string | null
  parent_id: string | null
  title: string | null
  content: string | null
  material_type: 'DOCUMENT' | 'VIDEO' | 'TEXT' | 'URL' | null
  visibility: 'PUBLISHED' | 'HIDDEN' | null
  class_status: 'ACTIVE' | 'ARCHIVED' | null
  file_url: string | null
  file_available: boolean | null
}
export interface AdminContentReport {
  report_id: string
  reporter_id: string
  content_type: ContentType
  content_id: string
  reason: 'SPAM' | 'HARASSMENT' | 'INAPPROPRIATE' | 'OTHER'
  description: string | null
  status: ReportStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  target_available: boolean
  target?: ModerationTarget
}
export interface ContentReportQuery {
  status?: ReportStatus
  content_type?: ContentType
  page?: number
  size?: number
}

export interface EnrollmentReport {
  active_members: number
  pending_requests: number
  inactive_members: number
  rejected_requests: number
  total_memberships: number
  total_classes: number
  active_classes: number
  archived_classes: number
}
export interface CompletionReport {
  active_members: number
  eligible_lessons: number
  completed_lesson_marks: number
  completed_memberships: number
  in_progress_memberships: number
  completion_rate: number
  average_progress_percentage: number
}
export interface AssessmentReport {
  total_quiz_attempts: number
  in_progress_quiz_attempts: number
  submitted_quiz_attempts: number
  graded_quiz_attempts: number
  average_quiz_attempt_score: number | null
  total_assignment_submissions: number
  ungraded_assignment_submissions: number
  graded_assignment_submissions: number
  late_assignment_submissions: number
  average_assignment_submission_score: number | null
  average_assessment_score: number | null
}
export interface OperationalReportData {
  enrollment: EnrollmentReport
  completion: CompletionReport
  assessment: AssessmentReport
}
export type ReportType = keyof OperationalReportData
export interface OperationalReport<K extends ReportType> {
  report_type: K
  filters: { class_id?: string }
  message?: string
  data: OperationalReportData[K]
}

export type AuditDetails = { unavailable: true }
  | { before: Required<UserAccessPatch>; after: Required<UserAccessPatch> }
  | { before: { status: ReportStatus }; after: { status: ReportStatus } }
export interface AuditLog {
  audit_log_id: string
  actor_id: string
  action: string
  entity_type: string
  entity_id: string
  details: AuditDetails
  created_at: string
}
export interface AuditLogQuery {
  actor_id?: string
  action?: string
  entity_type?: string
  from?: string
  to?: string
  page?: number
  size?: number
}
