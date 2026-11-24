import { ApiError } from '@/api/apiError'
import { lmsClient } from '@/api/lmsClient'
import type { InternalAxiosRequestConfig } from 'axios'
import type { AuditLogQuery, ContentReportQuery, ReportType, ReviewOutcome, UserAccessPatch, UserListQuery } from '../types'
import { decodeAdminPage, decodeAdminUser, decodeAdminUserPage, decodeAuditLog, decodeContentReport,
  decodeOperationalReport, isUuid } from './adminDecoders'

function idPath(id: string): string {
  if (!isUuid(id)) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', error: 'Bad Request',
    message: 'Enter a valid UUID.', timestamp: new Date().toISOString(), path: '/admin' })
  return encodeURIComponent(id)
}

export async function getAdminUser(userId: string, signal?: AbortSignal, capabilityProbe = false) {
  const endpoint = `/admin/users/${idPath(userId)}`
  const { data } = await lmsClient.get<unknown>(endpoint, { signal, suppressLmsForbiddenMessage: capabilityProbe })
  return decodeAdminUser(data, endpoint, userId)
}

export async function listAdminUsers(query: UserListQuery = {}, signal?: AbortSignal) {
  const { q, lms_role, access_status, page, size, sort } = query
  const endpoint = '/admin/users'
  const { data } = await lmsClient.get<unknown>(endpoint, { params: { q, lms_role, access_status, page, size, sort }, signal })
  return decodeAdminUserPage(data, endpoint)
}

export async function updateAdminUserAccess(userId: string, patch: UserAccessPatch, signal?: AbortSignal) {
  const endpoint = `/admin/users/${idPath(userId)}`
  const { data } = await lmsClient.patch<unknown>(endpoint, {
    ...(patch.lms_role === undefined ? {} : { lms_role: patch.lms_role }),
    ...(patch.access_status === undefined ? {} : { access_status: patch.access_status }),
  }, { signal })
  return decodeAdminUser(data, endpoint, userId)
}

export async function listAdminContentReports(query: ContentReportQuery = {}, signal?: AbortSignal) {
  const { status, content_type, page, size } = query
  const endpoint = '/admin/content-reports'
  const { data } = await lmsClient.get<unknown>(endpoint, { params: { status, content_type, page, size }, signal })
  return decodeAdminPage(data, endpoint, decodeContentReport, 100)
}

export async function getAdminContentReport(reportId: string, signal?: AbortSignal) {
  const endpoint = `/admin/content-reports/${idPath(reportId)}`
  const { data } = await lmsClient.get<unknown>(endpoint, { signal })
  return decodeContentReport(data, endpoint, reportId)
}

export async function reviewAdminContentReport(reportId: string, status: ReviewOutcome, signal?: AbortSignal) {
  const endpoint = `/admin/content-reports/${idPath(reportId)}`
  const { data } = await lmsClient.patch<unknown>(endpoint, { status }, { signal })
  return decodeContentReport(data, endpoint, reportId)
}

export async function downloadAdminReportTarget(reportId: string, signal?: AbortSignal) {
  // Construct the report-scoped URL; never send credentials to a target-supplied file_url.
  const endpoint = `/admin/content-reports/${idPath(reportId)}/target/file`
  const response = await lmsClient.get<Blob>(endpoint, { responseType: 'blob', signal })
  const disposition = response.headers['content-disposition'] as string | undefined
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  let filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? 'reported-material'
  if (encoded) {
    try { filename = decodeURIComponent(encoded) } catch { /* Keep a usable fallback for malformed headers. */ }
  }
  filename = Array.from(filename.split(/[/\\]/).pop() ?? '')
    .filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('') || 'reported-material'
  return { blob: response.data, filename }
}

export async function getAdminOperationalReport<K extends ReportType>(type: K, classId?: string, signal?: AbortSignal) {
  const endpoint = `/admin/reports/${type}`
  const { data } = await lmsClient.get<unknown>(endpoint, { params: classId ? { class_id: idPath(classId) } : {}, signal })
  return decodeOperationalReport(data, endpoint, type, classId)
}

export async function listAdminAuditLogs(query: AuditLogQuery = {}, signal?: AbortSignal) {
  const { actor_id, action, entity_type, from, to, page, size } = query
  const endpoint = '/admin/audit-logs'
  const { data } = await lmsClient.get<unknown>(endpoint, {
    params: { actor_id, action, entity_type, from, to, page, size }, signal,
  })
  return decodeAdminPage(data, endpoint, decodeAuditLog, 100)
}

export async function getAdminAuditLog(logId: string, signal?: AbortSignal) {
  const endpoint = `/admin/audit-logs/${idPath(logId)}`
  const { data } = await lmsClient.get<unknown>(endpoint, { signal })
  return decodeAuditLog(data, endpoint, logId)
}

/** Classify only requests inside the configured LMS Admin boundary. */
export function isAdminRequest(config: InternalAxiosRequestConfig): boolean {
  try {
    const base = new URL(lmsClient.defaults.baseURL!, window.location.href)
    const url = new URL(lmsClient.getUri(config), window.location.href)
    const path = `${base.pathname.replace(/\/$/, '')}/admin/`
    return !url.username && !url.password && url.origin === base.origin && url.pathname.startsWith(path)
  } catch { return false }
}
