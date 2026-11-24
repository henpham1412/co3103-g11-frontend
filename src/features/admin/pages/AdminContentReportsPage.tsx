import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Descriptions, Drawer, Empty, Pagination, Select, Space, Spin, Tag, Typography } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { normalizeApiError } from '@/api/apiError'
import {
  downloadAdminReportTarget,
  getAdminContentReport,
  listAdminContentReports,
  reviewAdminContentReport,
} from '../api/adminApi'
import { formatAdminError, formatAdminTimestamp, triggerFileDownload } from '../adminFormat'
import type {
  AdminContentReport,
  AdminPage,
  ContentReportQuery,
  ContentType,
  ReportStatus,
  ReviewOutcome,
} from '../types'
import '../admin-pages.css'

const DEFAULT_PAGE_SIZE = 20

const STATUS_OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISMISSED', label: 'Dismissed' },
]

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: 'DISCUSSION', label: 'Discussion' },
  { value: 'MATERIAL', label: 'Material' },
]

function statusColor(status: ReportStatus): string {
  switch (status) {
    case 'PENDING': return 'gold'
    case 'REVIEWED': return 'blue'
    case 'RESOLVED': return 'green'
    case 'DISMISSED': return 'default'
  }
}

function allowedOutcomes(status: ReportStatus): { value: ReviewOutcome; label: string }[] {
  if (status === 'PENDING') {
    return [
      { value: 'REVIEWED', label: 'Mark Reviewed' },
      { value: 'RESOLVED', label: 'Resolve' },
      { value: 'DISMISSED', label: 'Dismiss' },
    ]
  }
  if (status === 'REVIEWED') {
    return [
      { value: 'RESOLVED', label: 'Resolve' },
      { value: 'DISMISSED', label: 'Dismiss' },
    ]
  }
  return []
}

