import { describe, expect, it } from 'vitest'
import {
  authRule, normalizeEmail, passwordByteLength, validateConfirmPassword,
  validateEmail, validateFullName, validateLoginPassword, validateRegisterPassword,
} from './authValidation'

describe('full name', () => {
  it.each([undefined, '', ' ', '\t\n', '\u00a0'])('requires a nonblank name: %j', value => {
    expect(validateFullName(value)).toBe('Please enter your full name.')
  })
  it.each(['Nguyễn Thị Ánh', '  Nguyễn Thị Ánh  ', 'a'.repeat(150), ' ' + 'a'.repeat(150) + ' '])(
    'accepts trimmed names within 150 characters: %s', value => expect(validateFullName(value)).toBeUndefined(),
  )
  it('rejects 151 characters', () => expect(validateFullName('a'.repeat(151))).toMatch(/150/))
  it.each(Array.from({ length: 32 }, (_, code) => code))('rejects ASCII control %i, including before trimming', code => {
    const control = String.fromCharCode(code)
    for (const name of [control + 'Name', 'Na' + control + 'me', 'Name' + control]) {
      expect(validateFullName(name)).toMatch(/control/)
    }
  })
  it.each(Array.from({ length: 33 }, (_, index) => 127 + index))('rejects DEL and C1 controls: %i', code => {
    expect(validateFullName('Nguyễn' + String.fromCharCode(code) + ' An')).toMatch(/control/)
  })
})

describe('email', () => {
  it('trims and lowercases', () => expect(normalizeEmail('  Student+G11@Example.COM  ')).toBe('student+g11@example.com'))
  it.each([undefined, '', ' ', '\t\n'])('requires email: %j', value => expect(validateEmail(value)).toMatch(/enter your email/))
  it.each([
    'student@example.com', '  Student@Example.COM  ', 'first.last+tag@sub.example.co.uk',
    "!#$%&'*+-/=?^_`{|}~@example.com", 'user@localhost', 'user@x.io',
    '"first last"@example.com', '"a@b"@example.com', '"a\\"b"@example.com',
    'user@[192.168.1.1]', 'user@[IPv6:2001:db8::1]', 'user@vídụ.vn',
    'a'.repeat(64) + '@example.com',
  ])('accepts RFC mailbox: %s', value => expect(validateEmail(value)).toBeUndefined())
  it.each([
    'student', '@example.com', 'student@', 'a@@example.com', 'a b@example.com',
    '.a@example.com', 'a.@example.com', 'a..b@example.com', 'a@-example.com',
    'a@example-.com', 'a@example..com', 'a@.example.com', 'a@example.com.',
    'a@exam_ple.com', 'a@example.com/path', 'a@example.com#hash', 'a@example.com?query',
    'a@example.com:80', 'a@exam%70le.com', 'a@exa\\mple.com',
    'a\nb@example.com', 'a@exa\nmple.com', 'a\u0000b@example.com',
    'Name <user@example.com>', '"unclosed@example.com', '"line\nbreak"@example.com',
    'a@[256.1.1.1]', 'a@[1.2.3]', 'a@[IPv6:invalid]', 'a@[IPv6:::1]/evil]',
    'a'.repeat(65) + '@example.com', 'a@' + 'b'.repeat(64) + '.com',
  ])('rejects malformed mailbox: %s', value => expect(validateEmail(value)).toBeDefined())
  it('accepts exactly 254 and rejects 255 characters', () => {
    const email = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61)
    expect(email).toHaveLength(254)
    expect(validateEmail(email)).toBeUndefined()
    expect(validateEmail(email + 'd')).toMatch(/254/)
  })
})

describe('password UTF-8 limits', () => {
  it.each([
    ['a'.repeat(72), 72], ['a'.repeat(73), 73],
    ['á'.repeat(36), 72], ['á'.repeat(36) + 'a', 73],
    ['ệ'.repeat(24), 72], ['ệ'.repeat(24) + 'a', 73],
    ['😀'.repeat(18), 72], ['😀'.repeat(18) + 'a', 73],
    ['a\u0301'.repeat(24), 72], ['a\u0301'.repeat(24) + 'a', 73],
    ['\ud800', 3], ['Tiếng Việt', 14],
  ])('counts UTF-8 correctly for %s', (password, bytes) => {
    expect(passwordByteLength(password)).toBe(bytes)
    expect(validateLoginPassword(password)).toBe(bytes > 72 ? 'Password must be at most 72 UTF-8 bytes.' : undefined)
    if (password.length >= 8) expect(validateRegisterPassword(password)).toBe(validateLoginPassword(password))
  })
  it.each([undefined, '', '        ', '\t\n', '\u3000'.repeat(8)])('requires a nonblank login and register password: %j', value => {
    expect(validateLoginPassword(value)).toBe('Please enter your password.')
    expect(validateRegisterPassword(value)).toBe('Please enter your password.')
  })
  it.each(['a', '1234567'])('allows short login passwords, but requires eight for registration: %s', value => {
    expect(validateLoginPassword(value)).toBeUndefined()
    expect(validateRegisterPassword(value)).toMatch(/at least 8/)
  })
  it.each(['12345678', 'abcdefgh', ' pass   ', '😀😀😀😀'])('uses JS length and adds no complexity or trimming rule: %j', value => {
    expect(validateRegisterPassword(value)).toBeUndefined()
  })
})

describe('confirmation and AntD adapter', () => {
  it.each([undefined, ''])('requires confirmation: %j', value => expect(validateConfirmPassword(value, 'password')).toMatch(/confirm/))
  it.each(['Password', 'password ', ' password', 'pássword'])('requires exact equality: %j', value => {
    expect(validateConfirmPassword(value, 'password')).toBe('Passwords do not match.')
  })
  it('preserves password whitespace', () => expect(validateConfirmPassword(' pass   ', ' pass   ')).toBeUndefined())
  it('handles an absent original password', () => expect(validateConfirmPassword('password')).toMatch(/do not match/))
  it('resolves valid values and rejects with the validation message', async () => {
    await expect(authRule(validateEmail).validator({}, 'user@example.com')).resolves.toBeUndefined()
    await expect(authRule(validateEmail).validator({})).rejects.toThrow('Please enter your email address.')
  })
})
