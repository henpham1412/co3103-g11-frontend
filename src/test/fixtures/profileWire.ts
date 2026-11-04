import { wireIdentity } from './authWire'

export const wireFullProfile = {
  ...wireIdentity,
  profile: {
    avatar_url: 'https://images.example/avatar.png', bio: 'Learning together', phone_number: '+84912345678',
    date_of_birth: '2001-03-15', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh',
  },
}
export const wireProfileAcknowledgment = { message: 'Profile updated successfully', updated_at: '2026-11-04T12:00:00Z' }

export const bracketAvatarUrls = [
  'https://example.com/a.png?size[width]=100',
  'https://example.com/a.png#preview[1]',
  'https://example.com/a.png?size[width]=100#preview[1]',
  'https://example.com?size[width]=100',
  'https://example.com#preview[1]',
  'http://[::1]:8080/a.png?size[width]=100#preview[1]',
]

export const avatarUrlCases = [
  ...bracketAvatarUrls.map(value => ({ value, serialized: value })),
  { value: 'https://images.example/a.png', serialized: 'https://images.example/a.png' },
  { value: 'http://images.example/a?q=1', serialized: 'http://images.example/a?q=1' },
  { value: 'HTTP://Example.com/A.png?Q=Value#Part', serialized: 'http://Example.com/A.png?Q=Value#Part' },
  { value: 'hTtPs://example.com/ảnh😀.png', serialized: 'https://example.com/ảnh😀.png' },
  { value: 'https://example.com:443/a.png', serialized: 'https://example.com:443/a.png' },
  { value: 'http://[::1]:8080/a.png', serialized: 'http://[::1]:8080/a.png' },
  ...[
    'https://vídụ.vn/ảnh.png?q=TiếngViệt#ảnh😀',
    'https://[2001:db8::1]/a%7Cb.png?q=%5Bavatar%5D#%23part',
    'https://example.com/a%7Cb.png',
    'https://example.com/%7Bavatar%7D%5B1%5D%5C%5E%60%22%3C%3E.png',
    'https://example.com/%25%20%2f?next=%2Fảnh%3Fq%3D1#%7c',
    "https://example.com/azAZ09-._~!$&'()*+,;=:@/?q=:/?@!$&'()*+,;=#part/?",
    'http://example.com', 'https://example.com?avatar=1', 'https://example.com#avatar',
    'https://example.com/a?#',
  ].map(value => ({ value, serialized: value })),
  ...['[', ']'].flatMap(character => [
    `https://example.com/a.png?size=${character}`,
    `https://example.com/a.png#preview${character}`,
  ]).map(value => ({ value, serialized: value })),
  ...['[', ']'].flatMap(character => [
    `https://exam${character}ple.com/a.png`,
    `https://example.com:4${character}43/a.png`,
    `https://example.com/a${character}z.png`,
    `https://example.com/a${character}z.png?size[width]=100#preview[1]`,
    `https://[::1]/a${character}z.png?size[width]=100#preview[1]`,
  ]).map(value => ({ value, serialized: null })),
  ...['{', '}', '|', '^', '"', '<', '>', '\\', '`', ' ', '\t', '\n', '\r', '\u0000', '\u0001', '%', '%2', '%zz', '%2G', '%G2', '%ＦＦ'].flatMap(character => [
    `https://example.com/a${character}z.png`,
    `https://example.com/a?q=a${character}z`,
    `https://example.com/a#part${character}z`,
  ]).map(value => ({ value, serialized: null })),
  ...[
    'https://example.com/%', 'https://example.com/%2', 'https://example.com/%20%',
    'https://example.com/a#b#c', 'https://example.com/a?b#c#d',
    'javascript:alert(1)', 'data:image/png;base64,x', '//example.com/a', 'https:example.com/a',
    'https://example.com\\a.png', 'https:\\example.com/a', 'https://', 'https:///a.png',
    'https:////example.com/a', 'https://?q=example.com', 'https://#example.com',
    'https://user:pass@example.com/a', 'https://user@example.com/a', 'https://@example.com/a',
    'https://example.com:/a', 'https://example.com:bad/a', 'https://example.com:65536/a',
    'https://[::1/a', 'https://%65xample.com/a', 'https://example.com/a\n',
    'https://example.com/a\u0001.png', 'https://example.com/a\0.png', ' https://example.com/a', 'not a URL',
  ].map(value => ({ value, serialized: null })),
]
