import { Button, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function AppHeader() {
  const { state, logout } = useAuth()
  if (state.status !== 'authenticated') return null
  const { user } = state

  return (
    <header className="app-header">
      <Link className="app-brand" to="/" aria-label="G11 LMS home">
        <span className="app-logo" aria-hidden="true">G11</span>
        <span>G11 LMS</span>
      </Link>
      <div className="app-header-actions">
        <div className="app-profile">
          <div className="app-profile-details">
            <strong>{user.fullName}</strong>
            <span className="app-profile-email">{user.email}</span>
          </div>
          <Tag color={user.status === 'ACTIVE' ? 'success' : 'default'} variant="solid">{user.status}</Tag>
        </div>
        <Button onClick={() => { void logout('signed-out') }}>Sign Out</Button>
      </div>
    </header>
  )
}
