import { createContext, useContext } from 'react'

export type AdminAccess = 'checking' | 'allowed' | 'denied' | 'error'
export interface AdminAccessValue { access: AdminAccess; recheck(): void; revokeAccess(): void }
export const AdminAccessContext = createContext<AdminAccessValue | undefined>(undefined)
export function useAdminAccess() {
  const context = useContext(AdminAccessContext)
  if (!context) throw new Error('Admin access requires AdminAccessProvider')
  return context
}
