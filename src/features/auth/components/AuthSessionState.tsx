import type { PropsWithChildren } from 'react'
import { Alert, Button, Flex, Space, Spin } from 'antd'
import { useAuth } from '@/hooks/useAuth'

export function AuthSessionState({ children }: PropsWithChildren) {
  const { state, logout } = useAuth()
  if (state.status === 'initializing') {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
        <div role="status" aria-label="Verifying your session"><Spin size="large" /></div>
      </Flex>
    )
  }
  if (state.status === 'restore-error') {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh', padding: 24 }}>
        <Alert
          type="error"
          showIcon
          title="Unable to verify your session"
          description="The authentication service is temporarily unavailable. Please retry or sign in again."
          action={(
            <Space wrap>
              <Button type="primary" onClick={() => { void state.retrySessionVerification() }}>Retry</Button>
              <Button onClick={() => { void logout('signed-out') }}>Sign in again</Button>
            </Space>
          )}
        />
      </Flex>
    )
  }
  return children
}
