import type { PropsWithChildren, ReactNode } from 'react'
import { ConfigProvider } from 'antd'
import { fe2Theme } from '@/app/theme'
import { AuthHeader } from './AuthHeader'

interface AuthLayoutProps extends PropsWithChildren {
  variant?: 'login' | 'register' | 'recovery'
  notice?: ReactNode
}

export function AuthLayout({ children, variant = 'login', notice }: AuthLayoutProps) {
  const layout = (
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
  return variant === 'recovery' ? <ConfigProvider theme={fe2Theme}>{layout}</ConfigProvider> : layout
}
