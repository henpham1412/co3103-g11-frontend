import type { PropsWithChildren, ReactElement } from 'react'
import { ConfigProvider } from 'antd'
import {
  render as rtlRender,
  renderHook as rtlRenderHook,
  type RenderHookOptions,
  type RenderOptions,
} from '@testing-library/react/pure'

export * from '@testing-library/react/pure'

// jsdom never emits transitionend, so Ant Design's default motion waits out its
// deadline before a modal or popup is interactive. Tests turn that motion off.
function StillMotion({ children }: PropsWithChildren) {
  return <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>
}

export function render(ui: ReactElement, options?: RenderOptions) {
  const Outer = options?.wrapper
  return rtlRender(ui, {
    ...options,
    wrapper: ({ children }) => (
      <StillMotion>{Outer ? <Outer>{children}</Outer> : children}</StillMotion>
    ),
  })
}

export function renderHook<Result, Props>(
  callback: (props: Props) => Result,
  options?: RenderHookOptions<Props>,
) {
  const Outer = options?.wrapper
  return rtlRenderHook(callback, {
    ...options,
    wrapper: ({ children }) => (
      <StillMotion>{Outer ? <Outer>{children}</Outer> : children}</StillMotion>
    ),
  })
}
