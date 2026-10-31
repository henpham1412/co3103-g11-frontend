import { describe, expect, it } from 'vitest'
import { createToken, expiredToken, validToken, validUser } from '@/test/fixtures/auth'
import { wireCurrentUser, wireIdentity, wireLoginResponse, wireProfile, wireRegisteredUser } from '@/test/fixtures/authWire'
import { isAuthUser } from '@/utils/typeGuards'
import { decodeCurrentUserResponse, decodeLoginResponse, decodeRegisterResponse, serializeLoginRequest, serializeRegisterRequest } from './authMapping'

describe('request serialization', () => {
  it('allowlists wire fields and preserves the password verbatim', () => {
    const input = {
      email: 'student@example.com', password: ' password ', fullName: 'Test Student',
      confirmPassword: ' password ', rememberMe: true, role: 'ADMINISTRATOR',
    }
    expect(serializeRegisterRequest(input)).toEqual({
      email: 'student@example.com', password: ' password ', full_name: 'Test Student',
    })
    expect(serializeLoginRequest(input)).toEqual({ email: 'student@example.com', password: ' password ' })
  })
})

describe('registration decoding', () => {
  it('accepts the documented response without creation timestamps or a message', () => {
    expect(decodeRegisterResponse({
      user_id: '00000000-0000-0000-0000-000000000000', email: 'student@example.com',
      full_name: 'Nguyen Van A', status: 'ACTIVE',
    })).toEqual({
      userId: '00000000-0000-0000-0000-000000000000', email: 'student@example.com',
      fullName: 'Nguyen Van A', status: 'ACTIVE',
    })
    expect(decodeRegisterResponse(wireRegisteredUser)).toEqual(validUser)
  })

  it.each([null, 1, {}, []])('rejects a present message with the wrong type: %j', message => {
    expect(() => decodeRegisterResponse({ ...wireIdentity, message })).toThrow(expect.objectContaining({
      status: 502, code: 'INVALID_AUTH_RESPONSE', path: '/auth/register',
    }))
  })
})

describe('identity boundaries', () => {
  it.each([
    null, [], 'ok', {}, validUser,
    { id: 'legacy-id', email: 'student@example.com', fullName: 'Test Student', status: 'ACTIVE' },
    ...['user_id', 'email', 'full_name'].flatMap(field =>
      [undefined, '', ' ', null, 42].map(value => ({ ...wireIdentity, [field]: value }))),
    ...[undefined, 'INACTIVE', 'UNKNOWN', ['ACTIVE']].map(status => ({ ...wireIdentity, status })),
  ])('rejects malformed/legacy identities at every endpoint: %j', identity => {
    for (const [path, decode] of [
      ['/auth/register', () => decodeRegisterResponse(identity)],
      ['/auth/login', () => decodeLoginResponse({ ...wireLoginResponse(), user: identity })],
      ['/users/me', () => decodeCurrentUserResponse(identity)],
    ] as const) {
      expect(decode).toThrow(expect.objectContaining({ status: 502, code: 'INVALID_AUTH_RESPONSE', path }))
    }
  })

  it.each(['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const)('distinguishes schema validity from authentication for %s', status => {
    const identity = { ...wireIdentity, status }
    expect(decodeRegisterResponse(identity)).toEqual({ ...validUser, status })
    const login = { ...wireLoginResponse(), user: identity }
    if (status === 'ACTIVE') {
      expect(decodeLoginResponse(login)).toMatchObject(validUser)
      expect(decodeCurrentUserResponse(identity)).toEqual(validUser)
    } else {
      for (const decode of [() => decodeLoginResponse(login), () => decodeCurrentUserResponse(identity)]) {
        expect(decode).toThrow(expect.objectContaining({ status: 403, code: 'ACCOUNT_NOT_ACTIVE' }))
      }
    }
  })

  it('projects only declared identity fields and keeps the storage guard camelCase', () => {
    const extra = { role: 'ADMINISTRATOR', roles: ['ADMINISTRATOR'], password_hash: 'private', createdAt: 42 }
    expect(decodeRegisterResponse({ ...wireRegisteredUser, ...extra })).toEqual(validUser)
    expect(decodeCurrentUserResponse({ ...wireIdentity, ...extra })).toEqual(validUser)
    const token = validToken()
    expect(decodeLoginResponse({ ...wireLoginResponse({ access_token: token }), ...extra, user: { ...wireIdentity, ...extra } }))
      .toEqual({ ...validUser, accessToken: token, tokenType: 'Bearer', expiresIn: 3600 })
    expect(isAuthUser(validUser)).toBe(true)
    expect(isAuthUser(wireIdentity)).toBe(false)
    expect(isAuthUser({ ...validUser, status: 'INACTIVE' })).toBe(false)
  })
})

