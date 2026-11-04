export const invalidTextCases = [
  { name: 'NUL', character: '\u0000' },
  { name: 'lone high surrogate', character: '\uD800' },
  { name: 'lone low surrogate', character: '\uDC00' },
]

export const profileTextCases = [
  { field: 'fullName', label: 'Full name', value: 'Nguyễn An' },
  { field: 'avatarUrl', label: 'Avatar URL', value: 'https://example.com/avatar.png' },
  { field: 'bio', label: 'Bio', value: 'Một dòng\nDòng thứ hai 😀' },
  { field: 'phoneNumber', label: 'Phone number', value: '+0012345' },
  { field: 'dateOfBirth', label: 'Date of birth', value: '2000-02-29' },
  { field: 'locale', label: 'Locale', value: 'vi-VN' },
  { field: 'timezone', label: 'Timezone', value: 'Asia/Ho_Chi_Minh' },
] as const
