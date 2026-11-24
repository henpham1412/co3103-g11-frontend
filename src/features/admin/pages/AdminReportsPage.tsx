import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Spin, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { getAdminOperationalReport } from '../api/adminApi'
import { isUuid } from '../api/adminDecoders'
import { formatAdminDecimal, formatAdminError } from '../adminFormat'
import type { OperationalReport, ReportType } from '../types'
import '../admin-pages.css'

type ReportSlot<K extends ReportType> = {
  key: string
  report?: OperationalReport<K>
  error?: string
}

interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
}

function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <div className="admin-metric-card">
      <div className="admin-metric-card__label">{label}</div>
      <div className="admin-metric-card__value">{value}</div>
      {sub && <div className="admin-metric-card__sub">{sub}</div>}
    </div>
  )
}

function formatScoreAverage(value: number | null): { value: string; sub?: string } {
  if (value === null) {
    return { value: 'No graded scores', sub: 'No graded records available yet' }
  }
  return { value: formatAdminDecimal(value), sub: 'Average across graded items' }
}

export default function AdminReportsPage() {
  const [classIdInput, setClassIdInput] = useState('')
  const [appliedClassId, setAppliedClassId] = useState<string | undefined>(undefined)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [ticks, setTicks] = useState({ enrollment: 0, completion: 0, assessment: 0 })

  const enrollmentKey = useMemo(() => `${appliedClassId ?? 'all'}:${ticks.enrollment}`, [appliedClassId, ticks.enrollment])
  const completionKey = useMemo(() => `${appliedClassId ?? 'all'}:${ticks.completion}`, [appliedClassId, ticks.completion])
  const assessmentKey = useMemo(() => `${appliedClassId ?? 'all'}:${ticks.assessment}`, [appliedClassId, ticks.assessment])

  const [enrollmentState, setEnrollmentState] = useState<ReportSlot<'enrollment'>>({ key: '' })
  const [completionState, setCompletionState] = useState<ReportSlot<'completion'>>({ key: '' })
  const [assessmentState, setAssessmentState] = useState<ReportSlot<'assessment'>>({ key: '' })

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    getAdminOperationalReport('enrollment', appliedClassId, controller.signal)
      .then((report) => {
        if (!active || controller.signal.aborted) return
        setEnrollmentState({ key: enrollmentKey, report })
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return
        setEnrollmentState({ key: enrollmentKey, error: formatAdminError(cause, 'Could not load enrollment report.') })
      })
    return () => { active = false; controller.abort() }
  }, [appliedClassId, enrollmentKey])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    getAdminOperationalReport('completion', appliedClassId, controller.signal)
      .then((report) => {
        if (!active || controller.signal.aborted) return
        setCompletionState({ key: completionKey, report })
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return
        setCompletionState({ key: completionKey, error: formatAdminError(cause, 'Could not load completion report.') })
      })
    return () => { active = false; controller.abort() }
  }, [appliedClassId, completionKey])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    getAdminOperationalReport('assessment', appliedClassId, controller.signal)
      .then((report) => {
        if (!active || controller.signal.aborted) return
        setAssessmentState({ key: assessmentKey, report })
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return
        setAssessmentState({ key: assessmentKey, error: formatAdminError(cause, 'Could not load assessment report.') })
      })
    return () => { active = false; controller.abort() }
  }, [appliedClassId, assessmentKey])

  function applyFilter() {
    const trimmed = classIdInput.trim()
    if (!trimmed) {
      setFilterError(null)
      setAppliedClassId(undefined)
      return
    }
    if (!isUuid(trimmed)) {
      setFilterError('Enter a valid Class UUID (for example, 40000000-0000-0000-0000-000000000001) or leave blank for all classes.')
      return
    }
    setFilterError(null)
    setClassIdInput(trimmed)
    setAppliedClassId(trimmed)
  }

  function resetToAllClasses() {
    setClassIdInput('')
    setFilterError(null)
    setAppliedClassId(undefined)
  }

  function refreshAll() {
    setTicks((prev) => ({
      enrollment: prev.enrollment + 1,
      completion: prev.completion + 1,
      assessment: prev.assessment + 1,
    }))
  }

  const loadingEnrollment = enrollmentState.key !== enrollmentKey
  const loadingCompletion = completionState.key !== completionKey
  const loadingAssessment = assessmentState.key !== assessmentKey
  const loadingAny = loadingEnrollment || loadingCompletion || loadingAssessment

  const enrollmentReport = enrollmentState.key === enrollmentKey ? enrollmentState.report : undefined
  const completionReport = completionState.key === completionKey ? completionState.report : undefined
  const assessmentReport = assessmentState.key === assessmentKey ? assessmentState.report : undefined

  return (
    <section className="tutor-page">
      <div className="admin-page__header">
        <div>
          <h1>Operational Reports</h1>
          <p>Current-state LMS operational snapshots across enrollment, completion, and assessments. Filter optionally by a single Class UUID.</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={refreshAll} disabled={loadingAny}>
          Refresh all
        </Button>
      </div>

      <div className="tutor-panel" style={{ marginBottom: 20 }}>
        <form
          className="admin-filters"
          style={{ marginBottom: filterError ? 12 : 0 }}
          onSubmit={(event) => { event.preventDefault(); applyFilter() }}
        >
          <div className="admin-filter-field admin-filter-field--wide">
            <label htmlFor="admin-reports-class-id">Class UUID (optional)</label>
            <Input
              id="admin-reports-class-id"
              placeholder="Leave blank for all classes, or enter a Class UUID"
              value={classIdInput}
              onChange={(event) => {
                setClassIdInput(event.target.value)
                if (filterError) setFilterError(null)
              }}
              allowClear
              onClear={resetToAllClasses}
            />
          </div>

          <div className="admin-filter-actions">
            <Button type="primary" htmlType="submit">Apply filter</Button>
            <Button onClick={resetToAllClasses} disabled={!appliedClassId && !classIdInput}>All classes</Button>
          </div>
        </form>

        {filterError && (
          <Alert type="error" showIcon title={filterError} style={{ marginBottom: 12 }} />
        )}

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Typography.Text type="secondary">Active scope:</Typography.Text>
          {appliedClassId ? (
            <Tag color="blue"><span className="admin-mono">Class {appliedClassId}</span></Tag>
          ) : (
            <Tag>All classes</Tag>
          )}
        </div>
      </div>

      <div className="admin-reports-stack">
        <section className="tutor-panel" aria-labelledby="report-enrollment-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h2 id="report-enrollment-heading">Enrollment Report</h2>
              <div className="tutor-panel__sub">Membership states and class counts</div>
            </div>
            <Button size="small" onClick={() => setTicks(prev => ({ ...prev, enrollment: prev.enrollment + 1 }))} disabled={loadingEnrollment}>
              Refresh
            </Button>
          </div>

          {loadingEnrollment ? (
            <div className="tutor-page__loading" role="status" aria-label="Loading enrollment report"><Spin /></div>
          ) : enrollmentState.error ? (
            <Alert
              type="error"
              showIcon
              title="Could not load enrollment report"
              description={enrollmentState.error}
              action={<Button onClick={() => setTicks(prev => ({ ...prev, enrollment: prev.enrollment + 1 }))}>Retry</Button>}
            />
          ) : enrollmentReport ? (
            <>
              {enrollmentReport.message && (
                <Alert type="info" showIcon title={enrollmentReport.message} style={{ marginBottom: 12 }} />
              )}
              <div className="admin-metrics-grid">
                <MetricCard label="Active Members" value={enrollmentReport.data.active_members} />
                <MetricCard label="Pending Requests" value={enrollmentReport.data.pending_requests} />
                <MetricCard label="Inactive Members" value={enrollmentReport.data.inactive_members} />
                <MetricCard label="Rejected Requests" value={enrollmentReport.data.rejected_requests} />
                <MetricCard label="Total Memberships" value={enrollmentReport.data.total_memberships} />
                <MetricCard label="Total Classes" value={enrollmentReport.data.total_classes} />
                <MetricCard label="Active Classes" value={enrollmentReport.data.active_classes} />
                <MetricCard label="Archived Classes" value={enrollmentReport.data.archived_classes} />
              </div>
            </>
          ) : null}
        </section>

        <section className="tutor-panel" aria-labelledby="report-completion-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h2 id="report-completion-heading">Completion Report</h2>
              <div className="tutor-panel__sub">Lesson completion and membership progress metrics</div>
            </div>
            <Button size="small" onClick={() => setTicks(prev => ({ ...prev, completion: prev.completion + 1 }))} disabled={loadingCompletion}>
              Refresh
            </Button>
          </div>

          {loadingCompletion ? (
            <div className="tutor-page__loading" role="status" aria-label="Loading completion report"><Spin /></div>
          ) : completionState.error ? (
            <Alert
              type="error"
              showIcon
              title="Could not load completion report"
              description={completionState.error}
              action={<Button onClick={() => setTicks(prev => ({ ...prev, completion: prev.completion + 1 }))}>Retry</Button>}
            />
          ) : completionReport ? (
            <>
              {completionReport.message && (
                <Alert type="info" showIcon title={completionReport.message} style={{ marginBottom: 12 }} />
              )}
              <div className="admin-metrics-grid">
                <MetricCard label="Active Members" value={completionReport.data.active_members} />
                <MetricCard label="Eligible Lessons" value={completionReport.data.eligible_lessons} />
                <MetricCard label="Completed Lesson Marks" value={completionReport.data.completed_lesson_marks} />
                <MetricCard label="Completed Memberships" value={completionReport.data.completed_memberships} />
                <MetricCard label="In-Progress Memberships" value={completionReport.data.in_progress_memberships} />
                <MetricCard label="Completion Rate" value={formatAdminDecimal(completionReport.data.completion_rate, '%')} />
                <MetricCard label="Average Progress" value={formatAdminDecimal(completionReport.data.average_progress_percentage, '%')} />
              </div>
            </>
          ) : null}
        </section>

        <section className="tutor-panel" aria-labelledby="report-assessment-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h2 id="report-assessment-heading">Assessment Report</h2>
              <div className="tutor-panel__sub">Quiz attempt and assignment submission aggregates</div>
            </div>
            <Button size="small" onClick={() => setTicks(prev => ({ ...prev, assessment: prev.assessment + 1 }))} disabled={loadingAssessment}>
              Refresh
            </Button>
          </div>

          {loadingAssessment ? (
            <div className="tutor-page__loading" role="status" aria-label="Loading assessment report"><Spin /></div>
          ) : assessmentState.error ? (
            <Alert
              type="error"
              showIcon
              title="Could not load assessment report"
              description={assessmentState.error}
              action={<Button onClick={() => setTicks(prev => ({ ...prev, assessment: prev.assessment + 1 }))}>Retry</Button>}
            />
          ) : assessmentReport ? (
            <>
              {assessmentReport.message && (
                <Alert type="info" showIcon title={assessmentReport.message} style={{ marginBottom: 12 }} />
              )}
              <div className="admin-metrics-grid">
                <MetricCard label="Total Quiz Attempts" value={assessmentReport.data.total_quiz_attempts} />
                <MetricCard label="In-Progress Quizzes" value={assessmentReport.data.in_progress_quiz_attempts} />
                <MetricCard label="Submitted Quizzes" value={assessmentReport.data.submitted_quiz_attempts} />
                <MetricCard label="Graded Quizzes" value={assessmentReport.data.graded_quiz_attempts} />
                <MetricCard
                  label="Average Quiz Score"
                  {...formatScoreAverage(assessmentReport.data.average_quiz_attempt_score)}
                />
                <MetricCard label="Total Assignment Submissions" value={assessmentReport.data.total_assignment_submissions} />
                <MetricCard label="Ungraded Assignments" value={assessmentReport.data.ungraded_assignment_submissions} />
                <MetricCard label="Graded Assignments" value={assessmentReport.data.graded_assignment_submissions} />
                <MetricCard label="Late Assignments" value={assessmentReport.data.late_assignment_submissions} />
                <MetricCard
                  label="Average Assignment Score"
                  {...formatScoreAverage(assessmentReport.data.average_assignment_submission_score)}
                />
                <MetricCard
                  label="Overall Average Assessment Score"
                  {...formatScoreAverage(assessmentReport.data.average_assessment_score)}
                />
              </div>
            </>
          ) : null}
        </section>
      </div>
    </section>
  )
}
