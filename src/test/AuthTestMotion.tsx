import type { PropsWithChildren } from 'react'
import { theme } from 'antd'

export default function AuthTestMotion({ children }: PropsWithChildren) {
  const { token } = theme.useToken()
  if (token.motion) throw new Error('Auth test providers must inherit motion=false')
  return children
}
