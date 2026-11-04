import { normalizeApiError } from '@/api/apiError'

export const forgotSuccessMessage = 'If an account exists for this email, you will receive password reset instructions.'
export const resetSuccessMessage = 'Your password has been reset. You can now sign in.'
export type RecoveryField = 'email' | 'token' | 'newPassword' | 'confirmPassword'
export interface RecoveryFeedback {
  fields?: { name: RecoveryField; errors: string[] }[]
  field?: RecoveryField
  message?: string
}

export function recoveryErrorPresentation(error: unknown, mode: 'forgot' | 'reset', manualToken = true): RecoveryFeedback {
  const problem = normalizeApiError(error, mode === 'forgot' ? '/auth/forgot-password' : '/auth/reset-password')
  if (mode === 'reset' && problem.code === 'INVALID_OR_EXPIRED_RESET_TOKEN') {
    const message = 'This reset link is invalid or has expired. Please request a new reset link.'
    return manualToken ? { fields: [{ name: 'token', errors: [message] }], field: 'token', message } : { message }
  }
  const aliases: Record<string, RecoveryField> = { email: 'email', token: 'token', new_password: 'newPassword', newPassword: 'newPassword', confirmPassword: 'confirmPassword' }
  const allowed: RecoveryField[] = mode === 'forgot' ? ['email'] : ['newPassword', 'confirmPassword', ...(manualToken ? ['token' as const] : [])]
  const copy: Record<RecoveryField, string> = { email: 'Please check your email address.', token: 'Please check your reset token.', newPassword: 'Please check your new password against the requirements.', confirmPassword: 'Passwords do not match.' }
  const fields: NonNullable<RecoveryFeedback['fields']> = []
  let unbound = false
  if (problem.status === 400 || problem.status === 422) {
    for (const source of [problem.details ?? [], Object.keys(problem.validationErrors ?? {}).map(field => ({ field })), problem.errors ?? []]) {
      for (const entry of source) {
        const name = entry.field && Object.hasOwn(aliases, entry.field) ? aliases[entry.field] : undefined
        if (!name || !allowed.includes(name)) { unbound = true; continue }
        if (!fields.some(field => field.name === name)) fields.push({ name, errors: [copy[name]] })
      }
    }
  }
  const field = fields[0]?.name
  if (field && !unbound) return { fields, field }
  return { fields, field, message: problem.status === 429 ? 'Too many requests. Please try again later.'
    : problem.status === 0 ? 'Unable to reach the recovery service. Please try again.'
      : 'Unable to complete this request. Please try again later.' }
}
