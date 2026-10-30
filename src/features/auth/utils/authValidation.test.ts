import { describe, expect, it } from 'vitest'
import {
  authRule, normalizeEmail, passwordByteLength, validateConfirmPassword,
  validateEmail, validateFullName, validateLoginPassword, validateRegisterPassword,
} from './authValidation'

describe('auth validation contracts', () => {
  it("requires trimmed full names within 150 characters", () => {
    for (const value of [undefined, '', ' ', '\t\n', '\u00a0'] as const) {
      expect(validateFullName(value), `case: ${JSON.stringify(value)}`).toBe('Please enter your full name.')
    }

    for (const value of ['Nguyễn Thị Ánh', '  Nguyễn Thị Ánh  ', 'a'.repeat(150), ' ' + 'a'.repeat(150) + ' '] as const) {
      expect(validateFullName(value), `case: ${JSON.stringify(value)}`).toBeUndefined()
    }

    expect(validateFullName('a'.repeat(151))).toMatch(/150/)
  })

  it("rejects every ASCII, DEL and C1 control before trimming", () => {
    for (const code of Array.from({ length: 32 }, (_, code) => code)) {
      const control = String.fromCharCode(code)
      for (const name of [control + 'Name', 'Na' + control + 'me', 'Name' + control]) {
        expect(validateFullName(name), `case: ${JSON.stringify(code)}`).toMatch(/control/)
      }
    }

    for (const code of Array.from({ length: 33 }, (_, index) => 127 + index)) {
      expect(validateFullName('Nguyễn' + String.fromCharCode(code) + ' An'), `case: ${JSON.stringify(code)}`).toMatch(/control/)
    }
  })

  it("requires email and normalizes identity whitespace and casing", () => {
    expect(normalizeEmail('  Student+G11@Example.COM  ')).toBe('student+g11@example.com')

    for (const value of [undefined, '', ' ', '\t\n'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toMatch(/enter your email/)
    }
  })

  it("validates dot-atom and quoted local parts", () => {
    for (const value of ['student@example.com',
      '  Student@Example.COM  ',
      'first.last+tag@sub.example.co.uk',
      "!#$%&'*+-/=?^_`{|}~@example.com",
      '"first last"@example.com',
      '"a@b"@example.com',
      '"a\\"b"@example.com'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toBeUndefined()
    }

    for (const value of ['student',
      '@example.com',
      'student@',
      'a@@example.com',
      'a b@example.com',
      '.a@example.com',
      'a.@example.com',
      'a..b@example.com',
      'Name <user@example.com>',
      '"unclosed@example.com',
      '"line\nbreak"@example.com'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toBeDefined()
    }
  })

  it("validates ASCII and IDN domains and label syntax", () => {
    for (const value of ['user@localhost',
      'user@x.io',
      'user@vídụ.vn'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toBeUndefined()
    }

    for (const value of ['a@-example.com',
      'a@example-.com',
      'a@example..com',
      'a@.example.com',
      'a@example.com.',
      'a@exam_ple.com'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toBeDefined()
    }
  })

  it("validates IPv4 and IPv6 address literals", () => {
    for (const value of ['user@[192.168.1.1]',
      'user@[IPv6:2001:db8::1]'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toBeUndefined()
    }

    for (const value of ['a@[256.1.1.1]',
      'a@[1.2.3]',
      'a@[IPv6:invalid]',
      'a@[IPv6:::1]/evil]'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toBeDefined()
    }
  })

  it("enforces local-part, label and total email length boundaries", () => {
    for (const value of ['a'.repeat(64) + '@example.com'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toBeUndefined()
    }

    for (const value of ['a'.repeat(65) + '@example.com',
    'a@' + 'b'.repeat(64) + '.com'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toBeDefined()
    }

    {
      const email = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61)
      expect(email).toHaveLength(254)
      expect(validateEmail(email)).toBeUndefined()
      expect(validateEmail(email + 'd')).toMatch(/254/)
    }
  })

  it("rejects controls and URL components in email", () => {
    for (const value of ['a@example.com/path',
      'a@example.com#hash',
      'a@example.com?query',
      'a@example.com:80',
      'a@exam%70le.com',
      'a@exa\\mple.com',
      'a\nb@example.com',
      'a@exa\nmple.com',
      'a\u0000b@example.com'] as const) {
      expect(validateEmail(value), `case: ${JSON.stringify(value)}`).toBeDefined()
    }
  })

  it("enforces 72 UTF-8 bytes for ASCII, Unicode, combining characters and lone surrogates", () => {
    for (const sample of [
      ['a'.repeat(72), 72], ['a'.repeat(73), 73],
      ['á'.repeat(36), 72], ['á'.repeat(36) + 'a', 73],
      ['ệ'.repeat(24), 72], ['ệ'.repeat(24) + 'a', 73],
      ['😀'.repeat(18), 72], ['😀'.repeat(18) + 'a', 73],
      ['a\u0301'.repeat(24), 72], ['a\u0301'.repeat(24) + 'a', 73],
      ['\ud800', 3], ['Tiếng Việt', 14],
    ] as const) {
      const [password, bytes] = sample
      expect(passwordByteLength(password), `case: ${JSON.stringify(sample)}`).toBe(bytes)
      expect(validateLoginPassword(password), `case: ${JSON.stringify(sample)}`).toBe(bytes > 72 ? 'Password must be at most 72 UTF-8 bytes.' : undefined)
      if (password.length >= 8) expect(validateRegisterPassword(password), `case: ${JSON.stringify(sample)}`).toBe(validateLoginPassword(password))
    }
  })

  it("allows short login passwords but requires eight JS characters to register", () => {
    for (const value of ['a', '1234567'] as const) {
      expect(validateLoginPassword(value), `case: ${JSON.stringify(value)}`).toBeUndefined()
      expect(validateRegisterPassword(value), `case: ${JSON.stringify(value)}`).toMatch(/at least 8/)
    }
  })

  it("rejects missing and whitespace-only passwords", () => {
    for (const value of [undefined, '', '        ', '\t\n', '\u3000'.repeat(8)] as const) {
      expect(validateLoginPassword(value), `case: ${JSON.stringify(value)}`).toBe('Please enter your password.')
      expect(validateRegisterPassword(value), `case: ${JSON.stringify(value)}`).toBe('Please enter your password.')
    }
  })

  it("preserves password whitespace and adds no complexity requirements", () => {
    for (const value of ['12345678', 'abcdefgh', ' pass   ', '😀😀😀😀'] as const) {
      expect(validateRegisterPassword(value), `case: ${JSON.stringify(value)}`).toBeUndefined()
    }
  })

  it("requires confirmation and compares the exact unchanged password", () => {
    for (const value of [undefined, ''] as const) {
      expect(validateConfirmPassword(value, 'password'), `case: ${JSON.stringify(value)}`).toMatch(/confirm/)
    }

    for (const value of ['Password', 'password ', ' password', 'pássword'] as const) {
      expect(validateConfirmPassword(value, 'password'), `case: ${JSON.stringify(value)}`).toBe('Passwords do not match.')
    }

    expect(validateConfirmPassword(' pass   ', ' pass   ')).toBeUndefined()

    expect(validateConfirmPassword('password')).toMatch(/do not match/)
  })

  it("resolves and rejects AntD validation with the correct message", async () => {
    await expect(authRule(validateEmail).validator({}, 'user@example.com')).resolves.toBeUndefined()
    await expect(authRule(validateEmail).validator({})).rejects.toThrow('Please enter your email address.')
  })
})
