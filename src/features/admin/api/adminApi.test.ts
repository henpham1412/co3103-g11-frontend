import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lmsClient } from '@/api/lmsClient'
import { installAuthInterceptors } from '@/api/authInterceptors'
import { authSession } from '@/test/fixtures/auth'
import { server } from '@/test/server'
import type { ReportType } from '../types'
import { adminUser, auditLog, CLASS_ID, contentReport, LOG_ID, moderationTarget, operationalData,
    OTHER_ID, page, REPORT_ID, USER_ID } from '@/test/fixtures/admin'
import { downloadAdminReportTarget, getAdminAuditLog, getAdminContentReport, getAdminOperationalReport, getAdminUser,
  listAdminAuditLogs, listAdminContentReports, listAdminUsers, reviewAdminContentReport, updateAdminUserAccess } from './adminApi'

const base = lmsClient.defaults.baseURL!
const forbidden = vi.fn()
const purge = vi.fn()
let uninstall: () => void
beforeEach(() => {
  const session = authSession()
  uninstall = installAuthInterceptors({ getSessionSnapshot: () => ({ session, generation: 1 }),
    purgeSession: purge, onLmsForbidden: forbidden })
})
afterEach(() => uninstall())

it('reads the verified local user with Bearer auth, projects canonical fields, and silences only the probe', async () => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, ({ request }) => {
    expect(request.headers.get('Authorization')).toMatch(/^Bearer /)
    expect(new URL(request.url).search).toBe('')
    return HttpResponse.json({ ...adminUser(), role: 'STUDENT', private_metadata: 'excluded' })
  }))
  expect(await getAdminUser(USER_ID, undefined, true)).toEqual(adminUser())
})

it('maps user filters and sorting to the one-based canonical user page, including last', async () => {
  server.use(http.get(`${base}/admin/users`, ({ request }) => {
    expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({ q: 'a+b_%', lms_role: 'ADMINISTRATOR',
      access_status: 'ACTIVE', page: '2', size: '1', sort: 'full_name,asc' })
    return HttpResponse.json({ items: [adminUser()], page: 2, size: 1, total_items: 2, total_pages: 2, last: true })
  }))
  expect(await listAdminUsers({ q: 'a+b_%', lms_role: 'ADMINISTRATOR', access_status: 'ACTIVE',
    page: 2, size: 1, sort: 'full_name,asc' })).toMatchObject({ page: 2, last: true, total_items: 2 })
})

it('sends only permitted access fields for full and partial PATCHes', async () => {
  const bodies: unknown[] = []
  server.use(http.patch(`${base}/admin/users/${USER_ID}`, async ({ request }) => {
    bodies.push(await request.json())
    return HttpResponse.json(adminUser({ lms_role: 'TUTOR', access_status: 'SUSPENDED' }))
  }))
  await updateAdminUserAccess(USER_ID, { lms_role: 'TUTOR', access_status: 'SUSPENDED', full_name: 'ignored' } as never)
  await updateAdminUserAccess(USER_ID, { access_status: 'SUSPENDED' })
  expect(bodies).toEqual([{ lms_role: 'TUTOR', access_status: 'SUSPENDED' }, { access_status: 'SUSPENDED' }])
})

it('preserves last-admin conflict and canonical error envelope', async () => {
  server.use(http.patch(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json({
    code: 'INVALID_ROLE_OR_STATUS_TRANSITION', message: 'Cannot remove the last active administrator', details: [],
  }, { status: 409 })))
  await expect(updateAdminUserAccess(USER_ID, { lms_role: 'STUDENT' })).rejects.toMatchObject({ response: {
    status: 409, data: { code: 'INVALID_ROLE_OR_STATUS_TRANSITION', details: [] },
  } })
})

it('maps moderation list filters and keeps a retained report without its target', async () => {
  server.use(http.get(`${base}/admin/content-reports`, ({ request }) => {
    expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({ status: 'RESOLVED', content_type: 'MATERIAL', page: '1', size: '20' })
    return HttpResponse.json(page([contentReport({ status: 'RESOLVED', content_type: 'MATERIAL', target_available: false })]))
  }))
  const result = await listAdminContentReports({ status: 'RESOLVED', content_type: 'MATERIAL', page: 1, size: 20 })
  expect(result.items[0]).toMatchObject({ target_available: false })
  expect(result.items[0]).not.toHaveProperty('target')
})

