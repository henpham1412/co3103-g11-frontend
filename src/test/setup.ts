import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import './setupNetwork'

// CI runners render these antd screens roughly three times slower than a development machine,
// so the default one second per findBy*/waitFor* budget fails on work that is merely in flight.
configure({ asyncUtilTimeout: 5000 })

beforeEach(() => {
  vi.stubEnv('VITE_AUTH_MODE', 'standalone')
  vi.stubEnv('VITE_LMS_CLIENT_ID', '')
  vi.stubEnv('VITE_LMS_REDIRECT_URI', '')
  // jsdom has no media query evaluation or pseudo-element layout. AntD uses
  // these browser APIs for responsive forms and modal scrollbar measurement.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => { },
    removeListener: () => { },
    addEventListener: () => { },
    removeEventListener: () => { },
    dispatchEvent: () => false,
  }))
  const getComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => getComputedStyle(element))
})
afterEach(cleanup)
