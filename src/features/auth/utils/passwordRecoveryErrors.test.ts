import { expect, it } from 'vitest'
import { ApiError } from '@/api/apiError'
import { errorEnvelope } from '@/test/fixtures/auth'
import { recoveryErrorPresentation } from './passwordRecoveryErrors'

it('prioritizes invalid reset codes without rendering backend diagnostics', () => {
  const problem = new ApiError(errorEnvelope({ code: 'INVALID_OR_EXPIRED_RESET_TOKEN', message: 'sensitive-diagnostic' }))
  expect(recoveryErrorPresentation(problem, 'reset').field).toBe('token')
  expect(recoveryErrorPresentation(problem, 'reset', false).field).toBeUndefined()
  expect(JSON.stringify(recoveryErrorPresentation(problem, 'forgot')).includes(problem.message)).toBe(false)
})
it('allowlists, deduplicates and binds aliases with safe fallback for unknown paths', () => {
  const problem = new ApiError(errorEnvelope({ status: 422, details: [{ field: 'new_password', message: '<script>secret</script>' }, { field: 'new_password', message: 'other' }], validationErrors: { newPassword: 'database' }, errors: [{ field: '__proto__', message: 'secret' }, { field: 'profile.name', message: 'secret' }] }))
  const result = recoveryErrorPresentation(problem, 'reset')
  expect(result.fields).toEqual([{ name: 'newPassword', errors: ['Please check your new password against the requirements.'] }])
  expect(result.message).toBeDefined()
  expect(JSON.stringify(result).includes('secret')).toBe(false)
})
it('uses safe local copy for network, throttling and account errors', () => {
  for (const status of [0, 403, 404, 429, 500]) {
    const result = recoveryErrorPresentation(new ApiError(errorEnvelope({ status, message: 'email not found' })), 'forgot')
    expect(result.message).toBeDefined()
    expect(result.message?.includes('email not found')).toBe(false)
  }
})
