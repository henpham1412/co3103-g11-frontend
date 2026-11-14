import { ArrowRightOutlined, LockOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'

export function SecurityCard() {
  return <section className="profile-card" aria-labelledby="security-title">
    <div className="profile-card-heading">
      <h2 id="security-title">Security</h2>
      <p className="profile-muted">Manage security settings and password recovery for this account.</p>
    </div>
    <Link className="profile-recovery" to="/forgot-password"><LockOutlined aria-hidden="true" />Password Recovery<ArrowRightOutlined aria-hidden="true" /></Link>
  </section>
}
