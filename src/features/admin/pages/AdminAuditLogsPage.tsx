import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Descriptions, Drawer, Empty, Input, Pagination, Select, Spin, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { getAdminAuditLog, listAdminAuditLogs } from '../api/adminApi'
import { isUuid } from '../api/adminDecoders'
import { formatAdminError, formatAdminTimestamp } from '../adminFormat'
import type { AdminPage, AuditDetails, AuditLog, AuditLogQuery } from '../types'
import '../admin-pages.css'

const DEFAULT_PAGE_SIZE = 20

const ACTION_OPTIONS = [
  { value: 'ALL', label: 'All actions' },
  { value: 'LMS_USER_ACCESS_UPDATED', label: 'LMS_USER_ACCESS_UPDATED' },
  { value: 'REPORTED_CONTENT_REVIEWED', label: 'REPORTED_CONTENT_REVIEWED' },
]

const ENTITY_TYPE_OPTIONS = [
  { value: 'ALL', label: 'All entity types' },
  { value: 'LmsUserAccess', label: 'LmsUserAccess' },
  { value: 'ContentReport', label: 'ContentReport' },
]

function parseLocalDateTimeToIso(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function summarizeDetails(details: AuditDetails): string {
  if ('unavailable' in details) {
    return 'Details unavailable (redacted)'
  }
  if ('lms_role' in details.before && 'lms_role' in details.after) {
    return `${details.before.lms_role}/${details.before.access_status} → ${details.after.lms_role}/${details.after.access_status}`
  }
  if ('status' in details.before && 'status' in details.after) {
    return `${details.before.status} → ${details.after.status}`
  }
  return 'Details unavailable (redacted)'
}

function AuditDetailsView({ details }: { details: AuditDetails }) {
  if ('unavailable' in details) {
    return (
      <Alert
        type="warning"
        showIcon
        title="Audit details unavailable"
        description="Structured change details for this entry were redacted or unavailable."
      />
    )
  }

  if ('lms_role' in details.before && 'lms_role' in details.after) {
    return (
      <div className="admin-audit-diff">
        <div className="admin-audit-diff__pane">
          <Typography.Text strong>Before</Typography.Text>
          <div>Role: <Tag>{details.before.lms_role}</Tag></div>
          <div>Status: <Tag>{details.before.access_status}</Tag></div>
        </div>
        <div className="admin-audit-diff__pane">
          <Typography.Text strong>After</Typography.Text>
          <div>Role: <Tag color="blue">{details.after.lms_role}</Tag></div>
          <div>Status: <Tag color={details.after.access_status === 'ACTIVE' ? 'green' : 'red'}>{details.after.access_status}</Tag></div>
        </div>
      </div>
    )
  }

  if ('status' in details.before && 'status' in details.after) {
    return (
      <div className="admin-audit-diff">
        <div className="admin-audit-diff__pane">
          <Typography.Text strong>Before</Typography.Text>
          <div>Status: <Tag>{details.before.status}</Tag></div>
        </div>
        <div className="admin-audit-diff__pane">
          <Typography.Text strong>After</Typography.Text>
          <div>Status: <Tag color="blue">{details.after.status}</Tag></div>
        </div>
      </div>
    )
  }

  return (
    <Alert
      type="warning"
      showIcon
      title="Audit details unavailable"
      description="Structured change details for this entry were redacted or unavailable."
    />
  )
}

export default function AdminAuditLogsPage() {
  const [actorIdInput, setActorIdInput] = useState('')
  const [actionInput, setActionInput] = useState('ALL')
  const [entityTypeInput, setEntityTypeInput] = useState('ALL')
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [filterError, setFilterError] = useState<string | null>(null)

  const [appliedFilters, setAppliedFilters] = useState<Omit<AuditLogQuery, 'page' | 'size'>>({})
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE)
  const [reloadTick, setReloadTick] = useState(0)

  const listQuery = useMemo<AuditLogQuery>(() => ({
    ...appliedFilters,
    page,
    size,
  }), [appliedFilters, page, size])

  const listKey = useMemo(() => JSON.stringify({ listQuery, reloadTick }), [listQuery, reloadTick])
  const [listState, setListState] = useState<{ key: string; data?: AdminPage<AuditLog>; error?: string }>({ key: '' })
  const loadingList = listState.key !== listKey

  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [detailTick, setDetailTick] = useState(0)
  const detailKey = selectedLogId ? `${selectedLogId}:${detailTick}` : ''
  const [detailState, setDetailState] = useState<{ key: string; entry?: AuditLog; error?: string }>({ key: '' })
  const loadingDetail = Boolean(selectedLogId) && detailState.key !== detailKey
  const activeEntry = selectedLogId && detailState.key === detailKey ? detailState.entry : undefined
  const detailError = selectedLogId && detailState.key === detailKey ? detailState.error : undefined

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    listAdminAuditLogs(listQuery, controller.signal)
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
        setListState({ key: listKey, error: formatAdminError(cause, 'Could not load audit logs.') })
      })
    return () => { active = false; controller.abort() }
  }, [listKey, listQuery, page])

  useEffect(() => {
    if (!selectedLogId) return
    const controller = new AbortController()
    let active = true
    getAdminAuditLog(selectedLogId, controller.signal)
      .then((entry) => {
        if (!active || controller.signal.aborted) return
        setDetailState({ key: detailKey, entry })
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return
        setDetailState({ key: detailKey, error: formatAdminError(cause, 'Could not load audit log details.') })
      })
    return () => { active = false; controller.abort() }
  }, [detailKey, selectedLogId])

  const hasActiveFilters = Boolean(
    appliedFilters.actor_id || appliedFilters.action || appliedFilters.entity_type || appliedFilters.from || appliedFilters.to,
  )

  function applyFilters() {
    const trimmedActor = actorIdInput.trim()
    if (trimmedActor && !isUuid(trimmedActor)) {
      setFilterError('Actor ID must be a valid UUID.')
      return
    }
    const fromIso = fromInput ? parseLocalDateTimeToIso(fromInput) : null
    const toIso = toInput ? parseLocalDateTimeToIso(toInput) : null
    if (fromInput && !fromIso) {
      setFilterError('Start date/time is invalid.')
      return
    }
    if (toInput && !toIso) {
      setFilterError('End date/time is invalid.')
      return
    }
    if (fromIso && toIso && Date.parse(fromIso) > Date.parse(toIso)) {
      setFilterError('Start date/time must be earlier than or equal to end date/time.')
      return
    }

    setFilterError(null)
    setAppliedFilters({
      ...(trimmedActor ? { actor_id: trimmedActor } : {}),
      ...(actionInput !== 'ALL' ? { action: actionInput } : {}),
      ...(entityTypeInput !== 'ALL' ? { entity_type: entityTypeInput } : {}),
      ...(fromIso ? { from: fromIso } : {}),
      ...(toIso ? { to: toIso } : {}),
    })
    setPage(1)
  }

  function resetFilters() {
    setActorIdInput('')
    setActionInput('ALL')
    setEntityTypeInput('ALL')
    setFromInput('')
    setToInput('')
    setFilterError(null)
    setAppliedFilters({})
    setPage(1)
  }

  function openAuditLog(logId: string) {
    setSelectedLogId(logId)
    setDetailTick(value => value + 1)
  }

  const pageData = listState.data
  const items = pageData?.items ?? []

  return (
    <section className="tutor-page">
      <div className="admin-page__header">
        <div>
          <h1>Audit Logs</h1>
          <p>Read-only trail of administrative actions recorded by the LMS. Audit entries cannot be edited or deleted.</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => setReloadTick(value => value + 1)} disabled={loadingList}>
          Refresh
        </Button>
      </div>

      <div className="tutor-panel">
        <form
          className="admin-filters"
          onSubmit={(event) => { event.preventDefault(); applyFilters() }}
        >
          <div className="admin-filter-field admin-filter-field--wide">
            <label htmlFor="admin-audit-actor">Actor UUID</label>
            <Input
              id="admin-audit-actor"
              placeholder="Optional actor UUID"
              value={actorIdInput}
              onChange={(event) => {
                setActorIdInput(event.target.value)
                if (filterError) setFilterError(null)
              }}
              allowClear
            />
          </div>

          <div className="admin-filter-field">
            <label htmlFor="admin-audit-action">Action</label>
            <Select
              id="admin-audit-action"
              aria-label="Filter by audit action"
              value={actionInput}
              onChange={(value: string) => setActionInput(value)}
              options={ACTION_OPTIONS}
            />
          </div>

          <div className="admin-filter-field">
            <label htmlFor="admin-audit-entity-type">Entity Type</label>
            <Select
              id="admin-audit-entity-type"
              aria-label="Filter by entity type"
              value={entityTypeInput}
              onChange={(value: string) => setEntityTypeInput(value)}
              options={ENTITY_TYPE_OPTIONS}
            />
          </div>

          <div className="admin-filter-field">
            <label htmlFor="admin-audit-from">From (inclusive)</label>
            <input
              id="admin-audit-from"
              type="datetime-local"
              className="admin-datetime-input"
              value={fromInput}
              onChange={(event) => {
                setFromInput(event.target.value)
                if (filterError) setFilterError(null)
              }}
            />
          </div>

          <div className="admin-filter-field">
            <label htmlFor="admin-audit-to">To (inclusive)</label>
            <input
              id="admin-audit-to"
              type="datetime-local"
              className="admin-datetime-input"
              value={toInput}
              onChange={(event) => {
                setToInput(event.target.value)
                if (filterError) setFilterError(null)
              }}
            />
          </div>

          <div className="admin-filter-actions">
            <Button type="primary" htmlType="submit">Apply filters</Button>
            <Button
              onClick={resetFilters}
              disabled={!hasActiveFilters && !actorIdInput && actionInput === 'ALL' && entityTypeInput === 'ALL' && !fromInput && !toInput}
            >
              Reset
            </Button>
          </div>
        </form>

        {filterError && (
          <Alert type="error" showIcon title={filterError} style={{ marginBottom: 16 }} />
        )}

        {loadingList ? (
          <div className="tutor-page__loading" role="status" aria-label="Loading audit logs">
            <Spin />
          </div>
        ) : listState.error ? (
          <Alert
            type="error"
            showIcon
            title="Could not load audit logs"
            description={listState.error}
            action={<Button onClick={() => setReloadTick(value => value + 1)}>Retry</Button>}
          />
        ) : items.length === 0 ? (
          <Empty
            description={hasActiveFilters ? 'No audit logs match the current filters.' : 'No audit logs have been recorded yet.'}
          >
            {hasActiveFilters && <Button onClick={resetFilters}>Clear filters</Button>}
          </Empty>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="tutor-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Actor UUID</th>
                    <th>Change Summary</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.audit_log_id} className={selectedLogId === entry.audit_log_id ? 'is-selected' : undefined}>
                      <td>{formatAdminTimestamp(entry.created_at)}</td>
                      <td><Tag>{entry.action}</Tag></td>
                      <td>
                        <div><strong>{entry.entity_type}</strong></div>
                        <div className="admin-mono">{entry.entity_id}</div>
                      </td>
                      <td><span className="admin-mono">{entry.actor_id}</span></td>
                      <td>{summarizeDetails(entry.details)}</td>
                      <td>
                        <Button size="small" onClick={() => openAuditLog(entry.audit_log_id)}>
                          View
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
                  Showing {items.length} of {pageData.total_items} entr{pageData.total_items === 1 ? 'y' : 'ies'}
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
        title="Audit Log Entry"
        open={Boolean(selectedLogId)}
        onClose={() => setSelectedLogId(null)}
        size="large"
      >
        {loadingDetail ? (
          <div className="tutor-page__loading" role="status" aria-label="Loading audit log details">
            <Spin />
          </div>
        ) : detailError ? (
          <Alert
            type="error"
            showIcon
            title="Could not load audit log details"
            description={detailError}
            action={<Button onClick={() => setDetailTick(value => value + 1)}>Retry</Button>}
          />
        ) : activeEntry ? (
          <div className="admin-drawer-section">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Audit Log ID">
                <span className="admin-mono">{activeEntry.audit_log_id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Timestamp">{formatAdminTimestamp(activeEntry.created_at)}</Descriptions.Item>
              <Descriptions.Item label="Action"><Tag>{activeEntry.action}</Tag></Descriptions.Item>
              <Descriptions.Item label="Actor UUID">
                <span className="admin-mono">{activeEntry.actor_id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Entity Type">{activeEntry.entity_type}</Descriptions.Item>
              <Descriptions.Item label="Entity UUID">
                <span className="admin-mono">{activeEntry.entity_id}</span>
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Typography.Text strong>Recorded Change Details</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <AuditDetailsView details={activeEntry.details} />
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </section>
  )
}
