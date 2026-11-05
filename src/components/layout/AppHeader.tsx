import { useState } from 'react'
import { Link, NavLink, useMatch } from 'react-router-dom'
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
  const { state } = useAuth()
  const isProfile = useMatch('/profile') !== null
  if (state.status !== 'authenticated') return null
  const { user } = state

  return (
    <header className="app-header">
      <div className="app-header-context">
        <Link className="app-brand" to="/" aria-label="G11 LMS home">
          <span className="app-logo" aria-hidden="true">G11</span>
          <span>G11 LMS</span>
        </Link>
        <span className="app-header-separator" aria-hidden="true">|</span>
        <nav className="app-breadcrumb" aria-label="Breadcrumb">
          <span>Central Identity</span>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{isProfile ? 'Account Profile' : 'Overview'}</span>
        </nav>
      </div>
      <NavLink className="app-profile" to="/profile" aria-label="My profile">
        <HeaderAvatar key={`${user.userId}:${user.profile?.avatarUrl ?? ''}`} name={user.fullName} url={user.profile?.avatarUrl} />
        <span className="app-profile-name">{user.fullName}</span>
      </NavLink>
    </header>
  )
}
