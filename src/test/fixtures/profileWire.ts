import { wireIdentity } from './authWire'

export const wireFullProfile = {
  ...wireIdentity,
  profile: {
    avatar_url: 'https://images.example/avatar.png', bio: 'Learning together', phone_number: '+84912345678',
    date_of_birth: '2001-03-15', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh',
  },
}
export const wireProfileAcknowledgment = { message: 'Profile updated successfully', updated_at: '2026-11-04T12:00:00Z' }

export const avatarUrlCases = [
  { value: 'https://images.example/a.png', serialized: 'https://images.example/a.png' },
  { value: 'http://images.example/a?q=1', serialized: 'http://images.example/a?q=1' },
  { value: 'HTTP://Example.com/A.png?Q=Value#Part', serialized: 'http://Example.com/A.png?Q=Value#Part' },
  { value: 'hTtPs://example.com/ảnh😀.png', serialized: 'https://example.com/ảnh😀.png' },
  { value: 'https://example.com:443/a.png', serialized: 'https://example.com:443/a.png' },
  { value: 'http://[::1]:8080/a.png', serialized: 'http://[::1]:8080/a.png' },
  ...[
    'javascript:alert(1)', 'data:image/png;base64,x', '//example.com/a', 'https:example.com/a',
    'https://example.com\\a.png', 'https:\\example.com/a', 'https://', 'https:///a.png',
    'https:////example.com/a', 'https://?q=example.com', 'https://#example.com',
    'https://user:pass@example.com/a', 'https://user@example.com/a', 'https://@example.com/a',
    'https://example.com:/a', 'https://example.com:bad/a', 'https://example.com:65536/a',
    'https://[::1/a', 'https://%65xample.com/a', 'https://example.com/a\n',
    'https://example.com/a\u0001.png', 'https://example.com/a\0.png', ' https://example.com/a', 'not a URL',
  ].map(value => ({ value, serialized: null })),
]
