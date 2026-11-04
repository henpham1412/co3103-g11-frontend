import type { AuthIdentityDto, CurrentUserResponseDto, LoginResponseDto, RegisterResponseDto, UserProfileDto } from '@/types/authWire'
import { validToken } from './auth'

// HTTP fixtures are literal contract examples, independent of internal models/mappers.
export const wireIdentity = {
  user_id: '1c5ebacf-5ea0-4d35-bab4-ac9167cfc5a7',
  email: 'student@example.com',
  full_name: 'Test Student',
  status: 'ACTIVE',
} satisfies AuthIdentityDto

export const wireRegisteredUser = {
  ...wireIdentity,
  message: 'User registered successfully',
} satisfies RegisterResponseDto

export const wireProfile = {
  avatar_url: 'https://storage.example.com/avatars/user1.png',
  bio: 'Computer Science student',
  phone_number: '+84912345678',
  date_of_birth: null,
  locale: 'vi-VN',
  timezone: 'Asia/Ho_Chi_Minh',
} satisfies UserProfileDto

export const wireCurrentUser = { ...wireIdentity, profile: null } satisfies CurrentUserResponseDto

export function wireLoginResponse(overrides: Partial<LoginResponseDto> = {}): LoginResponseDto {
  return { access_token: validToken(), token_type: 'Bearer', expires_in: 3600, user: { ...wireIdentity }, ...overrides }
}
