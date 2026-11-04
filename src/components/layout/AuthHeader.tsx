import { Link } from 'react-router-dom'

export function AuthHeader() {
  return (
    <header className="auth-header">
      <div className="auth-brand">
        <Link className="auth-brand-link" to="/" aria-label="G11 LMS home">
          <span className="auth-logo" aria-hidden="true">G11</span>
          <span>G11 LMS</span>
        </Link>
        <span className="auth-brand-divider" aria-hidden="true">|</span>
        <span className="auth-brand-description">Learning Management System</span>
      </div>
      <span className="auth-instance">Instance: Private Tutoring Workspace</span>
    </header>
  )
}
