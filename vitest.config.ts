import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defaultExclude, defineConfig } from 'vitest/config'

const pureTests = [
  'src/features/auth/utils/*.test.ts', 'src/utils/*.test.ts',
  'src/api/apiError.test.ts', 'src/api/clients.test.ts', 'src/api/authMapping.test.ts', 'src/app/theme.test.ts',
]
const storageTests = ['src/features/auth/services/*.test.ts']
const apiTests = ['src/api/authApi.test.ts', 'src/api/authInterceptors.test.ts']

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Vite loads a developer's .env.local into the test process, and that file can switch on
    // the demo data source. The suite must always exercise the real transport against contract
    // mocks, so the flag is pinned off here rather than inherited from whoever's local env.
    env: { VITE_DEMO_MODE: '' },
    testTimeout: 15000,
    // The jsdom + AntD screens mount the whole application per test, so four concurrent workers
    // oversubscribe a four-core CI runner: the shared-authentication flow measured 20s per case
    // under four workers against 9s under two, and the full suite still finished faster.
    maxWorkers: 2,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: pureTests } },
      { extends: true, test: { name: 'storage', environment: 'jsdom', include: storageTests } },
      { extends: true, test: { name: 'api', environment: 'jsdom', include: apiTests, setupFiles: ['./src/test/setupNetwork.ts'] } },
      { extends: true, test: {
        name: 'ui', environment: 'jsdom',
        exclude: [...defaultExclude, ...pureTests, ...storageTests, ...apiTests],
        setupFiles: ['./src/test/setup.ts'],
      } },
    ],
  },
})
