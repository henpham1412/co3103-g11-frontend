import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defaultExclude, defineConfig } from 'vitest/config'

const pureTests = [
  'src/api/passwordRecoveryMapping.test.ts',
  'src/features/auth/utils/*.test.ts', 'src/utils/*.test.ts',
  'src/api/apiError.test.ts', 'src/api/clients.test.ts', 'src/api/authMapping.test.ts', 'src/app/theme.test.ts',
]
const storageTests = ['src/features/auth/services/*.test.ts']
const apiTests = ['src/api/authApi.test.ts', 'src/api/authInterceptors.test.ts', 'src/api/passwordRecoveryApi.test.ts']

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    testTimeout: 15000,
    maxWorkers: 4,
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
