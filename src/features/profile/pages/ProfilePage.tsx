import { Alert, Button, ConfigProvider } from 'antd'
import { useEffect, useRef } from 'react'
import { fe2Theme } from '@/app/theme'
import { ConnectedWorkspaces } from '../components/ConnectedWorkspaces'
import { ProfileSummary } from '../components/ProfileSummary'
import { ProfileForm } from '../components/ProfileForm'
import { useProfile } from '../hooks/useProfile'
import '@/styles/profile.css'

export default function ProfilePage() {
  const { data, reload, edit, cancel, save } = useProfile()
  const status = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (data.phase === 'saved-unverified' || data.phase === 'ready' && data.notice) status.current?.focus()
  }, [data])
  return <ConfigProvider theme={fe2Theme}>
    <div className="profile-page">
      <div className="profile-heading"><div><h1>My profile</h1><p className="profile-muted">Manage your central account information.</p></div>{data.phase === 'ready' && <Button type="primary" onClick={edit}>Edit profile</Button>}</div>
      {data.phase === 'loading' && <div className="profile-card" role="status">Loading your profile…</div>}
      {data.phase === 'error' && <div className="profile-card"><Alert type="error" title={data.message} role="alert" showIcon action={<Button onClick={() => { void reload() }}>Retry</Button>} /></div>}
      {data.phase === 'ready' && data.notice && <div ref={status} role="status" tabIndex={-1} className="profile-feedback"><Alert type="success" title={data.notice} showIcon role="presentation" /></div>}
      {data.phase === 'saved-unverified' && <div ref={status} role="alert" tabIndex={-1} className="profile-feedback"><Alert type="warning" title="Your update was accepted, but the latest profile could not be loaded. Reload your profile to confirm the saved values." role="presentation" showIcon /></div>}
      {'user' in data && <div className="profile-grid">
        {data.phase === 'ready' ? <ProfileSummary user={data.user} /> : <div>
          <ProfileForm user={data.user} busy={data.phase === 'saving' || data.phase === 'reloading'} locked={data.phase === 'saved-unverified'} feedback={data.feedback} onSave={save} onCancel={cancel} />
          {(data.phase === 'saved-unverified' || data.phase === 'reloading' || data.phase === 'editing' && data.feedback) && <div className="profile-reload"><Button onClick={() => { void reload() }} disabled={data.phase === 'reloading'}>Reload profile</Button><p className="profile-muted">Reload replaces your draft with the latest saved profile.</p></div>}
        </div>}
        <ConnectedWorkspaces />
      </div>}
    </div>
  </ConfigProvider>
}
