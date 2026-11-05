import { Alert, Button, ConfigProvider } from 'antd'
import { useEffect, useRef } from 'react'
import { fe2Theme } from '@/app/theme'
import { useAuth } from '@/hooks/useAuth'
import { ProfileSummary } from '../components/ProfileSummary'
import { ProfileForm } from '../components/ProfileForm'
import { SecurityCard } from '../components/SecurityCard'
import { useProfile } from '../hooks/useProfile'
import '@/styles/profile.css'

export default function ProfilePage() {
  const { data, formRevision, reload, edit, cancel, save } = useProfile()
  const { state, logout } = useAuth()
  const user = 'user' in data ? data.user : state.status === 'authenticated' ? state.user : null
  const canEdit = data.phase === 'ready' || data.phase === 'editing'
  const status = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (data.phase === 'saved-unverified' || data.phase === 'ready' && data.notice) status.current?.focus()
  }, [data])
  return <ConfigProvider theme={fe2Theme}>
    <div className="profile-page">
      {user && <ProfileSummary user={user} onSignOut={() => { void logout('signed-out') }} onEdit={canEdit ? () => {
        edit()
        const avatar = document.getElementById('profile_avatarUrl')
        avatar?.closest('details')?.setAttribute('open', '')
        avatar?.focus()
      } : undefined} />}
      {data.phase === 'loading' && <div className="profile-card" role="status">Loading your profile…</div>}
      {data.phase === 'error' && <div className="profile-card"><Alert type="error" title={data.message} role="alert" showIcon action={<Button onClick={() => { void reload() }}>Retry</Button>} /></div>}
      {data.phase === 'ready' && data.notice && <div ref={status} role="status" tabIndex={-1} className="profile-feedback"><Alert type="success" title={data.notice} showIcon role="presentation" /></div>}
      {data.phase === 'saved-unverified' && <div ref={status} role="alert" tabIndex={-1} className="profile-feedback"><Alert type="warning" title="Your update was accepted, but the latest profile could not be loaded. Reload your profile to confirm the saved values." role="presentation" showIcon /></div>}
      {'user' in data && <div className="profile-grid">
        <div className="profile-editor">
          <ProfileForm key={`${data.sessionId}:${formRevision}`} user={data.user} busy={data.phase === 'saving' || data.phase === 'reloading'} locked={data.phase === 'saved-unverified'} feedback={data.feedback} onEdit={edit} onSave={save} onCancel={cancel} />
          {(data.phase === 'saved-unverified' || data.phase === 'reloading' || data.phase === 'editing' && data.feedback) && <div className="profile-reload"><Button onClick={() => { void reload() }} disabled={data.phase === 'reloading'}>Reload profile</Button><p className="profile-muted">Reload replaces your draft with the latest saved profile.</p></div>}
        </div>
        <aside className="profile-sidebar" aria-label="Account information"><SecurityCard /></aside>
      </div>}
    </div>
  </ConfigProvider>
}
