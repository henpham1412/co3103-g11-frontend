import { useAuth } from '@/hooks/useAuth'

export default function App() {
  const { state } = useAuth()
  if (state.status !== 'authenticated') return null
  const { user, session } = state
  const expiresAt = new Date(session.expiresAt)

  return (
    <>
      <section className="app-welcome" aria-labelledby="welcome-title">
        <h1 id="welcome-title">Welcome, {user.fullName}</h1>
        <p>Your G11 LMS learning workspace is ready.</p>
      </section>
      <div className="app-overview">
        <section className="app-card" aria-labelledby="session-title">
          <h2 id="session-title">Session information</h2>
          <dl className="app-session">
            <div><dt>Signed in with</dt><dd>Central Identity Service</dd></div>
            <div><dt>Session type</dt><dd>{session.rememberMe ? 'Remembered on this device' : 'This browser session'}</dd></div>
            <div>
              <dt>Expires (local time)</dt>
              <dd>
                {Number.isNaN(expiresAt.getTime()) ? 'Unavailable' : (
                  <time dateTime={expiresAt.toISOString()}>{expiresAt.toLocaleString()}</time>
                )}
              </dd>
            </div>
          </dl>
        </section>
        <section className="app-card" aria-labelledby="platform-title">
          <h2 id="platform-title">Platform status</h2>
          <p className="app-platform-status">Signed in</p>
          <p>You have access to your authenticated workspace. Course and tutoring features will appear here as they become available.</p>
        </section>
      </div>
    </>
  )
}
