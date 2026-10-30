import { normalizeApiError } from '@/api/apiError'
import { authFormErrors, type AuthField } from './authFormErrors'

export function loginErrorMessage(error: unknown): string {
  const problem = normalizeApiError(error, '/auth/login')
  if (problem.status === 401) return 'Invalid email or password. Please try again.'
  if (problem.status === 423) {
    const deadline = problem.lockedUntil ? new Date(problem.lockedUntil) : undefined
    return deadline && Number.isFinite(deadline.getTime())
      ? 'Your account is temporarily locked. Please try again after ' + deadline.toLocaleString() + ' (local time).'
      : 'Your account is temporarily locked. Please try again later or contact your G11 System Administrator.'
  }
  if (problem.status === 0) return problem.message
  if (problem.status >= 500) return 'The sign-in service is temporarily unavailable. Please try again later.'
  if (problem.status === 403) return 'Unable to sign in. Please contact your G11 System Administrator.'
  if (problem.status === 400) return 'Please check your sign-in details and try again.'
  if (problem.status === 429) return 'Too many sign-in attempts. Please try again later.'
  return 'Unable to sign in. Please try again later.'
}

const registerFields = ['fullName', 'email', 'password', 'confirmPassword'] as const

export function registerErrorPresentation(error: unknown): {
  fields?: { name: AuthField; errors: string[] }[]
  field?: AuthField
  message?: string
} {
  const problem = normalizeApiError(error, '/auth/register')
  if (problem.status === 0 || problem.status >= 500) {
    return { message: problem.status === 0 ? problem.message : 'The registration service is temporarily unavailable. Please try again later.' }
  }
  if (problem.status === 409) {
    return { fields: [{ name: 'email', errors: ['An account with this email already exists.'] }], field: 'email' }
  }
  let fields: { name: AuthField; errors: string[] }[] | undefined
  let field: AuthField | undefined
  if (problem.status === 400) {
    const mapped = authFormErrors(problem, registerFields)
    fields = mapped.fields
    field = fields.find(item => item.errors.length)?.name
    if (field && !mapped.hasUnbound) return { fields, field }
  }
  return {
    fields, field, message: problem.status === 429 ? 'Too many registration attempts. Please try again later.'
      : 'Unable to create your account. Please check your details and try again.'
  }
}
