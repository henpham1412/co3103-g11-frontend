import { validUser } from '@/test/fixtures/auth'
import type { AdminContentReport, AdminUser, AuditLog, ModerationTarget } from '@/features/admin/types'

export const USER_ID = validUser.userId
export const REPORT_ID = '20000000-0000-0000-0000-000000000001'
export const CONTENT_ID = '30000000-0000-0000-0000-000000000001'
export const CLASS_ID = '40000000-0000-0000-0000-000000000001'
export const LOG_ID = '50000000-0000-0000-0000-000000000001'
export const OTHER_ID = '60000000-0000-0000-0000-000000000001'
export const timestamp = '2026-11-23T03:00:00.123456Z'
export function adminUser(patch: Partial<AdminUser> = {}): AdminUser {
  return { user_id: USER_ID, full_name: 'Local administrator', email: 'admin@example.test',
    lms_role: 'ADMINISTRATOR', access_status: 'ACTIVE', last_login_at: null,
    created_at: timestamp, updated_at: timestamp, ...patch }
}
export function contentReport(patch: Partial<AdminContentReport> = {}): AdminContentReport {
  return { report_id: REPORT_ID, reporter_id: USER_ID, content_id: CONTENT_ID, content_type: 'DISCUSSION',
    reason: 'SPAM', description: null, status: 'PENDING', reviewed_by: null, reviewed_at: null,
    created_at: timestamp, target_available: true, ...patch }
}
export function moderationTarget(patch: Partial<ModerationTarget> = {}): ModerationTarget {
  return { content_id: CONTENT_ID, class_id: CLASS_ID, lesson_id: null, author_id: USER_ID,
    parent_id: null, title: null, content: 'Reported reply', material_type: null, visibility: null,
    class_status: 'ARCHIVED', file_url: null, file_available: null, ...patch }
}
export function auditLog(patch: Partial<AuditLog> = {}): AuditLog {
  return { audit_log_id: LOG_ID, actor_id: USER_ID, action: 'LMS_USER_ACCESS_UPDATED', entity_type: 'LmsUserAccess',
    entity_id: OTHER_ID, details: { before: { lms_role: 'STUDENT', access_status: 'ACTIVE' },
      after: { lms_role: 'TUTOR', access_status: 'ACTIVE' } }, created_at: timestamp, ...patch }
}
export function page<T>(items: T[]) {
  return { items, page: 1, size: 20, total_items: items.length, total_pages: items.length ? 1 : 0 }
}
export const operationalData = {
  enrollment: { active_members: 0, pending_requests: 0, inactive_members: 0, rejected_requests: 0,
    total_memberships: 0, total_classes: 1, active_classes: 0, archived_classes: 1 },
  completion: { active_members: 0, eligible_lessons: 2, completed_lesson_marks: 0,
    completed_memberships: 0, in_progress_memberships: 0, completion_rate: 0, average_progress_percentage: 0 },
  assessment: { total_quiz_attempts: 2, in_progress_quiz_attempts: 1, submitted_quiz_attempts: 1,
    graded_quiz_attempts: 1, average_quiz_attempt_score: 0, total_assignment_submissions: 0,
    ungraded_assignment_submissions: 0, graded_assignment_submissions: 0, late_assignment_submissions: 0,
    average_assignment_submission_score: null, average_assessment_score: 0 },
}
