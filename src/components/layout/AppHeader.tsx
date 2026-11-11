import { useId, useRef, useState } from 'react'
import { DownOutlined } from '@ant-design/icons'
import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { Link, useMatch, useNavigate } from 'react-router-dom'
import { isSafeAvatarUrl, normalizeAvatarUrl } from '@/features/profile/utils/profileValidation'
import { useAuth } from '@/hooks/useAuth'

function HeaderAvatar({ name, url }: { name: string; url?: string | null }) {
  const [failed, setFailed] = useState(false)
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase()

  if (!failed && url && isSafeAvatarUrl(url)) {
    return <img className="app-avatar" src={normalizeAvatarUrl(url)} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  }
  return <span className="app-avatar app-avatar-initials" aria-hidden="true">{initials}</span>
}

export function AppHeader() {
  const { state, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const isProfile = useMatch('/profile') !== null
  if (state.status !== 'authenticated') return null
  const { user } = state
  // Central Identity has no authoritative LMS-local role in this context.
  const profileLabel = `${user.fullName} - Account`
  const items: MenuProps['items'] = [
    {
      key: 'profile',
      label: <Link to="/profile">Account Profile</Link>,
      onClick: ({ domEvent }) => {
        // Ant Design can focus the menu item itself instead of its link.
        if (domEvent.target === domEvent.currentTarget) void navigate('/profile')
      },
    },
    { type: 'divider' },
    { key: 'logout', label: 'Sign Out', danger: true, onClick: () => { void logout() } },
  ]

  return (
    <header className="app-header">
      <div className="app-header-context">
        <Link className="app-brand" to="/" aria-label="G11 LMS home">
          <span className="app-logo" aria-hidden="true">G11</span>
          <span>G11 LMS</span>
        </Link>
        <span className="app-header-separator" aria-hidden="true">|</span>
        <nav className="app-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Central Identity</Link>
          <span className="app-breadcrumb-separator" aria-hidden="true">&gt;</span>
          <span aria-current="page">{isProfile ? 'Account Profile' : 'Overview'}</span>
        </nav>
      </div>
      <Dropdown
        menu={{
          items,
          id: menuId,
          'aria-label': 'Account menu',
          onKeyDown: event => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setMenuOpen(false)
              profileButtonRef.current?.focus()
            }
          },
        }}
        trigger={['click']}
        placement="bottomRight"
        autoFocus
        open={menuOpen}
        onOpenChange={setMenuOpen}
      >
        <button
          ref={profileButtonRef}
          type="button"
          className="app-profile"
          aria-label="My profile"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
        >
          <HeaderAvatar key={`${user.userId}:${user.profile?.avatarUrl ?? ''}`} name={user.fullName} url={user.profile?.avatarUrl} />
          <span className="app-profile-name" title={profileLabel}>{profileLabel}</span>
          <DownOutlined className="app-profile-chevron" aria-hidden="true" />
        </button>
      </Dropdown>
    </header>
  )
}
