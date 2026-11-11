import { CameraOutlined, CheckCircleFilled, LogoutOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useState } from 'react'
import type { User } from '@/types/auth'
import { isSafeAvatarUrl, normalizeAvatarUrl } from '../utils/profileValidation'

function ProfileAvatar({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase()
  if (!failed && url && isSafeAvatarUrl(url)) return <img className="profile-avatar" src={normalizeAvatarUrl(url)} alt={`${name}'s avatar`} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  return <span className="profile-avatar profile-initials" role="img" aria-label={`${name}'s avatar placeholder`}>{initials}</span>
}

interface Props {
  user: User
  onEdit?: () => void
  onSignOut: () => void
}

export function ProfileSummary({ user, onEdit, onSignOut }: Props) {
  return <section className="profile-card profile-summary" aria-labelledby="profile-summary-title">
    <div className="profile-identity">
      <div className="profile-avatar-container">
        <ProfileAvatar key={user.profile?.avatarUrl ?? ''} url={user.profile?.avatarUrl} name={user.fullName} />
        {onEdit && <Button className="profile-avatar-edit" shape="circle" icon={<CameraOutlined aria-hidden="true" />} aria-label="Edit profile" onClick={onEdit} />}
      </div>
      <div className="profile-identity-copy">
        <h1 id="profile-summary-title">{user.fullName}</h1>
        <div className="profile-badges">
          <span className="profile-status" data-status={user.status}><span className="profile-status-dot" aria-hidden="true" />{user.status}</span>
          {/* Global identity does not establish an LMS-local role. */}
          <span className="profile-account-badge">Account</span>
        </div>
        <p className="profile-email"><span>{user.email}</span><CheckCircleFilled className="profile-email-check" aria-hidden="true" /></p>
      </div>
    </div>
    <Button className="profile-sign-out" icon={<LogoutOutlined aria-hidden="true" />} onClick={onSignOut}>Sign Out</Button>
  </section>
}
