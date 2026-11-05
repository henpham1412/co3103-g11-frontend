import { ArrowRightOutlined, DesktopOutlined, LockOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'

function currentDevice() {
  const agent = navigator.userAgent
  const browser = /Edg\//.test(agent) ? 'Edge' : /OPR\//.test(agent) ? 'Opera'
    : /Firefox\/|FxiOS\//.test(agent) ? 'Firefox' : /Chrome\/|CriOS\//.test(agent) ? 'Chrome'
      : /Safari\//.test(agent) ? 'Safari' : 'Current browser'
  const os = /Macintosh|Mac OS X/.test(agent) ? 'macOS' : /Android/.test(agent) ? 'Android' : /iPhone|iPad|iPod/.test(agent) ? 'iOS'
    : /Windows/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : null
  return os ? `${browser} on ${os}` : browser
}

export function SecuritySessions() {
  return <section className="profile-card" aria-labelledby="security-title">
    <div className="profile-card-heading">
      <h2 id="security-title">Security &amp; Sessions</h2>
      <p className="profile-muted">Active sessions and security settings for this account.</p>
    </div>
    <div className="profile-session">
      <span className="profile-item-icon profile-item-icon--device"><DesktopOutlined aria-hidden="true" /></span>
      <div className="profile-item-copy"><h3>Current Session</h3><p>{currentDevice()}</p></div>
      <span className="profile-status" data-status="ACTIVE"><span className="profile-status-dot" aria-hidden="true" />Active now</span>
    </div>
    <Link className="profile-recovery" to="/forgot-password"><LockOutlined aria-hidden="true" />Password Recovery<ArrowRightOutlined aria-hidden="true" /></Link>
  </section>
}
