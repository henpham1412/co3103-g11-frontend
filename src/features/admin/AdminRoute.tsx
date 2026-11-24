import { Alert, Button, Spin } from 'antd'
import { Link, Outlet } from 'react-router-dom'
import { AdminAccessProvider } from './access/AdminAccessProvider'
import { useAdminAccess } from './access/AdminAccessContext'

export default function AdminRoute() {
  return <AdminAccessProvider><AdminAccessGate /></AdminAccessProvider>
}

function AdminAccessGate() {
  const { access, recheck } = useAdminAccess()
  if (access === 'checking') return <main><div role="status" aria-label="Checking administrator access"><Spin /></div></main>
  if (access === 'denied') return <main><Alert type="warning" showIcon title="Administrator access is not available"
    description="The LMS has not granted active administrator access to this account."
    action={<Link to="/">Back to overview</Link>} /></main>
  if (access === 'error') return <main><Alert type="error" showIcon title="Could not verify administrator access"
    description="Please try again before opening the administrator workspace."
    action={<Button onClick={recheck}>Retry</Button>} /></main>
  return <Outlet />
}