it('reads report target details and accepts PATCH responses without a target snapshot', async () => {
  server.use(
    http.get(`${base}/admin/content-reports/${REPORT_ID}`, () => HttpResponse.json(contentReport({ target: moderationTarget() }))),
    http.patch(`${base}/admin/content-reports/${REPORT_ID}`, async ({ request }) => {
      expect(await request.json()).toEqual({ status: 'REVIEWED' })
      return HttpResponse.json(contentReport({ status: 'REVIEWED', reviewed_by: USER_ID, reviewed_at: '2026-11-23T04:00:00Z' }))
    }),
  )
  expect((await getAdminContentReport(REPORT_ID)).target).toEqual(moderationTarget())
  const result = await reviewAdminContentReport(REPORT_ID, 'REVIEWED')
  expect(result.status).toBe('REVIEWED')
  expect(result).not.toHaveProperty('target')
})

it.each(['encoded', 'malformed', 'path'] as const)('downloads only through the authenticated report endpoint (%s filename)', async kind => {
  const disposition = kind === 'encoded' ? "attachment; filename*=UTF-8''reported%20file.pdf"
    : kind === 'malformed' ? "attachment; filename*=UTF-8''%ZZ" : 'attachment; filename="../../file.pdf"'
  server.use(http.get(`${base}/admin/content-reports/${REPORT_ID}/target/file`, ({ request }) => {
    expect(request.headers.get('Authorization')).toMatch(/^Bearer /)
    return new HttpResponse('file bytes', { headers: { 'Content-Disposition': disposition } })
  }))
  const result = await downloadAdminReportTarget(REPORT_ID)
  const body = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(result.blob)
  })
  expect(body).toBe('file bytes')
  expect(result.filename).toBe(kind === 'encoded' ? 'reported file.pdf' : kind === 'malformed' ? 'reported-material' : 'file.pdf')
})

describe.each<ReportType>(['enrollment', 'completion', 'assessment'])('%s report', type => {
  it.each([undefined, CLASS_ID])('maps only optional class_id (%s) and retains numeric zero/null', async classId => {
    const response = { report_type: type, filters: classId ? { class_id: classId } : {},
      message: 'No reportable data is available.', data: operationalData[type] }
    server.use(http.get(`${base}/admin/reports/${type}`, ({ request }) => {
      expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual(classId ? { class_id: classId } : {})
      return HttpResponse.json(response)
    }))
    expect(await getAdminOperationalReport(type, classId)).toEqual(response)
  })
})

it('maps audit exact-match/date/page filters and reads the UUID detail with structured before/after', async () => {
  const query = { actor_id: USER_ID, action: 'LMS_USER_ACCESS_UPDATED', entity_type: 'LmsUserAccess',
    from: '2026-11-23T08:00:00+07:00', to: '2026-11-23T09:00:00+07:00', page: 1, size: 20 }
  server.use(
    http.get(`${base}/admin/audit-logs`, ({ request }) => {
      expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({ ...query, page: '1', size: '20' })
      return HttpResponse.json(page([auditLog()]))
    }),
    http.get(`${base}/admin/audit-logs/${LOG_ID}`, () => HttpResponse.json(auditLog())),
  )
  expect((await listAdminAuditLogs(query)).items).toEqual([auditLog()])
  expect(await getAdminAuditLog(LOG_ID)).toEqual(auditLog())
})

it('retains the neutral redaction fallback for unknown legacy audit actions', async () => {
  const log = auditLog({ action: 'LEGACY_UNKNOWN', details: { unavailable: true } })
  server.use(http.get(`${base}/admin/audit-logs/${LOG_ID}`, () => HttpResponse.json(log)))
  expect(await getAdminAuditLog(LOG_ID)).toEqual(log)
})

it.each([401, 403, 404, 409, 500])('propagates HTTP %s instead of fabricating empty data', async status => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json({ code: 'TEST_ERROR', message: 'Denied', details: [] }, { status })))
  await expect(getAdminUser(USER_ID)).rejects.toMatchObject({ response: { status } })
  expect(forbidden).toHaveBeenCalledTimes(status === 403 ? 1 : 0)
})

it('suppresses expected probe 403 notifications without suppressing unauthorized session handling', async () => {
  server.use(http.get(`${base}/admin/users/${USER_ID}`, () => new HttpResponse(null, { status: 403 })))
  await expect(getAdminUser(USER_ID, undefined, true)).rejects.toMatchObject({ response: { status: 403 } })
  expect(forbidden).not.toHaveBeenCalled()
  expect(purge).not.toHaveBeenCalled()
})

it('cancels requests and validates UUIDs before issuing a request', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(getAdminUser(USER_ID, controller.signal)).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  await expect(getAdminUser('../users')).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
  await expect(getAdminOperationalReport('enrollment', 'not-a-class-uuid')).rejects.toMatchObject({ status: 400 })
})

