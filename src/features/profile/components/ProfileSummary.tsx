import { useState } from 'react'
import type { User } from '@/types/auth'
import { isCalendarDate, isSafeAvatarUrl, normalizeAvatarUrl } from '../utils/profileValidation'

function ProfileAvatar({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase()
  if (!failed && url && isSafeAvatarUrl(url)) return <img className="profile-avatar" src={normalizeAvatarUrl(url)} alt={`${name}'s avatar`} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  return <span className="profile-avatar profile-initials" role="img" aria-label={`${name}'s avatar placeholder`}>{initials}</span>
}

export function ProfileSummary({ user }: { user: User }) {
  const { profile } = user
  const dob = profile?.dateOfBirth
  const fields = [
    ['User ID', user.userId], ['Email', user.email], ['Bio', profile?.bio], ['Phone number', profile?.phoneNumber],
    ['Date of birth', dob && isCalendarDate(dob) ? dob : undefined], ['Locale', profile?.locale], ['Timezone', profile?.timezone],
  ]
  return <section className="profile-card" aria-labelledby="profile-summary-title">
    <div className="profile-identity">
      <ProfileAvatar key={profile?.avatarUrl ?? ''} url={profile?.avatarUrl} name={user.fullName} />
      <div><h2 id="profile-summary-title">{user.fullName}</h2><span className="profile-status">{user.status}</span></div>
    </div>
    <dl className="profile-details">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
  </section>
}
