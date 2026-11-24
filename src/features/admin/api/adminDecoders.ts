import { ApiError } from '@/api/apiError'
import { isNonEmptyString, isRecord } from '@/utils/typeGuards'
import type {
  AdminContentReport, AdminPage, AdminUser, AdminUserPage, AuditLog, ModerationTarget,
  OperationalReport, ReportType,
} from '../types'

const ROLES = ['STUDENT', 'TUTOR', 'ADMINISTRATOR'] as const
const ACCESS = ['ACTIVE', 'SUSPENDED'] as const
const STATUSES = ['PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED'] as const
export const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const isTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value))
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const nullable = (value: unknown, guard: (input: unknown) => boolean) => value === null || guard(value)
const member = <T extends string>(value: unknown, values: readonly T[]): value is T => values.includes(value as T)

export function invalidAdminResponse(endpoint: string): never {
  throw new ApiError({ status: 502, code: 'INVALID_ADMIN_RESPONSE', error: 'Invalid Response',
    message: 'The LMS returned an invalid administrator response.', timestamp: new Date().toISOString(), path: endpoint })
}

export function decodeAdminUser(raw: unknown, endpoint: string, expectedId?: string): AdminUser {
  if (!isRecord(raw) || !isUuid(raw.user_id) || (expectedId && raw.user_id.toLowerCase() !== expectedId.toLowerCase())
    || !member(raw.lms_role, ROLES) || !member(raw.access_status, ACCESS)
    || !isNonEmptyString(raw.full_name) || !isNonEmptyString(raw.email)
    || !nullable(raw.last_login_at, isTimestamp) || !isTimestamp(raw.created_at) || !isTimestamp(raw.updated_at)) {
    return invalidAdminResponse(endpoint)
  }
  return { user_id: raw.user_id, lms_role: raw.lms_role, access_status: raw.access_status,
    full_name: raw.full_name, email: raw.email, last_login_at: raw.last_login_at as string | null,
    created_at: raw.created_at, updated_at: raw.updated_at }
}

export function decodeAdminPage<T>(raw: unknown, endpoint: string, decode: (raw: unknown, endpoint: string) => T,
  maxSize: number): AdminPage<T> {
  if (!isRecord(raw) || !Array.isArray(raw.items) || !isCount(raw.page) || raw.page < 1
    || !isCount(raw.size) || raw.size < 1 || raw.size > maxSize
    || !isCount(raw.total_items) || !isCount(raw.total_pages) || raw.items.length > raw.size
    || raw.total_pages !== Math.ceil(raw.total_items / raw.size)) return invalidAdminResponse(endpoint)
  return { items: raw.items.map(item => decode(item, endpoint)), page: raw.page, size: raw.size,
    total_items: raw.total_items, total_pages: raw.total_pages }
}

export function decodeAdminUserPage(raw: unknown, endpoint: string): AdminUserPage {
  const page = decodeAdminPage(raw, endpoint, decodeAdminUser, 2000)
  if (!isRecord(raw) || typeof raw.last !== 'boolean' || raw.last !== (page.page >= page.total_pages)) {
    return invalidAdminResponse(endpoint)
  }
  return { ...page, last: raw.last }
}

function decodeTarget(raw: unknown, endpoint: string, contentId: string): ModerationTarget {
  if (!isRecord(raw) || raw.content_id !== contentId || !nullable(raw.class_id, isUuid)
    || !nullable(raw.lesson_id, isUuid) || !nullable(raw.author_id, isUuid) || !nullable(raw.parent_id, isUuid)
    || !nullable(raw.title, isString) || !nullable(raw.content, isString)
    || !nullable(raw.material_type, v => member(v, ['DOCUMENT', 'VIDEO', 'TEXT', 'URL']))
    || !nullable(raw.visibility, v => member(v, ['PUBLISHED', 'HIDDEN']))
    || !nullable(raw.class_status, v => member(v, ['ACTIVE', 'ARCHIVED']))
    || !nullable(raw.file_url, isString) || !nullable(raw.file_available, v => typeof v === 'boolean')) {
    return invalidAdminResponse(endpoint)
  }
  return { content_id: contentId, class_id: raw.class_id, lesson_id: raw.lesson_id, author_id: raw.author_id,
    parent_id: raw.parent_id, title: raw.title, content: raw.content, material_type: raw.material_type,
    visibility: raw.visibility, class_status: raw.class_status, file_url: raw.file_url,
    file_available: raw.file_available } as ModerationTarget
}

