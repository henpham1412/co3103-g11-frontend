import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import '@/styles/app-layout.css'

export function AuthenticatedLayout() {
  return (
    <div className="app-layout">
      <AppHeader />
      <main className="app-main"><Outlet /></main>
    </div>
  )
}
