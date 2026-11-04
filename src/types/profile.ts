export const profileFields = ['fullName', 'avatarUrl', 'bio', 'phoneNumber', 'dateOfBirth', 'locale', 'timezone'] as const
export type ProfileField = typeof profileFields[number]
export type ProfileFormValues = Record<ProfileField, string>
export type ProfileChanges = Partial<ProfileFormValues>
export type ProfileChangeResult =
  | { kind: 'unchanged' }
  | { kind: 'changed'; changes: ProfileChanges }
  | { kind: 'invalid'; errors: Partial<Record<ProfileField, string>> }