export function decodeContentReport(raw: unknown, endpoint: string, expectedId?: string): AdminContentReport {
  if (!isRecord(raw) || !isUuid(raw.report_id) || (expectedId && raw.report_id.toLowerCase() !== expectedId.toLowerCase())
    || !isUuid(raw.reporter_id) || !isUuid(raw.content_id) || !member(raw.content_type, ['DISCUSSION', 'MATERIAL'])
    || !member(raw.reason, ['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'OTHER'])
    || !nullable(raw.description, isString) || !member(raw.status, STATUSES)
    || !nullable(raw.reviewed_by, isUuid) || !nullable(raw.reviewed_at, isTimestamp)
    || !isTimestamp(raw.created_at) || typeof raw.target_available !== 'boolean'
    || (raw.target != null && !raw.target_available)) return invalidAdminResponse(endpoint)
  return { report_id: raw.report_id, reporter_id: raw.reporter_id, content_id: raw.content_id,
    content_type: raw.content_type, reason: raw.reason, description: raw.description as string | null,
    status: raw.status, reviewed_by: raw.reviewed_by as string | null, reviewed_at: raw.reviewed_at as string | null,
    created_at: raw.created_at, target_available: raw.target_available,
    ...(raw.target == null ? {} : { target: decodeTarget(raw.target, endpoint, raw.content_id) }) }
}

const REPORT_COUNTS = {
  enrollment: ['active_members', 'pending_requests', 'inactive_members', 'rejected_requests',
    'total_memberships', 'total_classes', 'active_classes', 'archived_classes'],
  completion: ['active_members', 'eligible_lessons', 'completed_lesson_marks', 'completed_memberships', 'in_progress_memberships'],
  assessment: ['total_quiz_attempts', 'in_progress_quiz_attempts', 'submitted_quiz_attempts', 'graded_quiz_attempts',
    'total_assignment_submissions', 'ungraded_assignment_submissions', 'graded_assignment_submissions', 'late_assignment_submissions'],
} as const
const REPORT_DECIMALS = {
  enrollment: [], completion: ['completion_rate', 'average_progress_percentage'],
  assessment: ['average_quiz_attempt_score', 'average_assignment_submission_score', 'average_assessment_score'],
} as const

export function decodeOperationalReport<K extends ReportType>(raw: unknown, endpoint: string, type: K,
  classId?: string): OperationalReport<K> {
  if (!isRecord(raw) || raw.report_type !== type || !isRecord(raw.filters) || !isRecord(raw.data)
    || (classId ? !isUuid(raw.filters.class_id) || raw.filters.class_id.toLowerCase() !== classId.toLowerCase()
      : Object.keys(raw.filters).length !== 0)
    || (raw.message !== undefined && !isNonEmptyString(raw.message))) return invalidAdminResponse(endpoint)
  const data: Record<string, number | null> = {}
  for (const field of REPORT_COUNTS[type]) {
    if (!isCount(raw.data[field])) return invalidAdminResponse(endpoint)
    data[field] = raw.data[field]
  }
  for (const field of REPORT_DECIMALS[type]) {
    const value = raw.data[field]
    if (!(type === 'assessment' ? nullable(value, isNumber) : isNumber(value))) return invalidAdminResponse(endpoint)
    data[field] = value as number | null
  }
  return { report_type: type, filters: classId ? { class_id: raw.filters.class_id as string } : {},
    // Field lists above validate the complete DTO selected by K before this generic projection.
    ...(raw.message === undefined ? {} : { message: raw.message as string }), data } as unknown as OperationalReport<K>
}

export function decodeAuditLog(raw: unknown, endpoint: string, expectedId?: string): AuditLog {
  if (!isRecord(raw) || !isUuid(raw.audit_log_id)
    || (expectedId && raw.audit_log_id.toLowerCase() !== expectedId.toLowerCase())
    || !isUuid(raw.actor_id) || !isUuid(raw.entity_id) || !isNonEmptyString(raw.action)
    || !isNonEmptyString(raw.entity_type) || !isTimestamp(raw.created_at) || !isRecord(raw.details)) {
    return invalidAdminResponse(endpoint)
  }
  const details = raw.details
  const snapshot = (value: unknown) => isRecord(value) && Object.keys(value).length === 2
    && member(value.lms_role, ROLES) && member(value.access_status, ACCESS)
  const statusSnapshot = (value: unknown) => isRecord(value) && Object.keys(value).length === 1 && member(value.status, STATUSES)
  const valid = details.unavailable === true && Object.keys(details).length === 1
    || Object.keys(details).length === 2 && (raw.action === 'LMS_USER_ACCESS_UPDATED'
      ? snapshot(details.before) && snapshot(details.after)
      : raw.action === 'REPORTED_CONTENT_REVIEWED' && statusSnapshot(details.before) && statusSnapshot(details.after))
  if (!valid) return invalidAdminResponse(endpoint)
  return { audit_log_id: raw.audit_log_id, actor_id: raw.actor_id, action: raw.action, entity_type: raw.entity_type,
    entity_id: raw.entity_id, details: details as unknown as AuditLog['details'], created_at: raw.created_at }
}
