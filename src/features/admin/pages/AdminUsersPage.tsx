import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Descriptions, Drawer, Empty, Input, Pagination, Select, Space, Spin, Tag, Typography } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { LmsRole } from '@/types/auth'
import { useAdminAccess } from '../access/AdminAccessContext'
import { getAdminUser, listAdminUsers, updateAdminUserAccess } from '../api/adminApi'
import { formatAdminError, formatAdminTimestamp } from '../adminFormat'
import type { AdminUser, AdminUserPage, LocalAccessStatus, UserAccessPatch, UserListQuery } from '../types'
import '../admin-pages.css'

const DEFAULT_PAGE_SIZE = 20
const DEFAULT_SORT: NonNullable<UserListQuery['sort']> = 'created_at,desc'

const ROLE_OPTIONS: { value: LmsRole; label: string }[] = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'TUTOR', label: 'Tutor' },
  { value: 'ADMINISTRATOR', label: 'Administrator' },
]

const STATUS_OPTIONS: { value: LocalAccessStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
]

const SORT_OPTIONS: { value: NonNullable<UserListQuery['sort']>; label: string }[] = [
  { value: 'created_at,desc', label: 'Newest created' },
  { value: 'created_at,asc', label: 'Oldest created' },
  { value: 'updated_at,desc', label: 'Recently updated' },
  { value: 'full_name,asc', label: 'Name (A–Z)' },
  { value: 'full_name,desc', label: 'Name (Z–A)' },
  { value: 'email,asc', label: 'Email (A–Z)' },
  { value: 'lms_role,asc', label: 'Role (A–Z)' },
  { value: 'access_status,asc', label: 'Status (A–Z)' },
  { value: 'last_login_at,desc', label: 'Last login (newest)' },
]

function roleColor(role: LmsRole): string {
  if (role === 'ADMINISTRATOR') return 'purple'
  if (role === 'TUTOR') return 'blue'
  return 'default'
}

