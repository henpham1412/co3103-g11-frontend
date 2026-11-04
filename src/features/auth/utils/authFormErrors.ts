import type { ApiErrorResponse, ApiFieldError } from '@/types/auth'

export type AuthField = 'fullName' | 'email' | 'password' | 'confirmPassword'

// API messages may contain rejected values, parser diagnostics or database
// details. Only known validation messages have a user-facing translation.
const messages: Record<AuthField, Record<string, string>> = {
  fullName: {
    'Full name is required': 'Please enter your full name.',
    'Full name must not exceed 150 characters': 'Full name must be at most 150 characters.',
    'Full name contains invalid characters': 'Full name must not contain control characters.',
  },
  email: {
    'Email is required': 'Please enter your email address.',
    'Invalid email format': 'Please enter a valid email address.',
    'Email must not exceed 254 characters': 'Email must be at most 254 characters.',
  },
  password: {
    'Password is required': 'Please enter your password.',
    'Password must be between 8 and 128 characters': 'Password must be at least 8 characters and at most 72 UTF-8 bytes.',
    'Password must not exceed 72 bytes': 'Password must be at most 72 UTF-8 bytes.',
    'Password must not exceed 72 UTF-8 bytes': 'Password must be at most 72 UTF-8 bytes.',
  },
  confirmPassword: {
    'Passwords do not match': 'Passwords do not match.',
  },
}

const fallback: Record<AuthField, string> = {
  fullName: 'Please check your full name.',
  email: 'Please check your email address.',
  password: 'Please check your password.',
  confirmPassword: 'Please check your password confirmation.',
}

export function authFormErrors<Name extends AuthField>(problem: ApiErrorResponse, names: readonly Name[]) {
  const aliases: Record<string, AuthField> = { full_name: 'fullName', fullName: 'fullName', email: 'email', password: 'password', confirmPassword: 'confirmPassword' }
  const sources = [
    problem.details ?? [],
    Object.entries(problem.validationErrors ?? {}).map(([field, message]) => ({ field, message })),
    problem.errors ?? [],
  ].map(entries => entries.map(entry => ({
    ...entry, field: typeof entry.field === 'string' && Object.hasOwn(aliases, entry.field) ? aliases[entry.field] : undefined,
  })))
  const entries = new Map<AuthField, ApiFieldError[]>()
  for (const source of sources) {
    for (const name of names) {
      const matches = source.filter(entry => entry.field === name)
      if (matches.length && !entries.has(name)) entries.set(name, matches)
    }
  }
  const fields = names.map(name => ({
    name,
    errors: [...new Set((entries.get(name) ?? []).map(({ message }) =>
      Object.hasOwn(messages[name], message) ? messages[name][message] : fallback[name],
    ))],
  }))
  return {
    fields,
    hasUnbound: sources.flat().some(entry => !names.some(name => name === entry.field)),
  }
}