describe('login decoding', () => {
  it('maps the nested token response and optional client ID without persisting the wire envelope', () => {
    const token = validToken()
    expect(decodeLoginResponse({
      access_token: token, token_type: 'Bearer', expires_in: 86400,
      user: { user_id: 'test-user', email: 'student@example.com', full_name: 'Nguyen Van A', status: 'ACTIVE' },
      client_id: 'central-identity',
    })).toEqual({
      accessToken: token, tokenType: 'Bearer', expiresIn: 86400,
      userId: 'test-user', email: 'student@example.com', fullName: 'Nguyen Van A', status: 'ACTIVE',
      clientId: 'central-identity',
    })
    expect(decodeLoginResponse(wireLoginResponse())).not.toHaveProperty('clientId')
  })

  it.each([NaN, Infinity, -Infinity, Number.MAX_VALUE, 0, -1, null, undefined, '3600'])('rejects invalid lifetimes including non-JSON numbers: %s', expires_in => {
    expect(() => decodeLoginResponse({ ...wireLoginResponse(), expires_in })).toThrow(expect.objectContaining({ code: 'INVALID_AUTH_RESPONSE' }))
  })

  it('keeps the existing conservative JWT expiry checks', () => {
    for (const access_token of ['', ' ', 'not-a-jwt', 'a.b.c', expiredToken(), createToken({ exp: 'tomorrow' })]) {
      expect(() => decodeLoginResponse({ ...wireLoginResponse(), access_token })).toThrow(expect.objectContaining({ code: 'INVALID_AUTH_RESPONSE' }))
    }
    const token = createToken({ sub: validUser.userId })
    expect(decodeLoginResponse(wireLoginResponse({ access_token: token }))).toMatchObject({ accessToken: token, expiresIn: 3600 })
  })

  it.each([null, 0, '', ' ', {}])('rejects invalid optional client IDs: %j', client_id => {
    expect(() => decodeLoginResponse({ ...wireLoginResponse(), client_id })).toThrow(expect.objectContaining({ code: 'INVALID_AUTH_RESPONSE' }))
  })
})

describe('current-user profile decoding', () => {
  it('maps all documented profile fields and ignores undeclared metadata', () => {
    expect(decodeCurrentUserResponse({ ...wireCurrentUser, profile: { ...wireProfile, role: 'ADMINISTRATOR', private_field: 'excluded' } })).toEqual({
      ...validUser,
      profile: {
        avatarUrl: 'https://storage.example.com/avatars/user1.png', bio: 'Computer Science student',
        phoneNumber: '+84912345678', dateOfBirth: null, locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh',
      },
    })
  })

  it('preserves absent, null, empty, and partial profile representations', () => {
    expect(decodeCurrentUserResponse(wireIdentity)).toEqual(validUser)
    expect(decodeCurrentUserResponse(wireCurrentUser)).toEqual({ ...validUser, profile: null })
    expect(decodeCurrentUserResponse({ ...wireIdentity, profile: {} })).toEqual({ ...validUser, profile: {} })
    expect(decodeCurrentUserResponse({ ...wireIdentity, profile: { bio: '', avatar_url: null, date_of_birth: '2000-01-01' } }))
      .toEqual({ ...validUser, profile: { bio: '', avatarUrl: null, dateOfBirth: '2000-01-01' } })
  })

  it.each(['avatar_url', 'bio', 'phone_number', 'date_of_birth', 'locale', 'timezone'])('validates optional profile field %s when present', field => {
    for (const value of [42, false, [], {}]) {
      expect(() => decodeCurrentUserResponse({ ...wireIdentity, profile: { [field]: value } }))
        .toThrow(expect.objectContaining({ status: 502, code: 'INVALID_AUTH_RESPONSE', path: '/users/me' }))
    }
    expect(() => decodeCurrentUserResponse({ ...wireIdentity, profile: { [field]: null } })).not.toThrow()
  })

  it.each([[], 42, 'profile', false])('rejects a non-object profile: %j', profile => {
    expect(() => decodeCurrentUserResponse({ ...wireIdentity, profile })).toThrow(expect.objectContaining({ code: 'INVALID_AUTH_RESPONSE' }))
  })
})
