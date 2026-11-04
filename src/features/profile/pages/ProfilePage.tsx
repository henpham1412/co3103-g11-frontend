import { Alert, Button, ConfigProvider } from 'antd'
import { fe2Theme } from '@/app/theme'
import { ConnectedWorkspaces } from '../components/ConnectedWorkspaces'
import { ProfileSummary } from '../components/ProfileSummary'
import { useProfile } from '../hooks/useProfile'
import '@/styles/profile.css'

export default function ProfilePage() {
  const { data, reload } = useProfile()
  return <ConfigProvider theme={fe2Theme}>
    <div className="profile-page">
      <div className="profile-heading"><div><h1>My profile</h1><p className="profile-muted">Manage your central account information.</p></div></div>
      {data.phase === 'loading' && <div className="profile-card" role="status">Loading your profile…</div>}
      {data.phase === 'error' && <div className="profile-card"><Alert type="error" title={data.message} role="alert" showIcon action={<Button onClick={() => { void reload() }}>Retry</Button>} /></div>}
      {data.phase === 'ready' && <div className="profile-grid"><ProfileSummary user={data.user} /><ConnectedWorkspaces /></div>}
    </div>
  </ConfigProvider>
}
