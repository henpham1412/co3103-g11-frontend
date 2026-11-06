import { execFileSync, spawn } from 'node:child_process'

// Node 25+ installs an experimental global localStorage that is undefined unless
// --localstorage-file is set. That binding hides jsdom's Storage and fails every
// session test. Pass the opt-out only on Node versions that actually provide it.
let disableNodeWebStorage = false
try {
  execFileSync(process.execPath, ['--no-experimental-webstorage', '-e', ''], { stdio: 'ignore' })
  disableNodeWebStorage = true
} catch {
  disableNodeWebStorage = false
}

const nodeArgs = disableNodeWebStorage ? ['--no-experimental-webstorage'] : []
const env = { ...process.env }
if (disableNodeWebStorage && !env.NODE_OPTIONS?.includes('--no-experimental-webstorage')) {
  env.NODE_OPTIONS = [env.NODE_OPTIONS, '--no-experimental-webstorage'].filter(Boolean).join(' ')
}

const child = spawn(
  process.execPath,
  [...nodeArgs, 'node_modules/vitest/vitest.mjs', ...process.argv.slice(2)],
  { stdio: 'inherit', env },
)

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
