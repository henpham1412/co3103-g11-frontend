import { isValidUnicodeText } from '@/utils/unicodeText'

export const normalizeEmail = (email: string) => email.trim().toLowerCase()
export const passwordByteLength = (password: string) => new TextEncoder().encode(password).length

export function validateFullName(value = ''): string | undefined {
  if (!value.trim()) return 'Please enter your full name.'
  if (/\p{Cc}/u.test(value)) {
    return 'Full name must not contain control characters.'
  }
  if (value.trim().length > 150) return 'Full name must be at most 150 characters.'
}

// Validate a mailbox addr-spec, including RFC quoted local parts and address
// literals. Display names/comments are not part of an account email address.
function isEmailAddress(email: string): boolean {
  if ([...email].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false
  const separator = email.lastIndexOf('@')
  if (separator < 1) return false
  const local = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  const dotAtom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i
  const quoted = /^"(?:[\x20-\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*"$/
  if (local.length > 64 || (!dotAtom.test(local) && !quoted.test(local))) return false

  if (domain.startsWith('[') && domain.endsWith(']')) {
    const address = domain.slice(1, -1)
    if (/^ipv6:/i.test(address)) {
      if (!/^[\da-f:.]+$/i.test(address.slice(5))) return false
      try { return new URL('http://[' + address.slice(5) + ']').hostname.startsWith('[') }
      catch { return false }
    }
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)
      && address.split('.').every(part => Number(part) <= 255)
  }

  // URL performs IDNA conversion for internationalized domain names.
  if (!domain || /[\s/@:?#%\\[\]]/.test(domain)) return false
  try {
    const asciiDomain = new URL('http://' + domain).hostname
    return local.length + 1 + asciiDomain.length <= 254
      && asciiDomain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  } catch { return false }
}

export function validateEmail(value = ''): string | undefined {
  const email = normalizeEmail(value)
  if (!email) return 'Please enter your email address.'
  if (email.length > 254) return 'Email must be at most 254 characters.'
  if (!isEmailAddress(email)) return 'Please enter a valid email address.'
}

export function validateLoginPassword(value = ''): string | undefined {
  if (!value.trim()) return 'Please enter your password.'
  if (passwordByteLength(value) > 72) return 'Password must be at most 72 UTF-8 bytes.'
}

export function passwordRequirements(password = '') {
  const validText = isValidUnicodeText(password)
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'At most 72 bytes', met: validText && password.length > 0 && passwordByteLength(password) <= 72 },
    { label: 'Contains a non-whitespace character', met: !!password.trim() },
    { label: 'No invalid characters', met: validText && password.length > 0 },
  ]
}

export function validateRegisterPassword(value = ''): string | undefined {
  if (!isValidUnicodeText(value)) return 'Please remove invalid characters from your password.'
  const error = validateLoginPassword(value)
  if (error) return error
  if (value.length < 8) return 'Password must be at least 8 characters.'
}

export function validateConfirmPassword(value = '', password = ''): string | undefined {
  if (!value) return 'Please confirm your password.'
  if (value !== password) return 'Passwords do not match.'
}

// Keep AntD field rules and independently tested validation on the same path.
export function authRule(validate: (value?: string) => string | undefined) {
  return {
    required: true,
    validator: (_rule: unknown, value?: string) => {
      const message = validate(value)
      return message ? Promise.reject(new Error(message)) : Promise.resolve()
    },
  }
}