export default function AdminContentReportsPage() {
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'ALL'>('ALL')
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentType | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE)
  const [reloadTick, setReloadTick] = useState(0)

  const listQuery = useMemo<ContentReportQuery>(() => ({
    ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
    ...(contentTypeFilter !== 'ALL' ? { content_type: contentTypeFilter } : {}),
    page,
    size,
  }), [statusFilter, contentTypeFilter, page, size])

  const listKey = useMemo(() => JSON.stringify({ listQuery, reloadTick }), [listQuery, reloadTick])
  const [listState, setListState] = useState<{ key: string; data?: AdminPage<AdminContentReport>; error?: string }>({ key: '' })
  const loadingList = listState.key !== listKey

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [detailTick, setDetailTick] = useState(0)
  const detailKey = selectedReportId ? `${selectedReportId}:${detailTick}` : ''
  const [detailState, setDetailState] = useState<{ key: string; report?: AdminContentReport; error?: string }>({ key: '' })
  const loadingDetail = Boolean(selectedReportId) && detailState.key !== detailKey
  const activeReport = selectedReportId && detailState.key === detailKey ? detailState.report : undefined
  const detailError = selectedReportId && detailState.key === detailKey ? detailState.error : undefined

  const [pendingOutcome, setPendingOutcome] = useState<{ reportId: string; status: ReviewOutcome } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)
  const submitInFlightRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    listAdminContentReports(listQuery, controller.signal)
      .then((data) => {
        if (!active || controller.signal.aborted) return
        if (data.total_pages > 0 && page > data.total_pages) {
          setPage(data.total_pages)
          return
        }
        setListState({ key: listKey, data })
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return
        setListState({ key: listKey, error: formatAdminError(cause, 'Could not load content reports.') })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [listKey, listQuery, page])

  useEffect(() => {
    if (!selectedReportId) return
    const controller = new AbortController()
    let active = true
    getAdminContentReport(selectedReportId, controller.signal)
      .then((report) => {
        if (!active || controller.signal.aborted) return
        setDetailState({ key: detailKey, report })
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return
        setDetailState({ key: detailKey, error: formatAdminError(cause, 'Could not load report details.') })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [detailKey, selectedReportId])

  const hasActiveFilters = statusFilter !== 'ALL' || contentTypeFilter !== 'ALL'

  function resetFilters() {
    setStatusFilter('ALL')
    setContentTypeFilter('ALL')
    setPage(1)
  }

  function openReport(reportId: string) {
    setSelectedReportId(reportId)
    setDetailTick(value => value + 1)
    setPendingOutcome(null)
    setActionError(null)
    setSuccessNotice(null)
  }

  function closeDrawer() {
    if (submitting) return
    setSelectedReportId(null)
    setPendingOutcome(null)
    setActionError(null)
  }

  async function handleConfirmReview() {
    if (!activeReport || !pendingOutcome || pendingOutcome.reportId !== activeReport.report_id || submitInFlightRef.current) {
      return
    }
    submitInFlightRef.current = true
    setSubmitting(true)
    setActionError(null)
    setSuccessNotice(null)
    const reportId = activeReport.report_id
    const outcome = pendingOutcome.status
    try {
      await reviewAdminContentReport(reportId, outcome)
      if (!mountedRef.current) return
      setPendingOutcome(null)
      setSuccessNotice(`Report marked as ${outcome}.`)
      // PATCH response omits target; refetch canonical report detail and list.
      setDetailTick(value => value + 1)
      setReloadTick(value => value + 1)
    } catch (cause: unknown) {
      if (!mountedRef.current) return
      const err = normalizeApiError(cause)
      setActionError(formatAdminError(cause, 'Could not update content report.'))
      setPendingOutcome(null)
      if (err.code === 'REPORT_ALREADY_UPDATED') {
        setDetailTick(value => value + 1)
        setReloadTick(value => value + 1)
      }
    } finally {
      submitInFlightRef.current = false
      if (mountedRef.current) setSubmitting(false)
    }
  }

  async function handleDownloadTargetFile() {
    if (!activeReport || downloading) return
    setDownloading(true)
    setActionError(null)
    try {
      const { blob, filename } = await downloadAdminReportTarget(activeReport.report_id)
      if (!mountedRef.current) return
      triggerFileDownload(blob, filename)
    } catch (cause: unknown) {
      if (!mountedRef.current) return
      setActionError(formatAdminError(cause, 'Could not download reported material file.'))
    } finally {
      if (mountedRef.current) setDownloading(false)
    }
  }

  const pageData = listState.data
  const items = pageData?.items ?? []
  const transitions = activeReport ? allowedOutcomes(activeReport.status) : []
  const confirmedChoice = activeReport && pendingOutcome?.reportId === activeReport.report_id ? pendingOutcome.status : null

  return (
    <section className="tutor-page">
      <div className="admin-page__header">
        <div>
          <h1>Content Report Moderation</h1>
          <p>Review reported discussions and materials. Moderation updates report status only and does not delete or hide content.</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => setReloadTick(value => value + 1)} disabled={loadingList}>
          Refresh
        </Button>
      </div>

      {successNotice && (
        <Alert
          type="success"
          showIcon
          closable
          onClose={() => setSuccessNotice(null)}
          title={successNotice}
          style={{ marginBottom: 16 }}
        />
      )}

      <div className="tutor-panel">
        <div className="admin-filters">
          <div className="admin-filter-field">
            <label htmlFor="admin-reports-status">Status</label>
            <Select
              id="admin-reports-status"
              aria-label="Filter by report status"
              value={statusFilter}
              onChange={(value: ReportStatus | 'ALL') => { setStatusFilter(value); setPage(1) }}
              options={[{ value: 'ALL', label: 'All statuses' }, ...STATUS_OPTIONS]}
            />
          </div>

          <div className="admin-filter-field">
            <label htmlFor="admin-reports-type">Content Type</label>
            <Select
              id="admin-reports-type"
              aria-label="Filter by content type"
              value={contentTypeFilter}
              onChange={(value: ContentType | 'ALL') => { setContentTypeFilter(value); setPage(1) }}
              options={[{ value: 'ALL', label: 'All content types' }, ...CONTENT_TYPE_OPTIONS]}
            />
          </div>

          <div className="admin-filter-actions">
            <Button onClick={resetFilters} disabled={!hasActiveFilters}>Reset</Button>
          </div>
        </div>

        {loadingList ? (
          <div className="tutor-page__loading" role="status" aria-label="Loading content reports">
            <Spin />
          </div>
        ) : listState.error ? (
          <Alert
            type="error"
            showIcon
            title="Could not load content reports"
            description={listState.error}
            action={<Button onClick={() => setReloadTick(value => value + 1)}>Retry</Button>}
          />
        ) : items.length === 0 ? (
          <Empty
            description={hasActiveFilters ? 'No content reports match the current filters.' : 'No content reports have been submitted.'}
          >
            {hasActiveFilters && <Button onClick={resetFilters}>Clear filters</Button>}
          </Empty>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="tutor-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Type</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Target</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((report) => (
                    <tr key={report.report_id} className={selectedReportId === report.report_id ? 'is-selected' : undefined}>
                      <td>
                        <div className="admin-mono">{report.report_id}</div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Content: <span className="admin-mono">{report.content_id}</span>
                        </Typography.Text>
                      </td>
                      <td><Tag>{report.content_type}</Tag></td>
                      <td><Tag>{report.reason}</Tag></td>
                      <td><Tag color={statusColor(report.status)}>{report.status}</Tag></td>
                      <td>
                        <Tag color={report.target_available ? 'green' : 'default'}>
                          {report.target_available ? 'Available' : 'Unavailable'}
                        </Tag>
                      </td>
                      <td>{formatAdminTimestamp(report.created_at)}</td>
                      <td>
                        <Button size="small" onClick={() => openReport(report.report_id)}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pageData && (
              <div className="admin-pagination">
                <Typography.Text type="secondary">
                  Showing {items.length} of {pageData.total_items} report{pageData.total_items === 1 ? '' : 's'}
                </Typography.Text>
                <Pagination
                  current={pageData.page}
                  pageSize={pageData.size}
                  total={pageData.total_items}
                  showSizeChanger
                  pageSizeOptions={[10, 20, 50]}
                  onChange={(nextPage, nextSize) => {
                    if (nextSize !== size) {
                      setSize(nextSize)
                      setPage(1)
                    } else {
                      setPage(nextPage)
                    }
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <Drawer
        title="Content Report Detail"
        open={Boolean(selectedReportId)}
        onClose={closeDrawer}
        size="large"
        mask={{ closable: !submitting }}
      >
        {loadingDetail ? (
          <div className="tutor-page__loading" role="status" aria-label="Loading report details">
            <Spin />
          </div>
        ) : detailError ? (
          <Alert
            type="error"
            showIcon
            title="Could not load report details"
            description={detailError}
            action={<Button onClick={() => setDetailTick(value => value + 1)}>Retry</Button>}
          />
        ) : activeReport ? (
          <div className="admin-drawer-section">
            {actionError && (
              <Alert
                type="error"
                showIcon
                title="Moderation action failed"
                description={actionError}
              />
            )}

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Report ID">
                <span className="admin-mono">{activeReport.report_id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusColor(activeReport.status)}>{activeReport.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Content Type">{activeReport.content_type}</Descriptions.Item>
              <Descriptions.Item label="Reason">{activeReport.reason}</Descriptions.Item>
              <Descriptions.Item label="Reporter ID">
                <span className="admin-mono">{activeReport.reporter_id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Content ID">
                <span className="admin-mono">{activeReport.content_id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Created">{formatAdminTimestamp(activeReport.created_at)}</Descriptions.Item>
              <Descriptions.Item label="Reviewed By">
                {activeReport.reviewed_by ? <span className="admin-mono">{activeReport.reviewed_by}</span> : 'Not yet reviewed'}
              </Descriptions.Item>
              <Descriptions.Item label="Reviewed At">
                {formatAdminTimestamp(activeReport.reviewed_at, 'Not yet reviewed')}
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Typography.Text strong>Reporter Description</Typography.Text>
              <pre className="admin-content-preview" style={{ marginTop: 6 }}>
                {activeReport.description || 'No additional description provided.'}
              </pre>
            </div>

            <div>
              <Typography.Text strong>Reported Target</Typography.Text>
              {!activeReport.target_available || !activeReport.target ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 6 }}
                  title="Target content unavailable"
                  description="The reported target was removed or is no longer available. The moderation report remains retained for review."
                />
              ) : (
                <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
                  <Descriptions column={1} bordered size="small">
                    {activeReport.target.title !== null && (
                      <Descriptions.Item label="Title">{activeReport.target.title}</Descriptions.Item>
                    )}
                    {activeReport.target.material_type !== null && (
                      <Descriptions.Item label="Material Type">{activeReport.target.material_type}</Descriptions.Item>
                    )}
                    {activeReport.target.visibility !== null && (
                      <Descriptions.Item label="Visibility">{activeReport.target.visibility}</Descriptions.Item>
                    )}
                    {activeReport.target.class_status !== null && (
                      <Descriptions.Item label="Class Status">{activeReport.target.class_status}</Descriptions.Item>
                    )}
                    {activeReport.target.class_id !== null && (
                      <Descriptions.Item label="Class ID">
                        <span className="admin-mono">{activeReport.target.class_id}</span>
                      </Descriptions.Item>
                    )}
                    {activeReport.target.lesson_id !== null && (
                      <Descriptions.Item label="Lesson ID">
                        <span className="admin-mono">{activeReport.target.lesson_id}</span>
                      </Descriptions.Item>
                    )}
                    {activeReport.target.author_id !== null && (
                      <Descriptions.Item label="Author ID">
                        <span className="admin-mono">{activeReport.target.author_id}</span>
                      </Descriptions.Item>
                    )}
                  </Descriptions>

                  {activeReport.target.content !== null && (
                    <pre className="admin-content-preview">{activeReport.target.content}</pre>
                  )}

                  {activeReport.content_type === 'MATERIAL' && activeReport.target.file_available && (
                    <div>
                      <Button
                        icon={<DownloadOutlined />}
                        loading={downloading}
                        disabled={downloading}
                        onClick={() => void handleDownloadTargetFile()}
                      >
                        Download reported file
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <Typography.Text strong>Moderation Decision</Typography.Text>
              {transitions.length === 0 ? (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 6 }}
                  title={`Report is ${activeReport.status}`}
                  description="This report has reached a terminal moderation state and cannot be updated further."
                />
              ) : !confirmedChoice ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                  <Typography.Text type="secondary">
                    Choose a permitted review outcome. Updating report status does not implicitly delete or hide the target content.
                  </Typography.Text>
                  <Space wrap>
                    {transitions.map((option) => (
                      <Button
                        key={option.value}
                        type={option.value === 'RESOLVED' ? 'primary' : 'default'}
                        disabled={submitting}
                        onClick={() => {
                          setActionError(null)
                          setPendingOutcome({ reportId: activeReport.report_id, status: option.value })
                        }}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </Space>
                </div>
              ) : (
                <div className="admin-confirm-box" style={{ marginTop: 8 }}>
                  <Typography.Text strong>Confirm moderation decision</Typography.Text>
                  <div>
                    Transition status from <strong>{activeReport.status}</strong> to <strong>{confirmedChoice}</strong>?
                  </div>
                  <Space>
                    <Button
                      type="primary"
                      loading={submitting}
                      disabled={submitting}
                      onClick={() => void handleConfirmReview()}
                    >
                      Confirm {confirmedChoice}
                    </Button>
                    <Button onClick={() => setPendingOutcome(null)} disabled={submitting}>Cancel</Button>
                  </Space>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </section>
  )
}
