import { Button } from 'antd'
import { Link } from 'react-router-dom'
import { AdminAccessProvider } from './access/AdminAccessProvider'
import { useAdminAccess } from './access/AdminAccessContext'

export default function AdminEntry() {
  return <AdminAccessProvider><VerifiedAdminEntry /></AdminAccessProvider>
}

function VerifiedAdminEntry() {
  const { access, recheck } = useAdminAccess()
  if (access === 'allowed') return <Link to="/admin">Administrator workspace</Link>
  if (access === 'error') return <div role="status">Could not verify administrator access. <Button onClick={recheck}>Retry</Button></div>
  return null
}
