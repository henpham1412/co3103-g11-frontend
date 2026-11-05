import type { PropsWithChildren, ReactNode } from 'react'
import { AuthHeader } from './AuthHeader'

interface AuthLayoutProps extends PropsWithChildren {
  variant?: 'login' | 'register'
  notice?: ReactNode
}

export function AuthLayout({ children, variant = 'login', notice }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <AuthHeader />
      <main className="auth-main">
        <div className={'auth-content auth-content--' + variant}>
          {notice}
          <section className="auth-card" aria-labelledby="auth-title">{children}</section>
        </div>
      </main>
    </div>
  )
}
