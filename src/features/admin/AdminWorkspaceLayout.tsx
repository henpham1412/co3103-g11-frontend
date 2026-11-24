import { AuditOutlined, BarChartOutlined, BookOutlined, FlagOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button } from 'antd'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import '@/components/layout/tutor-workspace-layout.css'

const sections = [
  { path: '/admin/users', label: 'User Access', icon: <UserOutlined aria-hidden /> },
  { path: '/admin/content-reports', label: 'Content Reports', icon: <FlagOutlined aria-hidden /> },
  { path: '/admin/reports', label: 'Operational Reports', icon: <BarChartOutlined aria-hidden /> },
  { path: '/admin/audit-logs', label: 'Audit Logs', icon: <AuditOutlined aria-hidden /> },
]

export default function AdminWorkspaceLayout() {
  const { state, logout } = useAuth()
  const { pathname } = useLocation()
  const name = state.status === 'authenticated' ? state.user.fullName : ''
  const current = sections.find(section => section.path === pathname)?.label ?? 'Administration'
  return <div className="tutor-workspace">
    <aside className="tutor-workspace__sidebar">
      <Link to="/" className="tutor-workspace__brand"><span><BookOutlined aria-hidden /></span>G11 LMS</Link>
      <div className="tutor-workspace__section">ADMINISTRATOR</div>
      <nav aria-label="Administrator navigation">{sections.map(section =>
        <NavLink key={section.path} to={section.path}
          className={({ isActive }) => `tutor-workspace__nav-item${isActive ? ' is-active' : ''}`}>
          {section.icon}<span>{section.label}</span>
        </NavLink>)}</nav>
    </aside>
    <section className="tutor-workspace__main">
      <header className="tutor-workspace__topbar">
        <div><span>Administrator Workspace</span><b>›</b><strong>{current}</strong></div>
        <div className="tutor-workspace__account"><Avatar size={30}>{name.charAt(0)}</Avatar><span>{name}</span>
          <Button type="text" size="small" onClick={() => void logout('signed-out')}>Sign out</Button></div>
      </header>
      <main className="tutor-workspace__content"><Outlet /></main>
    </section>
  </div>
}
