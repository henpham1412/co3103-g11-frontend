export interface UpdateProfileRequestDto {
  full_name?: string
  avatar_url?: string | null
  bio?: string | null
  phone_number?: string | null
  date_of_birth?: string | null
  locale?: string | null
  timezone?: string | null
}