export default function AdminUsersPage() {
  const { state: authState } = useAuth()
  const { revokeAccess } = useAdminAccess()
  const navigate = useNavigate()
  const currentUserId = authState.status === 'authenticated' ? authState.user.userId : ''

  const [searchInput, setSearchInput] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<LmsRole | 'ALL'>('ALL')
  const [statusFilter, setStatusFilter] = useState<LocalAccessStatus | 'ALL'>('ALL')
  const [sort, setSort] = useState<NonNullable<UserListQuery['sort']>>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE)
  const [reloadTick, setReloadTick] = useState(0)

  const listQuery = useMemo<UserListQuery>(() => ({
    ...(appliedQuery ? { q: appliedQuery } : {}),
    ...(roleFilter !== 'ALL' ? { lms_role: roleFilter } : {}),
    ...(statusFilter !== 'ALL' ? { access_status: statusFilter } : {}),
    page,
    size,
    sort,
  }), [appliedQuery, roleFilter, statusFilter, page, size, sort])

  const listKey = useMemo(
    () => JSON.stringify({ listQuery, reloadTick }),
    [listQuery, reloadTick],
  )
  const [listState, setListState] = useState<{ key: string; data?: AdminUserPage; error?: string }>({ key: '' })
  const loadingList = listState.key !== listKey

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [detailTick, setDetailTick] = useState(0)
  const detailKey = selectedUserId ? `${selectedUserId}:${detailTick}` : ''
  const [detailState, setDetailState] = useState<{ key: string; user?: AdminUser; error?: string }>({ key: '' })
  const loadingDetail = Boolean(selectedUserId) && detailState.key !== detailKey
  const activeUser = selectedUserId && detailState.key === detailKey ? detailState.user : undefined
  const detailError = selectedUserId && detailState.key === detailKey ? detailState.error : undefined

  const [draft, setDraft] = useState<{ userId: string; lms_role: LmsRole; access_status: LocalAccessStatus } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)
  const mutationInFlightRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    listAdminUsers(listQuery, controller.signal)
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
        setListState({ key: listKey, error: formatAdminError(cause, 'Could not load users.') })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [listKey, listQuery, page])

  useEffect(() => {
    if (!selectedUserId) return
    const controller = new AbortController()
    let active = true
    getAdminUser(selectedUserId, controller.signal)
      .then((user) => {
        if (!active || controller.signal.aborted) return
        setDetailState({ key: detailKey, user })
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return
        setDetailState({ key: detailKey, error: formatAdminError(cause, 'Could not load user details.') })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [detailKey, selectedUserId])

  const effectiveDraft = useMemo(() => (
    activeUser
      ? (draft && draft.userId === activeUser.user_id
          ? draft
          : { userId: activeUser.user_id, lms_role: activeUser.lms_role, access_status: activeUser.access_status })
      : null
  ), [activeUser, draft])

  const patchPayload = useMemo<UserAccessPatch>(() => {
    if (!activeUser || !effectiveDraft) return {}
    const next: UserAccessPatch = {}
    if (effectiveDraft.lms_role !== activeUser.lms_role) next.lms_role = effectiveDraft.lms_role
    if (effectiveDraft.access_status !== activeUser.access_status) next.access_status = effectiveDraft.access_status
    return next
  }, [activeUser, effectiveDraft])

  const hasChanges = patchPayload.lms_role !== undefined || patchPayload.access_status !== undefined
  const isSelfTarget = Boolean(activeUser && currentUserId && activeUser.user_id.toLowerCase() === currentUserId.toLowerCase())
  const wouldRemoveOwnAdminAccess = Boolean(
    isSelfTarget && effectiveDraft && (effectiveDraft.lms_role !== 'ADMINISTRATOR' || effectiveDraft.access_status !== 'ACTIVE'),
  )

  const hasActiveFilters = Boolean(appliedQuery || roleFilter !== 'ALL' || statusFilter !== 'ALL' || sort !== DEFAULT_SORT)

  function applySearch() {
    const cleaned = searchInput.replace(/\0/g, '').trim()
    setSearchInput(cleaned)
    setAppliedQuery(cleaned)
    setPage(1)
  }

  function resetFilters() {
    setSearchInput('')
    setAppliedQuery('')
    setRoleFilter('ALL')
    setStatusFilter('ALL')
    setSort(DEFAULT_SORT)
    setPage(1)
  }

  function openUserDrawer(userId: string) {
    setSelectedUserId(userId)
    setDetailTick(value => value + 1)
    setDraft(null)
    setConfirming(false)
    setMutationError(null)
    setSuccessNotice(null)
  }

  function closeDrawer() {
    if (saving) return
    setSelectedUserId(null)
    setDraft(null)
    setConfirming(false)
    setMutationError(null)
  }

  async function handleConfirmSave() {
    if (!activeUser || !hasChanges || mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setSaving(true)
    setMutationError(null)
    setSuccessNotice(null)
    const targetId = activeUser.user_id
    const actorUserId = currentUserId
    const revokeForCurrentSession = revokeAccess
    try {
      const updated = await updateAdminUserAccess(targetId, patchPayload)

      if (actorUserId && updated.user_id.toLowerCase() === actorUserId.toLowerCase()
        && (updated.lms_role !== 'ADMINISTRATOR' || updated.access_status !== 'ACTIVE')) {
        // Revoke this session's local LMS admin UI immediately even if the user navigated to another Admin page while PATCH was pending.
        const revoked = revokeForCurrentSession()
        if (revoked && mountedRef.current) {
          navigate('/', { replace: true })
        }
        return
      }

      if (!mountedRef.current) return

      setDetailState({ key: detailKey, user: updated })
      setDraft({ userId: updated.user_id, lms_role: updated.lms_role, access_status: updated.access_status })
      setConfirming(false)
      setSuccessNotice(`Updated local LMS access for ${updated.full_name}.`)
      setReloadTick(value => value + 1)
    } catch (cause: unknown) {
      if (!mountedRef.current) return
      setMutationError(formatAdminError(cause, 'Could not update user access.'))
      setConfirming(false)
    } finally {
      mutationInFlightRef.current = false
      if (mountedRef.current) setSaving(false)
    }
  }

  const pageData = listState.data
  const items = pageData?.items ?? []

  return (
    <section className="tutor-page">
      <div className="admin-page__header">
        <div>
          <h1>User Access Management</h1>
          <p>Manage LMS-local roles and access status. Global identity accounts and passwords remain in Central Identity.</p>
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
        <form
          className="admin-filters"
          onSubmit={(event) => { event.preventDefault(); applySearch() }}
        >
          <div className="admin-filter-field admin-filter-field--wide">
            <label htmlFor="admin-users-search">Search user</label>
            <Input
              id="admin-users-search"
              placeholder="Search by full name, email, or user UUID"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              prefix={<SearchOutlined aria-hidden />}
              allowClear
              onClear={() => { setSearchInput(''); setAppliedQuery(''); setPage(1) }}
            />
          </div>

          <div className="admin-filter-field">
            <label htmlFor="admin-users-role">LMS Role</label>
            <Select
              id="admin-users-role"
              aria-label="Filter by LMS role"
              value={roleFilter}
              onChange={(value: LmsRole | 'ALL') => { setRoleFilter(value); setPage(1) }}
              options={[{ value: 'ALL', label: 'All roles' }, ...ROLE_OPTIONS]}
            />
          </div>

          <div className="admin-filter-field">
            <label htmlFor="admin-users-status">Access Status</label>
            <Select
              id="admin-users-status"
              aria-label="Filter by access status"
              value={statusFilter}
              onChange={(value: LocalAccessStatus | 'ALL') => { setStatusFilter(value); setPage(1) }}
              options={[{ value: 'ALL', label: 'All statuses' }, ...STATUS_OPTIONS]}
            />
          </div>

          <div className="admin-filter-field">
            <label htmlFor="admin-users-sort">Sort by</label>
            <Select
              id="admin-users-sort"
              aria-label="Sort users"
              value={sort}
              onChange={(value: NonNullable<UserListQuery['sort']>) => { setSort(value); setPage(1) }}
              options={SORT_OPTIONS}
            />
          </div>

          <div className="admin-filter-actions">
            <Button type="primary" htmlType="submit">Search</Button>
            <Button onClick={resetFilters} disabled={!hasActiveFilters && !searchInput}>Reset</Button>
          </div>
        </form>

        {loadingList ? (
          <div className="tutor-page__loading" role="status" aria-label="Loading users">
            <Spin />
          </div>
        ) : listState.error ? (
          <Alert
            type="error"
            showIcon
            title="Could not load user access records"
            description={listState.error}
            action={<Button onClick={() => setReloadTick(value => value + 1)}>Retry</Button>}
          />
        ) : items.length === 0 ? (
          <Empty
            description={hasActiveFilters ? 'No users match the current filters.' : 'No LMS user access records found.'}
          >
            {hasActiveFilters && <Button onClick={resetFilters}>Clear filters</Button>}
          </Empty>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="tutor-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>LMS Role</th>
                    <th>Access Status</th>
                    <th>Last Login</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((user) => (
                    <tr key={user.user_id} className={selectedUserId === user.user_id ? 'is-selected' : undefined}>
                      <td>
                        <div><strong>{user.full_name}</strong></div>
                        <div>{user.email}</div>
                        <div className="admin-mono">{user.user_id}</div>
                      </td>
                      <td><Tag color={roleColor(user.lms_role)}>{user.lms_role}</Tag></td>
                      <td>
                        <Tag color={user.access_status === 'ACTIVE' ? 'green' : 'red'}>
                          {user.access_status}
                        </Tag>
                      </td>
                      <td>{formatAdminTimestamp(user.last_login_at, 'Never')}</td>
                      <td>{formatAdminTimestamp(user.updated_at)}</td>
                      <td>
                        <Button size="small" onClick={() => openUserDrawer(user.user_id)}>
                          Manage
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
                  Showing {items.length} of {pageData.total_items} user{pageData.total_items === 1 ? '' : 's'}
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
        title="Manage LMS User Access"
        open={Boolean(selectedUserId)}
        onClose={closeDrawer}
        size="large"
        mask={{ closable: !saving }}
      >
        {loadingDetail ? (
          <div className="tutor-page__loading" role="status" aria-label="Loading user details">
            <Spin />
          </div>
        ) : detailError ? (
          <Alert
            type="error"
            showIcon
            title="Could not load user details"
            description={detailError}
            action={<Button onClick={() => setDetailTick(value => value + 1)}>Retry</Button>}
          />
        ) : activeUser && effectiveDraft ? (
          <div className="admin-drawer-section">
            <Alert
              type="info"
              showIcon
              title="LMS-local access scope"
              description="Only LMS role and local access status can be updated here. Global account details are read-only from Central Identity."
            />

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Full Name">{activeUser.full_name}</Descriptions.Item>
              <Descriptions.Item label="Email">{activeUser.email}</Descriptions.Item>
              <Descriptions.Item label="User UUID">
                <span className="admin-mono">{activeUser.user_id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Last Login">{formatAdminTimestamp(activeUser.last_login_at, 'Never')}</Descriptions.Item>
              <Descriptions.Item label="Created">{formatAdminTimestamp(activeUser.created_at)}</Descriptions.Item>
              <Descriptions.Item label="Updated">{formatAdminTimestamp(activeUser.updated_at)}</Descriptions.Item>
            </Descriptions>

            {mutationError && (
              <Alert
                type="error"
                showIcon
                title="Update failed"
                description={mutationError}
              />
            )}

            <div className="admin-filter-field">
              <label htmlFor="admin-edit-role">LMS Role</label>
              <Select
                id="admin-edit-role"
                aria-label="Edit LMS role"
                value={effectiveDraft.lms_role}
                disabled={saving}
                onChange={(value: LmsRole) => {
                  setDraft({ userId: activeUser.user_id, lms_role: value, access_status: effectiveDraft.access_status })
                  setConfirming(false)
                  setMutationError(null)
                }}
                options={ROLE_OPTIONS}
              />
            </div>

            <div className="admin-filter-field">
              <label htmlFor="admin-edit-status">Access Status</label>
              <Select
                id="admin-edit-status"
                aria-label="Edit access status"
                value={effectiveDraft.access_status}
                disabled={saving}
                onChange={(value: LocalAccessStatus) => {
                  setDraft({ userId: activeUser.user_id, lms_role: effectiveDraft.lms_role, access_status: value })
                  setConfirming(false)
                  setMutationError(null)
                }}
                options={STATUS_OPTIONS}
              />
            </div>

            {!confirming ? (
              <Space>
                <Button
                  type="primary"
                  disabled={!hasChanges || saving}
                  onClick={() => { setMutationError(null); setConfirming(true) }}
                >
                  Review changes
                </Button>
                <Button onClick={closeDrawer} disabled={saving}>Close</Button>
              </Space>
            ) : (
              <div className={`admin-confirm-box${wouldRemoveOwnAdminAccess ? ' admin-confirm-box--danger' : ''}`}>
                <Typography.Text strong>Confirm access update</Typography.Text>
                <div>
                  {patchPayload.lms_role !== undefined && (
                    <div>Role: <strong>{activeUser.lms_role}</strong> → <strong>{patchPayload.lms_role}</strong></div>
                  )}
                  {patchPayload.access_status !== undefined && (
                    <div>Status: <strong>{activeUser.access_status}</strong> → <strong>{patchPayload.access_status}</strong></div>
                  )}
                </div>
                {wouldRemoveOwnAdminAccess && (
                  <Typography.Text type="danger">
                    Warning: You are removing your own active administrator access. Once confirmed, you will leave the administrator workspace immediately while staying signed in to Central Identity.
                  </Typography.Text>
                )}
                <Space>
                  <Button
                    type="primary"
                    danger={wouldRemoveOwnAdminAccess}
                    loading={saving}
                    disabled={saving}
                    onClick={() => void handleConfirmSave()}
                  >
                    Confirm update
                  </Button>
                  <Button onClick={() => setConfirming(false)} disabled={saving}>Cancel</Button>
                </Space>
              </div>
            )}
          </div>
        ) : null}
      </Drawer>
    </section>
  )
}