it.each(['user', 'report', 'audit'] as const)('rejects a foreign %s detail rather than binding it to the selected record', async kind => {
  const path = kind === 'user' ? `/admin/users/${USER_ID}` : kind === 'report' ? `/admin/content-reports/${REPORT_ID}` : `/admin/audit-logs/${LOG_ID}`
  const data = kind === 'user' ? adminUser({ user_id: OTHER_ID }) : kind === 'report' ? contentReport({ report_id: OTHER_ID }) : auditLog({ audit_log_id: OTHER_ID })
  server.use(http.get(`${base}${path}`, () => HttpResponse.json(data)))
  const read = kind === 'user' ? getAdminUser(USER_ID) : kind === 'report' ? getAdminContentReport(REPORT_ID) : getAdminAuditLog(LOG_ID)
  await expect(read).rejects.toMatchObject({ status: 502, code: 'INVALID_ADMIN_RESPONSE' })
})

describe('runtime contract validation through public clients', () => {
  it.each([
    { lms_role: 'ADMIN' }, { access_status: 'DEACTIVATED' }, { user_id: 123 },
    { last_login_at: 'not-a-date' }, { full_name: null }, { updated_at: undefined },
  ])('rejects invalid user fields %j', async patch => {
    server.use(http.get(`${base}/admin/users/${USER_ID}`, () => HttpResponse.json({ ...adminUser(), ...patch })))
    await expect(getAdminUser(USER_ID)).rejects.toMatchObject({ code: 'INVALID_ADMIN_RESPONSE' })
  })

  it.each([
    { content: [] }, { page: 0 }, { size: 0 }, { total_items: -1 }, { total_pages: 1.5 },
    { total_items: Number.MAX_SAFE_INTEGER + 1 }, { last: undefined }, { last: false },
  ])('rejects malformed user pagination %j', async patch => {
    const response = { ...page([adminUser()]), last: true, ...patch }
    if ('content' in patch) delete (response as Partial<typeof response>).items
    server.use(http.get(`${base}/admin/users`, () => HttpResponse.json(response)))
    await expect(listAdminUsers()).rejects.toMatchObject({ code: 'INVALID_ADMIN_RESPONSE' })
  })

  it('accepts a valid out-of-range empty user page without fabricating records', async () => {
    const response = { items: [], page: 999, size: 20, total_items: 1, total_pages: 1, last: true }
    server.use(http.get(`${base}/admin/users`, () => HttpResponse.json(response)))
    expect(await listAdminUsers({ page: 999 })).toEqual(response)
  })

  it.each([
    { status: 'APPROVED' }, { target_available: 'true' }, { content_type: 'REPLY' },
    { target: { ...moderationTarget(), content_id: OTHER_ID } },
    { target: moderationTarget(), target_available: false },
  ])('rejects malformed report fields %j', async patch => {
    server.use(http.get(`${base}/admin/content-reports/${REPORT_ID}`, () => HttpResponse.json({ ...contentReport(), ...patch })))
    await expect(getAdminContentReport(REPORT_ID)).rejects.toMatchObject({ code: 'INVALID_ADMIN_RESPONSE' })
  })

  it.each([
    { report_type: 'completion' }, { filters: { class_id: OTHER_ID } },
    { data: { ...operationalData.assessment, average_assignment_submission_score: '0' } },
    { data: { ...operationalData.assessment, graded_quiz_attempts: null } },
  ])('rejects mismatched or malformed operational data %j', async patch => {
    server.use(http.get(`${base}/admin/reports/assessment`, () => HttpResponse.json({
      report_type: 'assessment', filters: { class_id: CLASS_ID }, data: operationalData.assessment, ...patch,
    })))
    await expect(getAdminOperationalReport('assessment', CLASS_ID)).rejects.toMatchObject({ code: 'INVALID_ADMIN_RESPONSE' })
  })

  it.each([
    'raw JSON string', [], { unavailable: 'true' }, { password: 'synthetic-secret' },
    { before: { lms_role: 'STUDENT', access_status: 'ACTIVE', token: 'synthetic' }, after: { lms_role: 'TUTOR', access_status: 'ACTIVE' } },
  ])('rejects audit details outside the backend redacted schema %j', async details => {
    server.use(http.get(`${base}/admin/audit-logs/${LOG_ID}`, () => HttpResponse.json({ ...auditLog(), details })))
    await expect(getAdminAuditLog(LOG_ID)).rejects.toMatchObject({ code: 'INVALID_ADMIN_RESPONSE' })
  })

  it('accepts structured moderation audit before/after status', async () => {
    const log = auditLog({ action: 'REPORTED_CONTENT_REVIEWED', entity_type: 'ContentReport', entity_id: REPORT_ID,
      details: { before: { status: 'PENDING' }, after: { status: 'RESOLVED' } } })
    server.use(http.get(`${base}/admin/audit-logs/${LOG_ID}`, () => HttpResponse.json(log)))
    expect(await getAdminAuditLog(LOG_ID)).toEqual(log)
  })
})
